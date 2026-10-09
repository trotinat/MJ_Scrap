import "server-only";
import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  dealMatches,
  getAppSettings,
  getDb,
  notifications,
  priceHistory,
  productOffers,
  products,
  scrapingErrors,
  scrapingRuns,
  searchCriteria,
  workerStatus,
} from "@mdw/database";
import { DEFAULT_SCRAPE_TIMES, nextScheduledRuns } from "@mdw/shared";

const db = () => getDb();

/* ---------------------------------------------------------------- dashboard */

export async function dashboardStats() {
  const since24h = new Date(Date.now() - 24 * 3600_000);
  const [[offersRow], [criteriaRow], [newDealsRow], targetRows, dropRows, [lastSuccess], [lastRun], worker, notifStats, recentNotifs] =
    await Promise.all([
      db().select({ n: count() }).from(productOffers).where(inArray(productOffers.status, ["active", "unavailable"])),
      db().select({ n: count() }).from(searchCriteria).where(eq(searchCriteria.enabled, true)),
      db()
        .select({ n: count() })
        .from(dealMatches)
        .where(and(eq(dealMatches.isMatch, true), gte(dealMatches.firstMatchedAt, since24h))),
      db().execute<{ n: number }>(sql`
        select count(*)::int as n from deal_matches m
        join search_criteria c on c.id = m.criterion_id
        where m.is_match and c.enabled and (c.filters->>'targetPrice') is not null
          and m.price_cents <= round((c.filters->>'targetPrice')::numeric * 100)`),
      db().execute<{ n: number }>(sql`
        select count(*)::int as n from (
          select ph.offer_id, ph.price_cents, ph.observed_at,
                 lag(ph.price_cents) over (partition by ph.offer_id order by ph.observed_at, ph.id) as prev
          from price_history ph
          where ph.observed_at > now() - interval '8 days'
        ) x where x.observed_at > ${since24h} and x.prev is not null and x.price_cents <= x.prev * 0.95`),
      db()
        .select()
        .from(scrapingRuns)
        .where(inArray(scrapingRuns.status, ["success", "partial"]))
        .orderBy(desc(scrapingRuns.startedAt))
        .limit(1),
      db().select().from(scrapingRuns).orderBy(desc(scrapingRuns.startedAt)).limit(1),
      db().select().from(workerStatus).orderBy(desc(workerStatus.heartbeatAt)).limit(1),
      db().execute<{ status: string; n: number }>(sql`
        select status, count(*)::int as n from notifications where created_at > now() - interval '7 days' group by status`),
      db().select().from(notifications).orderBy(desc(notifications.createdAt)).limit(5),
    ]);

  const w = worker[0] ?? null;
  const nextRun = w?.nextRunAt ?? nextScheduledRuns(process.env.SCRAPE_TIMES ?? DEFAULT_SCRAPE_TIMES, 1)[0] ?? null;
  return {
    offers: Number(offersRow?.n ?? 0),
    activeCriteria: Number(criteriaRow?.n ?? 0),
    newDeals24h: Number(newDealsRow?.n ?? 0),
    targetReached: Number(targetRows.rows[0]?.n ?? 0),
    drops24h: Number(dropRows.rows[0]?.n ?? 0),
    lastSuccess: lastSuccess ?? null,
    lastRun: lastRun ?? null,
    worker: w,
    workerAlive: w ? Date.now() - w.heartbeatAt.getTime() < 2 * 60_000 : false,
    nextRun,
    notifStats: Object.fromEntries(notifStats.rows.map((r) => [r.status, Number(r.n)])) as Record<string, number>,
    recentNotifs,
  };
}

/* ------------------------------------------------------------------- deals */

export interface DealFilters {
  criterionId?: string;
  category?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  minScore?: number;
  stock?: "in_stock" | "out_of_stock" | "unknown";
  q?: string;
  sort?: "price" | "score" | "drop" | "recent";
  page?: number;
  pageSize?: number;
}

export type DealRow = {
  offer_id: string;
  product_id: string;
  title: string;
  url: string;
  image_url: string | null;
  brand: string | null;
  category_path: string | null;
  seller: string | null;
  current_price_cents: number;
  original_price_cents: number | null;
  advertised_discount_pct: number | null;
  stock_status: string;
  offer_status: string;
  last_success_at: string | null;
  prev_price_cents: number | null;
  min_price_cents: number | null;
  drop_pct: number | null;
  score: number;
  matches: { id: string; name: string; score: number; dealClass: string; explanation: string }[];
};

export async function listDeals(f: DealFilters): Promise<{ rows: DealRow[]; total: number }> {
  const pageSize = Math.min(f.pageSize ?? 24, 5000);
  const page = Math.max(1, f.page ?? 1);
  const where = [sql`m.is_match = true`, sql`c.enabled = true`];
  if (f.criterionId) where.push(sql`m.criterion_id = ${f.criterionId}`);
  if (f.category) where.push(sql`p.category_path like ${`${f.category}%`}`);
  if (f.brand) where.push(sql`p.brand ilike ${f.brand}`);
  if (f.minPrice !== undefined) where.push(sql`o.current_price_cents >= ${Math.round(f.minPrice * 100)}`);
  if (f.maxPrice !== undefined) where.push(sql`o.current_price_cents <= ${Math.round(f.maxPrice * 100)}`);
  if (f.stock) where.push(sql`o.stock_status = ${f.stock}`);
  if (f.q) where.push(sql`o.title ilike ${`%${f.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`}`);
  const having = f.minScore !== undefined ? sql`having max(m.score) >= ${f.minScore}` : sql``;
  const order =
    f.sort === "price"
      ? sql`o.current_price_cents asc`
      : f.sort === "drop"
        ? sql`drop_pct asc nulls last, max(m.score) desc`
        : f.sort === "recent"
          ? sql`max(m.first_matched_at) desc nulls last`
          : sql`max(m.score) desc, o.current_price_cents asc`;

  const base = sql`
    from deal_matches m
    join product_offers o on o.id = m.offer_id
    join products p on p.id = o.product_id
    join search_criteria c on c.id = m.criterion_id
    left join lateral (
      select ph.price_cents from price_history ph where ph.offer_id = o.id
      order by ph.observed_at desc, ph.id desc offset 1 limit 1
    ) prev on true
    where ${sql.join(where, sql` and `)}
    group by o.id, p.id, prev.price_cents
    ${having}`;

  const rows = await db().execute<DealRow>(sql`
    select o.id as offer_id, p.id as product_id, o.title, o.url, p.image_url, p.brand, p.category_path, o.seller,
      o.current_price_cents, o.original_price_cents, o.advertised_discount_pct::float as advertised_discount_pct,
      o.stock_status, o.status as offer_status, o.last_success_at, prev.price_cents as prev_price_cents, o.min_price_cents,
      case when prev.price_cents > 0 then round(((o.current_price_cents - prev.price_cents)::numeric / prev.price_cents) * 1000) / 10 end::float as drop_pct,
      max(m.score)::int as score,
      json_agg(json_build_object('id', c.id, 'name', c.name, 'score', m.score, 'dealClass', m.deal_class, 'explanation', m.explanation) order by m.score desc) as matches
    ${base}
    order by ${order}
    limit ${pageSize} offset ${(page - 1) * pageSize}`);
  const [totalRow] = (await db().execute<{ n: number }>(sql`select count(*)::int as n from (select o.id ${base}) t`)).rows;
  return { rows: rows.rows, total: Number(totalRow?.n ?? 0) };
}

export async function dealFacets() {
  const [brands, categories, criteria] = await Promise.all([
    db().execute<{ brand: string }>(sql`
      select distinct p.brand from products p join product_offers o on o.product_id = p.id
      join deal_matches m on m.offer_id = o.id and m.is_match where p.brand is not null order by 1`),
    db().execute<{ category_path: string }>(sql`
      select distinct p.category_path from products p where p.category_path is not null order by 1`),
    db().select({ id: searchCriteria.id, name: searchCriteria.name, enabled: searchCriteria.enabled }).from(searchCriteria).orderBy(searchCriteria.name),
  ]);
  return { brands: brands.rows.map((r) => r.brand), categories: categories.rows.map((r) => r.category_path), criteria };
}

/* ----------------------------------------------------------------- product */

export async function offerDetail(offerId: string) {
  const [row] = await db()
    .select({ offer: productOffers, product: products })
    .from(productOffers)
    .innerJoin(products, eq(products.id, productOffers.productId))
    .where(eq(productOffers.id, offerId))
    .limit(1);
  if (!row) return null;
  const [history, matches, siblings] = await Promise.all([
    db()
      .select()
      .from(priceHistory)
      .where(eq(priceHistory.offerId, offerId))
      .orderBy(priceHistory.observedAt, priceHistory.id),
    db()
      .select({ match: dealMatches, criterion: { id: searchCriteria.id, name: searchCriteria.name, enabled: searchCriteria.enabled } })
      .from(dealMatches)
      .innerJoin(searchCriteria, eq(searchCriteria.id, dealMatches.criterionId))
      .where(eq(dealMatches.offerId, offerId))
      .orderBy(desc(dealMatches.score)),
    db()
      .select()
      .from(productOffers)
      .where(and(eq(productOffers.productId, row.product.id), sql`${productOffers.id} <> ${offerId}`)),
  ]);
  return { ...row, history, matches, siblings };
}

/** Offers of the same products for the comparison view. */
export async function offersForCompare(ids: string[]) {
  if (ids.length === 0) return [];
  return db()
    .select({ offer: productOffers, product: products })
    .from(productOffers)
    .innerJoin(products, eq(products.id, productOffers.productId))
    .where(inArray(productOffers.id, ids.slice(0, 4)));
}

/* ----------------------------------------------------------- price history */

export async function recentPriceChanges(q?: string, limit = 100) {
  const filter = q ? sql`and o.title ilike ${`%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`}` : sql``;
  const res = await db().execute<{
    offer_id: string;
    title: string;
    seller: string | null;
    price_cents: number;
    prev: number;
    observed_at: string;
    min_price_cents: number | null;
    stock_status: string;
  }>(sql`
    select x.offer_id, o.title, o.seller, x.price_cents, x.prev, x.observed_at, o.min_price_cents, x.stock_status
    from (
      select ph.*, lag(ph.price_cents) over (partition by ph.offer_id order by ph.observed_at, ph.id) as prev
      from price_history ph
    ) x
    join product_offers o on o.id = x.offer_id
    where x.prev is not null and x.prev <> x.price_cents ${filter}
    order by x.observed_at desc
    limit ${limit}`);
  return res.rows;
}

export async function trackedOffers(q?: string, limit = 100) {
  const filter = q ? sql`where o.title ilike ${`%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`}` : sql``;
  const res = await db().execute<{
    id: string;
    title: string;
    current_price_cents: number | null;
    min_price_cents: number | null;
    observations: number;
    first_seen_at: string;
    last_success_at: string | null;
    status: string;
  }>(sql`
    select o.id, o.title, o.current_price_cents, o.min_price_cents, o.first_seen_at, o.last_success_at, o.status,
      (select count(*)::int from price_history ph where ph.offer_id = o.id) as observations
    from product_offers o ${filter}
    order by o.last_seen_at desc
    limit ${limit}`);
  return res.rows;
}

/* ------------------------------------------------------------------- runs */

export async function listRuns(limit = 50) {
  const runs = await db().select().from(scrapingRuns).orderBy(desc(scrapingRuns.startedAt)).limit(limit);
  const ids = runs.map((r) => r.id);
  const errors = ids.length
    ? await db().select().from(scrapingErrors).where(inArray(scrapingErrors.runId, ids)).orderBy(scrapingErrors.id)
    : [];
  const byRun = new Map<string, typeof errors>();
  for (const e of errors) byRun.set(e.runId, [...(byRun.get(e.runId) ?? []), e]);
  return runs.map((r) => ({ ...r, errors: byRun.get(r.id) ?? [] }));
}

/* ---------------------------------------------------------- notifications */

export async function listNotifications(status?: string, criterionId?: string, limit = 100) {
  const where = [];
  if (status) where.push(eq(notifications.status, status as "pending"));
  if (criterionId) where.push(eq(notifications.criterionId, criterionId));
  return db()
    .select({
      n: notifications,
      criterionName: searchCriteria.name,
      offerTitle: productOffers.title,
      offerId: productOffers.id,
    })
    .from(notifications)
    .leftJoin(searchCriteria, eq(searchCriteria.id, notifications.criterionId))
    .leftJoin(productOffers, eq(productOffers.id, notifications.offerId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

/* -------------------------------------------------------------- criterion */

export async function criterionMatches(criterionId: string, limit = 30) {
  return db()
    .select({ match: dealMatches, offer: productOffers, product: { imageUrl: products.imageUrl, brand: products.brand } })
    .from(dealMatches)
    .innerJoin(productOffers, eq(productOffers.id, dealMatches.offerId))
    .innerJoin(products, eq(products.id, productOffers.productId))
    .where(and(eq(dealMatches.criterionId, criterionId), eq(dealMatches.isMatch, true)))
    .orderBy(desc(dealMatches.score))
    .limit(limit);
}

export async function criteriaSummaries() {
  const res = await db().execute<{ criterion_id: string; matches: number; best_score: number | null; last_notified: string | null }>(sql`
    select c.id as criterion_id,
      (select count(*)::int from deal_matches m where m.criterion_id = c.id and m.is_match) as matches,
      (select max(score) from deal_matches m where m.criterion_id = c.id and m.is_match) as best_score,
      (select max(created_at) from notifications n where n.criterion_id = c.id) as last_notified
    from search_criteria c`);
  return new Map(res.rows.map((r) => [r.criterion_id, r]));
}

/* ------------------------------------------------------------------ admin */

export async function systemHealth() {
  const started = Date.now();
  let dbOk = false;
  let version = "";
  let size = "";
  try {
    const r = await db().execute<{ version: string; size: string }>(
      sql`select version() as version, pg_size_pretty(pg_database_size(current_database())) as size`,
    );
    version = r.rows[0]?.version ?? "";
    size = r.rows[0]?.size ?? "";
    dbOk = true;
  } catch {
    dbOk = false;
  }
  const latencyMs = Date.now() - started;
  if (!dbOk) return { dbOk, latencyMs, version, size, workers: [], counts: {}, recentErrors: [], settings: null };
  const [workers, countsRes, recentErrors, settings] = await Promise.all([
    db().select().from(workerStatus).orderBy(desc(workerStatus.heartbeatAt)),
    db().execute<Record<string, number>>(sql`
      select (select count(*)::int from products) as products,
             (select count(*)::int from product_offers) as offers,
             (select count(*)::int from price_history) as observations,
             (select count(*)::int from deal_matches where is_match) as matches,
             (select count(*)::int from notifications) as notifications,
             (select count(*)::int from notifications where status in ('pending','failed')) as pending_notifications,
             (select count(*)::int from notifications where status = 'dead') as dead_notifications,
             (select count(*)::int from scraping_runs) as runs`),
    db().select().from(scrapingErrors).orderBy(desc(scrapingErrors.id)).limit(15),
    getAppSettings(db()),
  ]);
  return { dbOk, latencyMs, version, size, workers, counts: countsRes.rows[0] ?? {}, recentErrors, settings };
}
