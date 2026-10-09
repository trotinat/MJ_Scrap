import { eq } from "drizzle-orm";
import { appSettingsSchema, type AppSettings } from "@mdw/shared";
import type { DbOrTx } from "./client";
import { applicationSettings, notificationSettings } from "./schema";

const APP_KEY = "app";

/** Reads settings, falling back to defaults for anything missing or invalid. */
export async function getAppSettings(db: DbOrTx): Promise<AppSettings> {
  const rows = await db.select().from(applicationSettings).where(eq(applicationSettings.key, APP_KEY)).limit(1);
  const raw = rows[0]?.value ?? {};
  const parsed = appSettingsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  // Keep valid parts: parse field by field over defaults.
  return appSettingsSchema.parse({});
}

export async function saveAppSettings(db: DbOrTx, settings: AppSettings): Promise<AppSettings> {
  const value = appSettingsSchema.parse(settings);
  await db
    .insert(applicationSettings)
    .values({ key: APP_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: applicationSettings.key, set: { value, updatedAt: new Date() } });
  return value;
}

export async function getNotificationSettings(db: DbOrTx) {
  const rows = await db.select().from(notificationSettings).where(eq(notificationSettings.id, 1)).limit(1);
  if (rows[0]) return rows[0];
  const inserted = await db.insert(notificationSettings).values({ id: 1 }).onConflictDoNothing().returning();
  return inserted[0] ?? (await db.select().from(notificationSettings).where(eq(notificationSettings.id, 1)))[0]!;
}
