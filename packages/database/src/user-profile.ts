import { eq } from "drizzle-orm";
import { shopperProfileSchema, type HiddenStyle, type ShopperProfile } from "@mdw/shared";
import type { DbOrTx } from "./client";
import { userProfiles } from "./schema";

export async function getUserProfile(db: DbOrTx, userId: string): Promise<ShopperProfile> {
  const [row] = await db.select({ profile: userProfiles.profile }).from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  return shopperProfileSchema.parse(row?.profile ?? {});
}

export async function saveUserProfile(db: DbOrTx, userId: string, input: ShopperProfile): Promise<ShopperProfile> {
  const profile = shopperProfileSchema.parse(input);
  await db.insert(userProfiles).values({ userId, profile }).onConflictDoUpdate({
    target: userProfiles.userId,
    set: { profile, updatedAt: new Date() },
  });
  return profile;
}

/**
 * "Pas mon style" choices are applied when results are read, so they must not
 * make saved matches stale: updated_at is left untouched (a first row starts at the epoch).
 */
export async function updateHiddenStyles(db: DbOrTx, userId: string, update: (styles: HiddenStyle[]) => HiddenStyle[]): Promise<HiddenStyle[]> {
  const current = await getUserProfile(db, userId);
  const profile = shopperProfileSchema.parse({ ...current, hiddenStyles: update(current.hiddenStyles) });
  await db.insert(userProfiles).values({ userId, profile, updatedAt: new Date(0) }).onConflictDoUpdate({
    target: userProfiles.userId,
    set: { profile },
  });
  return profile.hiddenStyles;
}
