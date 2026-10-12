import { Cron } from "croner";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import {
  countActiveSubscribers,
  getNotificationSettings,
  getAppSettings,
  purgeExpiredSessions,
  runRequests,
  scrapingRuns,
  workerStatus,
  type RunTrigger,
} from "@mdw/database";
import { processOutbox } from "@mdw/notifications";
import { previousScheduledRun, SCHEDULE_TIMEZONE, scheduleTimesToPatterns } from "@mdw/shared";
import type { PipelineDeps, RunOutcome } from "./pipeline";

export interface SchedulerOptions {
  scheduleTimes: string;
  catchUpWindowHours: number;
  outboxIntervalSeconds: number;
  version: string;
  /** Builds fresh deps (a new site adapter) for every run. */
  makeDeps: () => PipelineDeps;
  run: (deps: PipelineDeps, trigger: RunTrigger, scheduledFor: Date | null) => Promise<RunOutcome>;
}

/**
 * Owns every timer of the worker:
 *  - croner jobs at the configured Africa/Casablanca times (DST and Ramadan
 *    offsets come from the IANA tz database shipped with Node's ICU);
 *  - catch-up after downtime: if the worker was down at a scheduled time and
 *    comes back within the window, the missed run is executed once;
 *  - polling of manual "run now" requests from the dashboard;
 *  - the Telegram outbox retry loop and a heartbeat for health checks.
 */
export class Scheduler {
  private jobs: Cron[] = [];
  private timers: NodeJS.Timeout[] = [];
  private running: Promise<unknown> | null = null;
  private stopped = false;
  readonly startedAt = new Date();

  constructor(
    private readonly baseDeps: PipelineDeps,
    private readonly opts: SchedulerOptions,
  ) {}

  get busy(): boolean {
    return this.running !== null;
  }

  nextRunAt(): Date | null {
    const next = this.jobs.map((j) => j.nextRun()).filter((d): d is Date => d instanceof Date);
    return next.sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  }

  async start(): Promise<void> {
    const log = this.baseDeps.logger;
    for (const pattern of scheduleTimesToPatterns(this.opts.scheduleTimes)) {
      const job = new Cron(
        pattern,
        { timezone: SCHEDULE_TIMEZONE, protect: true, catch: (err) => log.error({ err: String(err) }, "erreur du planificateur"), name: `scrape ${pattern}` },
        () => {
          const scheduledFor = new Date();
          scheduledFor.setSeconds(0, 0);
          void this.trigger("schedule", scheduledFor);
        },
      );
      this.jobs.push(job);
    }
    log.info({ times: this.opts.scheduleTimes, timezone: SCHEDULE_TIMEZONE, nextRunAt: this.nextRunAt()?.toISOString() }, "planificateur démarré");

    await this.heartbeat();
    this.timers.push(setInterval(() => void this.heartbeat(), 30_000));
    this.timers.push(setInterval(() => void this.pollRequests(), 15_000));
    this.timers.push(setInterval(() => void this.flushOutbox(), this.opts.outboxIntervalSeconds * 1000));
    this.timers.push(setInterval(() => void purgeExpiredSessions(this.baseDeps.db).catch(() => undefined), 6 * 3600_000));
    await this.catchUp();
  }

  /** Runs a scrape unless one is already running in this process. */
  async trigger(trigger: RunTrigger, scheduledFor: Date | null = null): Promise<RunOutcome | null> {
    if (this.stopped) return null;
    if (this.running) {
      this.baseDeps.logger.warn({ trigger }, "collecte déjà en cours dans ce processus : déclenchement ignoré");
      return null;
    }
    const p = this.opts
      .run(this.opts.makeDeps(), trigger, scheduledFor)
      .catch((err) => {
        this.baseDeps.logger.error({ err: (err as Error).message }, "échec de la collecte");
        return null;
      })
      .finally(() => {
        this.running = null;
        void this.heartbeat();
      });
    this.running = p;
    return p;
  }

  /** Executes a missed scheduled run if the worker was down at that time. */
  async catchUp(now = new Date()): Promise<boolean> {
    if (this.opts.catchUpWindowHours <= 0) return false;
    const prev = previousScheduledRun(this.opts.scheduleTimes, now);
    if (!prev) return false;
    if (now.getTime() - prev.getTime() > this.opts.catchUpWindowHours * 3600_000) return false;
    const [existing] = await this.baseDeps.db
      .select({ id: scrapingRuns.id })
      .from(scrapingRuns)
      .where(and(gte(scrapingRuns.startedAt, prev), inArray(scrapingRuns.status, ["running", "success", "partial", "failed"])))
      .limit(1);
    if (existing) return false;
    this.baseDeps.logger.info({ missed: prev.toISOString() }, "rattrapage d'une collecte manquée");
    void this.trigger("catchup", prev);
    return true;
  }

  async pollRequests(): Promise<void> {
    if (this.running || this.stopped) return;
    try {
      const [req] = await this.baseDeps.db
        .select()
        .from(runRequests)
        .where(eq(runRequests.status, "pending"))
        .orderBy(asc(runRequests.createdAt))
        .limit(1);
      if (!req) return;
      await this.baseDeps.db.update(runRequests).set({ status: "picked" }).where(eq(runRequests.status, "pending"));
      const outcome = await this.trigger("manual");
      await this.baseDeps.db
        .update(runRequests)
        .set({ status: "done", runId: outcome?.runId ?? null })
        .where(eq(runRequests.status, "picked"));
    } catch (err) {
      this.baseDeps.logger.error({ err: (err as Error).message }, "lecture des demandes de collecte impossible");
    }
  }

  async flushOutbox(): Promise<void> {
    if (!this.baseDeps.telegram || this.stopped) return;
    try {
      const ns = await getNotificationSettings(this.baseDeps.db);
      const app = await getAppSettings(this.baseDeps.db);
      if (!ns.enabled || !app.notificationsEnabled) return;
      // The Telegram bot owns delivery when it has subscribers (see pipeline).
      if ((await countActiveSubscribers(this.baseDeps.db)) > 0) return;
      await processOutbox(this.baseDeps.db, this.baseDeps.telegram, {
        limit: 20,
        maxAttempts: ns.maxAttempts,
        sendImages: ns.sendImages,
        logger: this.baseDeps.logger,
      });
    } catch (err) {
      this.baseDeps.logger.error({ err: (err as Error).message }, "boucle d'envoi Telegram en échec");
    }
  }

  async heartbeat(): Promise<void> {
    try {
      const values = {
        id: this.baseDeps.workerId,
        startedAt: this.startedAt,
        heartbeatAt: new Date(),
        version: this.opts.version,
        nextRunAt: this.nextRunAt(),
        scheduleTimes: this.opts.scheduleTimes,
      };
      await this.baseDeps.db
        .insert(workerStatus)
        .values(values)
        .onConflictDoUpdate({
          target: workerStatus.id,
          set: { heartbeatAt: values.heartbeatAt, nextRunAt: values.nextRunAt, version: values.version, startedAt: values.startedAt, scheduleTimes: values.scheduleTimes },
        });
    } catch (err) {
      this.baseDeps.logger.error({ err: (err as Error).message }, "heartbeat impossible");
    }
  }

  /** Stops timers and waits (bounded) for the current run to finish. */
  async stop(graceMs = 45_000): Promise<void> {
    this.stopped = true;
    for (const j of this.jobs) j.stop();
    for (const t of this.timers) clearInterval(t);
    if (this.running) {
      this.baseDeps.logger.info("arrêt : attente de la fin de la collecte en cours");
      await Promise.race([this.running, new Promise((r) => setTimeout(r, graceMs))]);
    }
  }
}
