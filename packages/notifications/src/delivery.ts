import { and, eq, inArray, lte, or } from "drizzle-orm";
import {
  listUserCriterionIds,
  notificationAttempts,
  notifications,
  setSubscriberStatus,
  type Db,
  type NotificationEvent,
  type Subscriber,
} from "@mdw/database";
import { backoffMs } from "./outbox";
import { TelegramClient, TelegramError } from "./telegram";

/**
 * The only events delivered to subscribers: a new match and price changes.
 * Kept in sync with scoring's USER_NOTIFY_EVENTS (duplicated here to avoid a
 * package dependency on @mdw/scoring). "test" is always delivered.
 */
const DELIVERABLE_EVENTS: NotificationEvent[] = ["new_match", "price_drop", "target_reached"];

export interface DeliverOptions {
  botToken: string;
  limit?: number;
  maxAttempts?: number;
  sendImages?: boolean;
  now?: () => Date;
  logger?: { info: (o: object, m?: string) => void; warn: (o: object, m?: string) => void };
}

export interface DeliverResult {
  /** Notifications delivered to at least one active subscriber. */
  sent: number;
  failed: number;
  dead: number;
  /** Notifications dropped because they fell outside the user's searches. */
  filtered: number;
}

const LEASE_MS = 2 * 60_000;

/**
 * Delivers queued alerts to every active Telegram subscriber. Mirrors
 * processOutbox (claim with FOR UPDATE SKIP LOCKED, exponential backoff,
 * at-least-once delivery) but fans each alert out to all subscribers and
 * enforces the "only my own searches, new match + price change" rule at send
 * time as a safety net. A subscriber Telegram reports as unreachable (bot
 * blocked, chat gone) is marked "blocked" and skipped rather than blocking
 * everyone else's alerts.
 */
export async function deliverToSubscribers(db: Db, subscribers: Subscriber[], opts: DeliverOptions): Promise<DeliverResult> {
  const now = opts.now ?? (() => new Date());
  const limit = opts.limit ?? 20;
  const maxAttempts = opts.maxAttempts ?? 8;
  const result: DeliverResult = { sent: 0, failed: 0, dead: 0, filtered: 0 };

  const active = subscribers.filter((s) => s.status === "active");
  if (active.length === 0) return result;

  const userCriterionIds = await listUserCriterionIds(db);

  const claimed = await db.transaction(async (tx) => {
    const t = now();
    const due = or(
      and(inArray(notifications.status, ["pending", "failed"]), lte(notifications.nextAttemptAt, t)),
      and(eq(notifications.status, "sending"), lte(notifications.lockedUntil, t)),
    );
    const rows = await tx
      .select({ id: notifications.id })
      .from(notifications)
      .where(due)
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

  // A client per chat reuses TelegramClient's photo→text fallback.
  const clients = new Map<string, TelegramClient>();
  const clientFor = (chatId: string) => {
    let c = clients.get(chatId);
    if (!c) {
      c = new TelegramClient({ botToken: opts.botToken, chatId });
      clients.set(chatId, c);
    }
    return c;
  };
  const blocked = new Set<string>();

  for (const n of claimed) {
    // Safety net: never deliver anything outside the user's own searches.
    const deliverable =
      n.eventType === "test" || (DELIVERABLE_EVENTS.includes(n.eventType) && n.criterionId !== null && userCriterionIds.has(n.criterionId));
    if (!deliverable) {
      await db
        .update(notifications)
        .set({ status: "dead", lastError: "Filtré : hors de vos recherches", lockedUntil: null })
        .where(eq(notifications.id, n.id));
      result.filtered++;
      continue;
    }

    const attempts = n.attempts + 1;
    let firstMessageId: number | null = null;
    let transientError: string | null = null;
    let transientStatus: number | null = null;
    let retryAfterMs: number | null = null;

    for (const sub of active) {
      if (blocked.has(sub.chatId)) continue;
      try {
        const { messageId } = await clientFor(sub.chatId).sendDeal(n.payload.html, n.payload.imageUrl, opts.sendImages ?? true);
        firstMessageId ??= messageId;
      } catch (err) {
        const te = err instanceof TelegramError ? err : null;
        if (te?.permanent) {
          // This one chat is unreachable: stop sending to it, keep going for the rest.
          blocked.add(sub.chatId);
          await setSubscriberStatus(db, sub.chatId, "blocked");
          opts.logger?.warn({ chatId: sub.chatId, err: te.message }, "abonné injoignable : marqué bloqué");
        } else {
          transientError = (err as Error).message.slice(0, 1000);
          transientStatus = te?.status ?? null;
          if (te?.retryAfter) retryAfterMs = te.retryAfter * 1000;
        }
      }
    }

    if (transientError) {
      const dead = attempts >= maxAttempts;
      const delay = retryAfterMs ?? backoffMs(attempts);
      await db.transaction(async (tx) => {
        await tx
          .update(notifications)
          .set({
            status: dead ? "dead" : "failed",
            attempts,
            lastError: transientError,
            nextAttemptAt: new Date(now().getTime() + delay),
            lockedUntil: null,
          })
          .where(eq(notifications.id, n.id));
        await tx.insert(notificationAttempts).values({ notificationId: n.id, success: false, httpStatus: transientStatus, error: transientError });
      });
      if (dead) result.dead++;
      else result.failed++;
      opts.logger?.warn({ notificationId: n.id, attempts, dead, err: transientError }, "échec d'envoi Telegram");
    } else {
      // Delivered to every reachable subscriber (firstMessageId is null only if all were blocked).
      await db.transaction(async (tx) => {
        await tx
          .update(notifications)
          .set({ status: "sent", attempts, sentAt: now(), telegramMessageId: firstMessageId, lastError: null, lockedUntil: null })
          .where(eq(notifications.id, n.id));
        await tx.insert(notificationAttempts).values({ notificationId: n.id, success: true, httpStatus: 200, telegramMessageId: firstMessageId });
      });
      result.sent++;
      opts.logger?.info({ notificationId: n.id, messageId: firstMessageId }, "alerte envoyée aux abonnés");
    }
  }

  return result;
}
