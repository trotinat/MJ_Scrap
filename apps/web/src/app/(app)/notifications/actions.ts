"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, getNotificationSettings, notifications } from "@mdw/database";
import { enqueueNotification, formatTestMessage, processOutbox, retryNotification, TelegramClient, telegramConfigFromEnv } from "@mdw/notifications";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";

export async function sendTestNotification(_prev: { message?: string; ok?: boolean }): Promise<{ message?: string; ok?: boolean }> {
  await requireUser();
  const cfg = telegramConfigFromEnv();
  if (!cfg) return { ok: false, message: "TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID ne sont pas configurés sur le serveur." };
  const db = getDb();
  const id = await enqueueNotification(db, {
    dedupeKey: `test:${randomUUID()}`,
    eventType: "test",
    payload: { html: formatTestMessage(), imageUrl: null },
  });
  const ns = await getNotificationSettings(db);
  await processOutbox(db, new TelegramClient(cfg), { ids: [id!], limit: 1, maxAttempts: ns.maxAttempts });
  const [row] = await db.select().from(notifications).where(eq(notifications.id, id!));
  revalidatePath("/notifications");
  if (row?.status === "sent") return { ok: true, message: `Message de test envoyé (message_id ${row.telegramMessageId}).` };
  return { ok: false, message: `Échec de l'envoi : ${row?.lastError ?? "erreur inconnue"}` };
}

export async function retryNotificationAction(formData: FormData): Promise<void> {
  await requireUser();
  const id = z.string().uuid().parse(formData.get("id"));
  await retryNotification(getDb(), id);
  revalidatePath("/notifications");
}
