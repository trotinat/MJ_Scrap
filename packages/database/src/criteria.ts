import { and, asc, eq, sql } from "drizzle-orm";
import { ADIDAS_HOMME_EXCLUSIONS, criterionFiltersSchema, criterionInputSchema, FASHION_CRITERIA, RECOMMENDED_CRITERIA, type Criterion, type CriterionInputRaw } from "@mdw/shared";
import type { DbOrTx } from "./client";
import { applicationSettings, searchCriteria, users } from "./schema";
import { requireUserShop } from "./shops";

type Row = typeof searchCriteria.$inferSelect;

export function rowToCriterion(row: Row): Criterion {
  // Re-parse stored filters so older rows gain new defaulted fields.
  const filters = criterionFiltersSchema.safeParse(row.filters);
  return {
    id: row.id,
    ownerId: row.userId,
    shopId: row.shopId,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    notifyMode: row.notifyMode,
    notifyMinScore: row.notifyMinScore,
    minPriceDropPct: Number(row.minPriceDropPct),
    filters: filters.success ? filters.data : (row.filters as Criterion["filters"]),
  };
}

export async function listCriteria(db: DbOrTx, opts: { enabledOnly?: boolean; userId?: string; shopId?: string } = {}): Promise<Criterion[]> {
  const q = db.select().from(searchCriteria);
  const conditions = [opts.enabledOnly ? eq(searchCriteria.enabled, true) : undefined, opts.userId ? eq(searchCriteria.userId, opts.userId) : undefined,
    opts.shopId ? eq(searchCriteria.shopId, opts.shopId) : undefined,
    opts.enabledOnly ? sql`exists (select 1 from user_shops us join shops s on s.id = us.shop_id where us.user_id = ${searchCriteria.userId} and us.shop_id = ${searchCriteria.shopId} and s.active)` : undefined].filter((v) => v !== undefined);
  const rows = await q.where(conditions.length ? and(...conditions) : undefined).orderBy(asc(searchCriteria.createdAt));
  return rows.map(rowToCriterion);
}

export async function getCriterion(db: DbOrTx, id: string, userId: string): Promise<Criterion | null> {
  const rows = await db.select().from(searchCriteria).where(and(eq(searchCriteria.id, id), eq(searchCriteria.userId, userId))).limit(1);
  return rows[0] ? rowToCriterion(rows[0]) : null;
}

/** Legacy single-chat Telegram integration belongs to Houssam until chats are linked to users. */
export async function primaryUserId(db: DbOrTx): Promise<string> {
  const [owner] = await db.select({ id: users.id }).from(users)
    .orderBy(sql`case when lower(${users.email}) = 'houssam@test.com' then 0 else 1 end`, asc(users.createdAt)).limit(1);
  if (!owner) throw new Error("Créez un compte avant d'ajouter une recherche.");
  return owner.id;
}

export async function createCriterion(
  db: DbOrTx,
  input: CriterionInputRaw,
  userId: string,
  origin: "user" | "recommended" = "user",
): Promise<Criterion> {
  const v = criterionInputSchema.parse(input);
  await requireUserShop(db, userId, v.shopId);
  const [row] = await db
    .insert(searchCriteria)
    .values({
      name: v.name,
      userId,
      shopId: v.shopId,
      description: v.description,
      enabled: v.enabled,
      notifyMode: v.notifyMode,
      notifyMinScore: v.notifyMinScore,
      minPriceDropPct: v.minPriceDropPct,
      origin,
      filters: v.filters,
    })
    .returning();
  return rowToCriterion(row!);
}

/**
 * Ids of the user's own enabled searches (origin = "user"). Only these trigger
 * Telegram alerts; the seeded recommended/promo criteria feed the dashboard but
 * never notify.
 */
export async function listUserCriterionIds(db: DbOrTx): Promise<Set<string>> {
  const ownerId = await primaryUserId(db);
  const rows = await db
    .select({ id: searchCriteria.id })
    .from(searchCriteria)
    .where(and(eq(searchCriteria.origin, "user"), eq(searchCriteria.enabled, true), eq(searchCriteria.userId, ownerId)));
  return new Set(rows.map((r) => r.id));
}

/** The user's own searches (enabled, origin = "user"), e.g. for the bot's /recherches command. */
export async function listUserCriteria(db: DbOrTx): Promise<Criterion[]> {
  const ownerId = await primaryUserId(db);
  const rows = await db
    .select()
    .from(searchCriteria)
    .where(and(eq(searchCriteria.origin, "user"), eq(searchCriteria.enabled, true), eq(searchCriteria.userId, ownerId)))
    .orderBy(asc(searchCriteria.createdAt));
  return rows.map(rowToCriterion);
}

export async function updateCriterion(db: DbOrTx, id: string, input: CriterionInputRaw, userId: string): Promise<Criterion | null> {
  const v = criterionInputSchema.parse(input);
  await requireUserShop(db, userId, v.shopId);
  const [row] = await db
    .update(searchCriteria)
    .set({
      name: v.name,
      shopId: v.shopId,
      description: v.description,
      enabled: v.enabled,
      notifyMode: v.notifyMode,
      notifyMinScore: v.notifyMinScore,
      minPriceDropPct: v.minPriceDropPct,
      filters: v.filters,
      updatedAt: new Date(),
    })
    .where(and(eq(searchCriteria.id, id), eq(searchCriteria.userId, userId)))
    .returning();
  return row ? rowToCriterion(row) : null;
}

export async function setCriterionEnabled(db: DbOrTx, id: string, enabled: boolean, userId: string): Promise<void> {
  if (enabled) {
    const current = await getCriterion(db, id, userId);
    if (!current) return;
    await requireUserShop(db, userId, current.shopId);
  }
  await db.update(searchCriteria).set({ enabled, updatedAt: new Date() }).where(and(eq(searchCriteria.id, id), eq(searchCriteria.userId, userId)));
}

export async function duplicateCriterion(db: DbOrTx, id: string, userId: string): Promise<Criterion | null> {
  const c = await getCriterion(db, id, userId);
  if (!c) return null;
  return createCriterion(db, { ...c, name: `${c.name} (copie)`.slice(0, 120), enabled: false }, userId);
}

/**
 * Deletes a user's search and its matches. The underlying offer catalogue and
 * price history are shared and must remain available to other accounts.
 */
export async function deleteCriterion(db: DbOrTx, id: string, userId: string): Promise<{ offersRemoved: number }> {
  await db.delete(searchCriteria).where(and(eq(searchCriteria.id, id), eq(searchCriteria.userId, userId)));
  // Offers and price history are shared across users; deleting one search must not erase them.
  return { offersRemoved: 0 };
}

/**
 * Adds the recommended criteria whose name does not exist yet.
 * With `once`, runs a single time per database (flag in application_settings),
 * so criteria the user deleted are not re-created on every start.
 */
export async function seedRecommendedCriteria(db: DbOrTx, opts: { once?: boolean; userId?: string } = {}): Promise<number> {
  const userId = opts.userId ?? await primaryUserId(db);
  const FLAG = "recommended_criteria_seeded_v1";
  if (opts.once) {
    const done = await db.select({ key: applicationSettings.key }).from(applicationSettings).where(eq(applicationSettings.key, FLAG)).limit(1);
    if (done.length > 0) return 0;
  }
  const existing = new Set((await db.select({ name: searchCriteria.name }).from(searchCriteria).where(eq(searchCriteria.userId, userId))).map((r) => r.name.trim().toLowerCase()));
  let added = 0;
  for (const c of RECOMMENDED_CRITERIA) {
    if (existing.has(c.name.trim().toLowerCase())) continue;
    await createCriterion(db, c, userId, "recommended");
    added++;
  }
  await db
    .insert(applicationSettings)
    .values({ key: FLAG, value: { at: new Date().toISOString(), added } })
    .onConflictDoNothing();
  return added;
}

/**
 * One-time: add the men's fashion searches (hauts, pantalons, chaussures) by
 * name if missing. Its own flag means it seeds once per database, including on
 * databases that already ran the first recommended-criteria seed, and criteria
 * the user later deletes are not re-created.
 */
export async function seedFashionCriteria(db: DbOrTx): Promise<number> {
  const userId = await primaryUserId(db);
  const FLAG = "fashion_criteria_v1";
  const done = await db.select({ key: applicationSettings.key }).from(applicationSettings).where(eq(applicationSettings.key, FLAG)).limit(1);
  if (done.length > 0) return 0;
  const existing = new Set((await db.select({ name: searchCriteria.name }).from(searchCriteria).where(eq(searchCriteria.userId, userId))).map((r) => r.name.trim().toLowerCase()));
  let added = 0;
  for (const c of FASHION_CRITERIA) {
    if (existing.has(c.name.trim().toLowerCase())) continue;
    await createCriterion(db, c, userId, "recommended");
    added++;
  }
  await db.insert(applicationSettings).values({ key: FLAG, value: { at: new Date().toISOString(), added } }).onConflictDoNothing();
  return added;
}

/**
 * One-time fixes to recommended criteria already created with an older
 * definition (only adds exclusions; never removes what the user set).
 */
export async function upgradeRecommendedCriteria(db: DbOrTx): Promise<number> {
  const FLAG = "recommended_criteria_upgraded_v2";
  const done = await db.select({ key: applicationSettings.key }).from(applicationSettings).where(eq(applicationSettings.key, FLAG)).limit(1);
  if (done.length > 0) return 0;
  let changed = 0;
  const rows = await db.select().from(searchCriteria).where(eq(searchCriteria.name, RECOMMENDED_CRITERIA[0]!.name));
  for (const row of rows) {
    const c = rowToCriterion(row);
    const have = new Set(c.filters.excludedCharacteristics.map((x) => x.toLowerCase()));
    const add = ADIDAS_HOMME_EXCLUSIONS.filter((x) => !have.has(x.toLowerCase()));
    if (add.length === 0) continue;
    await db
      .update(searchCriteria)
      .set({ filters: { ...c.filters, excludedCharacteristics: [...c.filters.excludedCharacteristics, ...add] } })
      .where(eq(searchCriteria.id, row.id));
    changed++;
  }
  await db.insert(applicationSettings).values({ key: FLAG, value: { at: new Date().toISOString(), changed } }).onConflictDoNothing();
  return changed;
}
