import { eq } from "drizzle-orm";
import { shopperProfileSchema, type ShopperProfile } from "@mdw/shared";
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
