import { and, count, eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "./client";
import { applicationSettings, telegramSubscribers, type SubscriberStatus } from "./schema";

export type Subscriber = typeof telegramSubscribers.$inferSelect;

export interface RegisterSubscriberInput {
  chatId: string;
  type?: string | null;
  username?: string | null;
  firstName?: string | null;
}

/**
 * Registers (or re-activates) a chat that sent /start. Idempotent: an existing
 * paused/blocked subscriber becomes active again and its profile is refreshed.
 */
export async function registerSubscriber(db: DbOrTx, input: RegisterSubscriberInput): Promise<Subscriber> {
  const now = new Date();
  const [row] = await db
    .insert(telegramSubscribers)
    .values({
      chatId: input.chatId,
      type: input.type ?? null,
      username: input.username ?? null,
      firstName: input.firstName ?? null,
      status: "active",
      lastInteractionAt: now,
    })
    .onConflictDoUpdate({
      target: telegramSubscribers.chatId,
      set: {
        status: "active",
        type: input.type ?? null,
        username: input.username ?? null,
        firstName: input.firstName ?? null,
        updatedAt: now,
        lastInteractionAt: now,
      },
    })
    .returning();
  return row!;
}

export async function getSubscriber(db: DbOrTx, chatId: string): Promise<Subscriber | null> {
  const rows = await db.select().from(telegramSubscribers).where(eq(telegramSubscribers.chatId, chatId)).limit(1);
  return rows[0] ?? null;
}

export async function setSubscriberStatus(db: DbOrTx, chatId: string, status: SubscriberStatus): Promise<void> {
  await db
    .update(telegramSubscribers)
    .set({ status, updatedAt: new Date() })
    .where(eq(telegramSubscribers.chatId, chatId));
}

/** Records that a subscriber interacted (sent a command), without changing status. */
export async function touchSubscriber(db: DbOrTx, chatId: string): Promise<void> {
  await db
    .update(telegramSubscribers)
    .set({ lastInteractionAt: new Date() })
    .where(eq(telegramSubscribers.chatId, chatId));
}

export async function listActiveSubscribers(db: DbOrTx): Promise<Subscriber[]> {
  return db.select().from(telegramSubscribers).where(eq(telegramSubscribers.status, "active"));
}

export async function listSubscribers(db: DbOrTx): Promise<Subscriber[]> {
  return db.select().from(telegramSubscribers);
}

/** How many chats would currently receive an alert. */
export async function countActiveSubscribers(db: DbOrTx): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(telegramSubscribers)
    .where(eq(telegramSubscribers.status, "active"));
  return Number(row?.n ?? 0);
}

/* ----------------------------------------------------------------------------
 * Long-poll offset (stored in application_settings, no dedicated table needed)
 * ------------------------------------------------------------------------- */

const OFFSET_KEY = "telegram_update_offset";

export async function getBotUpdateOffset(db: DbOrTx): Promise<number> {
  const rows = await db.select().from(applicationSettings).where(eq(applicationSettings.key, OFFSET_KEY)).limit(1);
  const value = rows[0]?.value as { offset?: number } | undefined;
  return typeof value?.offset === "number" ? value.offset : 0;
}

export async function setBotUpdateOffset(db: DbOrTx, offset: number): Promise<void> {
  await db
    .insert(applicationSettings)
    .values({ key: OFFSET_KEY, value: { offset }, updatedAt: new Date() })
    .onConflictDoUpdate({ target: applicationSettings.key, set: { value: { offset }, updatedAt: new Date() } });
}

/** Used by tests/cleanups to remove a set of subscribers. */
export async function deleteSubscribers(db: DbOrTx, chatIds: string[]): Promise<void> {
  if (chatIds.length === 0) return;
  await db.delete(telegramSubscribers).where(inArray(telegramSubscribers.chatId, chatIds));
}

/** Convenience guard used by the worker to avoid double-delivery (see delivery). */
export async function hasActiveSubscriber(db: DbOrTx, chatId: string): Promise<boolean> {
  const rows = await db
    .select({ chatId: telegramSubscribers.chatId })
    .from(telegramSubscribers)
    .where(and(eq(telegramSubscribers.chatId, chatId), eq(telegramSubscribers.status, "active")))
    .limit(1);
  return rows.length > 0;
}
