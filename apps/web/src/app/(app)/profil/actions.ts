"use server";

import { revalidatePath } from "next/cache";
import { getAppSettings, getDb, saveAppSettings } from "@mdw/database";
import { shopperProfileSchema } from "@mdw/shared";
import { requireUser } from "@/lib/session";

export interface ProfileState {
  ok?: boolean;
  message?: string;
}

/** Saves the shopper profile into app settings. Other settings are preserved. */
export async function saveProfileAction(_prev: ProfileState, fd: FormData): Promise<ProfileState> {
  await requireUser();
  let raw: unknown;
  try {
    raw = JSON.parse(String(fd.get("payload") ?? "{}"));
  } catch {
    return { ok: false, message: "Formulaire invalide." };
  }
  const parsed = shopperProfileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Valeurs invalides." };
  const db = getDb();
  const current = await getAppSettings(db);
  await saveAppSettings(db, { ...current, shopperProfile: parsed.data });
  revalidatePath("/", "layout");
  return { ok: true, message: "Profil enregistré. Il s'applique à vos prochaines recherches." };
}
