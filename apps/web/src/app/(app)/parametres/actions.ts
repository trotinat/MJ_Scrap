"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { findUserByEmail, getAppSettings, getDb, notificationSettings, saveAppSettings, setUserPassword, verifyPassword } from "@mdw/database";
import { appSettingsSchema } from "@mdw/shared";
import { requireUser } from "@/lib/session";

export interface SettingsState {
  ok?: boolean;
  message?: string;
}

const num = (fd: FormData, k: string) => Number(String(fd.get(k) ?? "").replace(",", "."));

export async function saveSettingsAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  await requireUser();
  const db = getDb();
  const current = await getAppSettings(db);
  const candidate = {
    ...current,
    dealPagePaths: String(fd.get("dealPagePaths") ?? "")
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean),
    maxListingPagesPerPath: num(fd, "maxListingPagesPerPath"),
    maxDetailFetchesPerRun: num(fd, "maxDetailFetchesPerRun"),
    requestDelayMs: Math.round(num(fd, "requestDelaySeconds") * 1000),
    missingAfterRuns: num(fd, "missingAfterRuns"),
    staleAfterHours: num(fd, "staleAfterHours"),
    notificationsEnabled: fd.get("notificationsEnabled") === "on",
    weights: {
      price: num(fd, "w_price"),
      observedDrop: num(fd, "w_observedDrop"),
      advertisedDiscount: num(fd, "w_advertisedDiscount"),
      specs: num(fd, "w_specs"),
      brand: num(fd, "w_brand"),
      rating: num(fd, "w_rating"),
      seller: num(fd, "w_seller"),
      stock: num(fd, "w_stock"),
    },
    thresholds: {
      exceptional: num(fd, "t_exceptional"),
      veryGood: num(fd, "t_veryGood"),
      interesting: num(fd, "t_interesting"),
    },
  };
  const parsed = appSettingsSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`).join(" · ") };
  }
  await saveAppSettings(db, parsed.data);
  revalidatePath("/", "layout");
  return { ok: true, message: "Paramètres enregistrés. Ils s'appliquent dès la prochaine collecte." };
}

const notifSchema = z.object({
  enabled: z.boolean(),
  sendImages: z.boolean(),
  maxAttempts: z.number().int().min(1).max(20),
  maxPerRun: z.number().int().min(1).max(500),
});

export async function saveNotificationSettingsAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  await requireUser();
  const parsed = notifSchema.safeParse({
    enabled: fd.get("enabled") === "on",
    sendImages: fd.get("sendImages") === "on",
    maxAttempts: num(fd, "maxAttempts"),
    maxPerRun: num(fd, "maxPerRun"),
  });
  if (!parsed.success) return { ok: false, message: "Valeurs invalides." };
  const db = getDb();
  await db
    .insert(notificationSettings)
    .values({ id: 1, ...parsed.data, updatedAt: new Date() })
    .onConflictDoUpdate({ target: notificationSettings.id, set: { ...parsed.data, updatedAt: new Date() } });
  revalidatePath("/parametres");
  return { ok: true, message: "Paramètres de notification enregistrés." };
}

export async function changePasswordAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("next") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  if (next.length < 10) return { ok: false, message: "Le nouveau mot de passe doit contenir au moins 10 caractères." };
  if (next !== confirm) return { ok: false, message: "La confirmation ne correspond pas." };
  const db = getDb();
  const full = await findUserByEmail(db, user.email);
  if (!full || !(await verifyPassword(current, full.passwordHash))) return { ok: false, message: "Mot de passe actuel incorrect." };
  await setUserPassword(db, full.id, next);
  // All sessions were revoked, including this one: the next navigation goes to /login.
  return { ok: true, message: "Mot de passe modifié. Reconnectez-vous." };
}
