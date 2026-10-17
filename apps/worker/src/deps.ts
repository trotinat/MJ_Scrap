import { eq } from "drizzle-orm";
import type pg from "pg";
import { scrapingRuns, getAppSettings, shops, SCRAPE_LOCK_KEY, withAdvisoryLock, type Db } from "@mdw/database";
import { configureProxyFromEnv, MarjaneAdapter } from "@mdw/scraper";
import { TelegramClient, telegramConfigFromEnv } from "@mdw/notifications";
import type { WorkerConfig } from "./config";
import type { Logger } from "./logger";
import { runScrape, type PipelineDeps, type RunOutcome } from "./pipeline";

export async function buildAdapter(db: Db, config: WorkerConfig, shopId = "marjane-mall"): Promise<MarjaneAdapter> {
  if (shopId !== "marjane-mall") throw new Error(`Aucun collecteur branché pour ${shopId}.`);
  configureProxyFromEnv();
  const settings = await getAppSettings(db);
  return new MarjaneAdapter({
    userAgent: config.SCRAPER_USER_AGENT,
    minDelayMs: settings.requestDelayMs,
    timeoutMs: config.REQUEST_TIMEOUT_MS,
    maxRetries: config.MAX_RETRIES,
    respectRobots: config.RESPECT_ROBOTS ?? true,
    renderMode: config.RENDER_MODE,
    renderTimeoutMs: config.RENDER_TIMEOUT_MS,
    renderChannel: config.RENDER_BROWSER_CHANNEL,
  });
}

export function buildTelegram(): TelegramClient | null {
  const cfg = telegramConfigFromEnv();
  return cfg ? new TelegramClient(cfg) : null;
}

/**
 * Creates pipeline deps whose adapter is built lazily per run (settings such
 * as the request delay are re-read at every run, no restart needed).
 */
export function lazyDeps(db: Db, pool: pg.Pool, config: WorkerConfig, logger: Logger, shopId = "marjane-mall"): PipelineDeps {
  let adapterPromise: Promise<MarjaneAdapter> | null = null;
  const getAdapter = () => (adapterPromise ??= buildAdapter(db, config, shopId));
  return {
    db,
    pool,
    logger,
    telegram: buildTelegram(),
    workerId: config.WORKER_ID,
    adapter: {
      shopId,
      get requestCount() {
        return 0;
      },
      discover: async (p, n) => (await getAdapter()).discover(p, n),
      fetchProduct: async (u) => (await getAdapter()).fetchProduct(u),
      close: async () => {
        if (adapterPromise) await (await adapterPromise).close();
        adapterPromise = null;
      },
    },
  };
}

/** Runs every active boutique sequentially; one broken connector cannot skip the others. */
export async function runEnabledShops(
  db: Db, pool: pg.Pool, config: WorkerConfig, logger: Logger,
  trigger: "schedule" | "manual" | "catchup", scheduledFor: Date | null = null,
): Promise<RunOutcome> {
  const active = await db.select({ id: shops.id }).from(shops).where(eq(shops.active, true)).orderBy(shops.id);
  let last: RunOutcome | null = null;
  for (const shop of active) {
    try {
      last = await runScrape(lazyDeps(db, pool, config, logger, shop.id), trigger, scheduledFor);
    } catch (error) {
      logger.error({ shopId: shop.id, err: (error as Error).message }, "collecteur boutique en échec");
    }
  }
  if (!last) throw new Error("Aucune boutique active n'a pu être collectée.");
  return last;
}

/** Runs left in "running" by a crashed/killed worker are marked "interrupted". */
export async function markInterruptedRuns(db: Db, pool: pg.Pool): Promise<number> {
  const res = await withAdvisoryLock(pool, SCRAPE_LOCK_KEY, async () => {
    const rows = await db
      .update(scrapingRuns)
      .set({ status: "interrupted", finishedAt: new Date(), errorSummary: "Collecte interrompue (arrêt ou redémarrage du worker)." })
      .where(eq(scrapingRuns.status, "running"))
      .returning({ id: scrapingRuns.id });
    return rows.length;
  });
  return res.acquired ? res.value : 0;
}
