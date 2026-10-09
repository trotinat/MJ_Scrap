import { asc, eq } from "drizzle-orm";
import { criterionFiltersSchema, criterionInputSchema, RECOMMENDED_CRITERIA, type Criterion, type CriterionInputRaw } from "@mdw/shared";
import type { DbOrTx } from "./client";
import { applicationSettings, searchCriteria } from "./schema";

type Row = typeof searchCriteria.$inferSelect;

export function rowToCriterion(row: Row): Criterion {
  // Re-parse stored filters so older rows gain new defaulted fields.
  const filters = criterionFiltersSchema.safeParse(row.filters);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    notifyMode: row.notifyMode,
    notifyMinScore: row.notifyMinScore,
    minPriceDropPct: Number(row.minPriceDropPct),
    filters: filters.success ? filters.data : (row.filters as Criterion["filters"]),
  };
}

export async function listCriteria(db: DbOrTx, opts: { enabledOnly?: boolean } = {}): Promise<Criterion[]> {
  const q = db.select().from(searchCriteria);
  const rows = opts.enabledOnly
    ? await q.where(eq(searchCriteria.enabled, true)).orderBy(asc(searchCriteria.createdAt))
    : await q.orderBy(asc(searchCriteria.createdAt));
  return rows.map(rowToCriterion);
}

export async function getCriterion(db: DbOrTx, id: string): Promise<Criterion | null> {
  const rows = await db.select().from(searchCriteria).where(eq(searchCriteria.id, id)).limit(1);
  return rows[0] ? rowToCriterion(rows[0]) : null;
}

export async function createCriterion(db: DbOrTx, input: CriterionInputRaw): Promise<Criterion> {
  const v = criterionInputSchema.parse(input);
  const [row] = await db
    .insert(searchCriteria)
    .values({
      name: v.name,
      description: v.description,
      enabled: v.enabled,
      notifyMode: v.notifyMode,
      notifyMinScore: v.notifyMinScore,
      minPriceDropPct: v.minPriceDropPct,
      filters: v.filters,
    })
    .returning();
  return rowToCriterion(row!);
}

export async function updateCriterion(db: DbOrTx, id: string, input: CriterionInputRaw): Promise<Criterion | null> {
  const v = criterionInputSchema.parse(input);
  const [row] = await db
    .update(searchCriteria)
    .set({
      name: v.name,
      description: v.description,
      enabled: v.enabled,
      notifyMode: v.notifyMode,
      notifyMinScore: v.notifyMinScore,
      minPriceDropPct: v.minPriceDropPct,
      filters: v.filters,
      updatedAt: new Date(),
    })
    .where(eq(searchCriteria.id, id))
    .returning();
  return row ? rowToCriterion(row) : null;
}

export async function setCriterionEnabled(db: DbOrTx, id: string, enabled: boolean): Promise<void> {
  await db.update(searchCriteria).set({ enabled, updatedAt: new Date() }).where(eq(searchCriteria.id, id));
}

export async function duplicateCriterion(db: DbOrTx, id: string): Promise<Criterion | null> {
  const c = await getCriterion(db, id);
  if (!c) return null;
  return createCriterion(db, { ...c, name: `${c.name} (copie)`.slice(0, 120), enabled: false });
}

export async function deleteCriterion(db: DbOrTx, id: string): Promise<void> {
  await db.delete(searchCriteria).where(eq(searchCriteria.id, id));
}

/**
 * Adds the recommended criteria whose name does not exist yet.
 * With `once`, runs a single time per database (flag in application_settings),
 * so criteria the user deleted are not re-created on every start.
 */
export async function seedRecommendedCriteria(db: DbOrTx, opts: { once?: boolean } = {}): Promise<number> {
  const FLAG = "recommended_criteria_seeded_v1";
  if (opts.once) {
    const done = await db.select({ key: applicationSettings.key }).from(applicationSettings).where(eq(applicationSettings.key, FLAG)).limit(1);
    if (done.length > 0) return 0;
  }
  const existing = new Set((await db.select({ name: searchCriteria.name }).from(searchCriteria)).map((r) => r.name.trim().toLowerCase()));
  let added = 0;
  for (const c of RECOMMENDED_CRITERIA) {
    if (existing.has(c.name.trim().toLowerCase())) continue;
    await createCriterion(db, c);
    added++;
  }
  await db
    .insert(applicationSettings)
    .values({ key: FLAG, value: { at: new Date().toISOString(), added } })
    .onConflictDoNothing();
  return added;
}
