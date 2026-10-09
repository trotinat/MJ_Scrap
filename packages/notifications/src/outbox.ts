import { and, eq, inArray, lte, or } from "drizzle-orm";
import {
  notificationAttempts,
  notifications,
  type Db,
  type DbOrTx,
  type NotificationEvent,
  type NotificationPayload,
} from "@mdw/database";
import { TelegramError, type TelegramClient } from "./telegram";

export interface EnqueueInput {
  dedupeKey: string;
  eventType: NotificationEvent;
  payload: NotificationPayload;
  criterionId?: string | null;
  offerId?: string | null;
  runId?: string | null;
  priceCents?: number | null;
}

/**
 * Inserts a notification into the outbox. The unique dedupe key makes this
 * idempotent: enqueuing the same event twice (retry, crash, re-run) is a no-op.
 * Returns the id when a row was created, null when it already existed.
 */
export async function enqueueNotification(db: DbOrTx, input: EnqueueInput): Promise<string | null> {
  const rows = await db
    .insert(notifications)
    .values({
      dedupeKey: input.dedupeKey,
      eventType: input.eventType,
      payload: input.payload,
      criterionId: input.criterionId ?? null,
      offerId: input.offerId ?? null,
      runId: input.runId ?? null,
      priceCents: input.priceCents ?? null,
    })
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .returning({ id: notifications.id });
  return rows[0]?.id ?? null;
}

/** Exponential backoff: 30 s, 1 min, 2 min … capped at 1 h. */
export function backoffMs(attempts: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 3_600_000);
}

export interface ProcessOptions {
  limit?: number;
  maxAttempts?: number;
  sendImages?: boolean;
  /** Only process these notification ids (used for "send now"). */
  ids?: string[];
  now?: () => Date;
  logger?: { info: (o: object, m?: string) => void; warn: (o: object, m?: string) => void };
}

export interface ProcessResult {
  sent: number;
  failed: number;
  dead: number;
}

const LEASE_MS = 2 * 60_000;

/**
 * Claims due notifications with FOR UPDATE SKIP LOCKED (safe with several
 * processes), sends them, and records each attempt. A row stuck in "sending"
 * (process crashed mid-send) is retried once its lease expires; that is the
 * only case where Telegram may receive a duplicate (at-least-once delivery).
 */
export async function processOutbox(db: Db, client: TelegramClient, opts: ProcessOptions = {}): Promise<ProcessResult> {
  const now = opts.now ?? (() => new Date());
  const limit = opts.limit ?? 20;
  const maxAttempts = opts.maxAttempts ?? 8;
  const result: ProcessResult = { sent: 0, failed: 0, dead: 0 };

  const claimed = await db.transaction(async (tx) => {
    const t = now();
    const due = or(
      and(inArray(notifications.status, ["pending", "failed"]), lte(notifications.nextAttemptAt, t)),
      and(eq(notifications.status, "sending"), lte(notifications.lockedUntil, t)),
    );
    const where = opts.ids?.length ? and(due, inArray(notifications.id, opts.ids)) : due;
    const rows = await tx
      .select({ id: notifications.id })
      .from(notifications)
      .where(where)
      .orderBy(notifications.createdAt)
      .limit(limit)
      .for("update", { skipLocked: true });
    if (rows.length === 0) return [];
    return tx
      .update(notifications)
      .set({ status: "sending", lockedUntil: new Date(t.getTime() + LEASE_MS) })
      .where(inArray(notifications.id, rows.map((r) => r.id)))
      .returning();
  });

  for (const n of claimed) {
    const attempts = n.attempts + 1;
    try {
      const { messageId } = await client.sendDeal(n.payload.html, n.payload.imageUrl, opts.sendImages ?? true);
      await db.transaction(async (tx) => {
        await tx
          .update(notifications)
          .set({ status: "sent", attempts, sentAt: now(), telegramMessageId: messageId, lastError: null, lockedUntil: null })
          .where(eq(notifications.id, n.id));
        await tx.insert(notificationAttempts).values({ notificationId: n.id, success: true, httpStatus: 200, telegramMessageId: messageId });
      });
      result.sent++;
      opts.logger?.info({ notificationId: n.id, messageId }, "notification envoyée");
    } catch (err) {
      const te = err instanceof TelegramError ? err : null;
      const message = (err as Error).message.slice(0, 1000);
      const dead = (te?.permanent ?? false) || attempts >= maxAttempts;
      const delay = te?.retryAfter ? te.retryAfter * 1000 : backoffMs(attempts);
      await db.transaction(async (tx) => {
        await tx
          .update(notifications)
          .set({
            status: dead ? "dead" : "failed",
            attempts,
            lastError: message,
            nextAttemptAt: new Date(now().getTime() + delay),
            lockedUntil: null,
          })
          .where(eq(notifications.id, n.id));
        await tx.insert(notificationAttempts).values({ notificationId: n.id, success: false, httpStatus: te?.status ?? null, error: message });
      });
      if (dead) result.dead++;
      else result.failed++;
      opts.logger?.warn({ notificationId: n.id, attempts, dead, err: message }, "échec d'envoi Telegram");
    }
  }
  return result;
}

/** Puts a dead/failed notification back in the queue (dashboard "Réessayer"). */
export async function retryNotification(db: DbOrTx, id: string): Promise<void> {
  await db
    .update(notifications)
    .set({ status: "pending", nextAttemptAt: new Date(), attempts: 0 })
    .where(and(eq(notifications.id, id), inArray(notifications.status, ["failed", "dead"])));
}
