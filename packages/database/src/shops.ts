import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "./client";
import { shops, userShops } from "./schema";

export const MARJANE_SHOP_ID = "marjane-mall";

export async function registerShop(db: DbOrTx, input: { id: string; name: string; baseUrl: string }) {
  const url = new URL(input.baseUrl);
  if (url.protocol !== "https:" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.id)) throw new Error("Identifiant ou URL de boutique invalide.");
  const [shop] = await db.insert(shops).values({ id: input.id, name: input.name.trim(), baseUrl: url.origin, active: false }).onConflictDoNothing().returning();
  if (!shop) throw new Error("Cette boutique existe déjà.");
  return shop;
}

export async function listShops(db: DbOrTx) {
  return db.select().from(shops).orderBy(shops.name);
}

export async function setShopActive(db: DbOrTx, shopId: string, active: boolean): Promise<void> {
  const [shop] = await db.update(shops).set({ active }).where(eq(shops.id, shopId)).returning({ id: shops.id });
  if (!shop) throw new Error("Boutique inconnue.");
}

export async function listUserShops(db: DbOrTx, userId: string) {
  return db.select({ id: shops.id, name: shops.name, baseUrl: shops.baseUrl })
    .from(userShops).innerJoin(shops, eq(shops.id, userShops.shopId))
    .where(and(eq(userShops.userId, userId), eq(shops.active, true)))
    .orderBy(shops.name);
}

export async function requireUserShop(db: DbOrTx, userId: string, shopId: string): Promise<void> {
  const [shop] = await db.select({ id: shops.id }).from(userShops)
    .innerJoin(shops, eq(shops.id, userShops.shopId))
    .where(and(eq(userShops.userId, userId), eq(shops.id, shopId), eq(shops.active, true))).limit(1);
  if (!shop) throw new Error("Boutique indisponible pour ce compte.");
}

/** Provisioning entrypoint for a future admin/billing flow; never self-granted by users. */
export async function grantUserShop(db: DbOrTx, userId: string, shopId: string): Promise<void> {
  const [shop] = await db.select({ id: shops.id }).from(shops).where(and(eq(shops.id, shopId), eq(shops.active, true))).limit(1);
  if (!shop) throw new Error("Boutique inconnue ou inactive.");
  await db.insert(userShops).values({ userId, shopId }).onConflictDoNothing();
}

export async function revokeUserShop(db: DbOrTx, userId: string, shopId: string): Promise<void> {
  await db.delete(userShops).where(and(eq(userShops.userId, userId), eq(userShops.shopId, shopId)));
}
