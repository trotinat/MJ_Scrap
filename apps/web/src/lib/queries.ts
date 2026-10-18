import "server-only";
import { and, asc, count, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import {
  dealMatches,
  listUserShops,
  getAppSettings,
  getUserSettings,
  getDb,
  notifications,
  priceHistory,
  productOffers,
  products,
  scrapingErrors,
  scrapingRuns,
  shops as shopTable,
  searchCriteria,
  workerStatus,
} from "@mdw/database";
import { DEFAULT_SCRAPE_TIMES, nextScheduledRuns, fitsPromotionProfile } from "@mdw/shared";
import { requireUser } from "./session";

const db = () => getDb();

/* ---------------------------------------------------------------- dashboard */

export async function dashboardStats() {
  const userId = (await requireUser()).id;
  const since24h = new Date(Date.now() - 24 * 3600_000);
  const [[offersRow], [criteriaRow], newDealsRes, targetRows, dropRows, [lastSuccess], [lastRun], worker, notifStats, recentNotifs] =
    await Promise.all([
      db().select({ n: count() }).from(productOffers).where(and(inArray(productOffers.status, ["active", "unavailable"]), sql`exists (select 1 from user_shops us join shops s on s.id=us.shop_id where us.user_id=${userId} and us.shop_id=${productOffers.shopId} and s.active)`)),
      db().select({ n: count() }).from(searchCriteria).where(and(eq(searchCriteria.enabled, true), eq(searchCriteria.userId, userId))),
      db().execute<{ n: number }>(sql`
        select count(*)::int as n from deal_matches m
        join search_criteria c on c.id = m.criterion_id
        where m.is_match and c.enabled and c.user_id = ${userId} and m.first_matched_at >= ${since24h}`),
      db().execute<{ n: number }>(sql`
        select count(*)::int as n from deal_matches m
        join search_criteria c on c.id = m.criterion_id
        where m.is_match and c.enabled and c.user_id = ${userId} and (c.filters->>'targetPrice') is not null
          and m.price_cents <= round((c.filters->>'targetPrice')::numeric * 100)`),
      db().execute<{ n: number }>(sql`
        select count(*)::int as n from (
          select ph.offer_id, ph.price_cents, ph.observed_at,
                 lag(ph.price_cents) over (partition by ph.offer_id order by ph.observed_at, ph.id) as prev
          from price_history ph
          where ph.observed_at > now() - interval '8 days'
            and exists (select 1 from deal_matches m join search_criteria c on c.id = m.criterion_id where m.offer_id = ph.offer_id and m.is_match and c.enabled and c.user_id = ${userId})
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
        select n.status, count(*)::int as n from notifications n join search_criteria c on c.id = n.criterion_id
        where c.user_id = ${userId} and n.created_at > now() - interval '7 days' group by n.status`),
      db().select().from(notifications).innerJoin(searchCriteria, eq(searchCriteria.id, notifications.criterionId))
        .where(eq(searchCriteria.userId, userId)).orderBy(desc(notifications.createdAt)).limit(5),
    ]);

  const w = worker[0] ?? null;
  const nextRun = w?.nextRunAt ?? nextScheduledRuns(process.env.SCRAPE_TIMES ?? DEFAULT_SCRAPE_TIMES, 1)[0] ?? null;
  return {
    offers: Number(offersRow?.n ?? 0),
    activeCriteria: Number(criteriaRow?.n ?? 0),
    newDeals24h: Number(newDealsRes.rows[0]?.n ?? 0),
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
  shopId?: string;
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
  shop_id: string;
  shop_name: string;
  offer_id: string;
  product_id: string;
  title: string;
  url: string;
  image_url: string | null;
  image_urls: string[];
  brand: string | null;
  category_path: string | null;
  seller: string | null;
  current_price_cents: number;
  original_price_cents: number | null;
  advertised_discount_pct: number | null;
  stock_status: string;
  offer_status: string;
  last_success_at: string | null;
  first_seen_at: string;
  prev_price_cents: number | null;
  min_price_cents: number | null;
  drop_pct: number | null;
  score: number;
  matches: { id: string; name: string; score: number; dealClass: string; explanation: string }[];
};

export async function listDeals(f: DealFilters): Promise<{ rows: DealRow[]; total: number }> {
  const userId = (await requireUser()).id;
  const pageSize = Math.min(f.pageSize ?? 24, 5000);
  const page = Math.max(1, f.page ?? 1);
  const settings = await getAppSettings(db());
  const freshSince = new Date(Date.now() - settings.staleAfterHours * 3600_000);
  const where = [sql`m.is_match = true`, sql`c.enabled = true`, sql`c.user_id = ${userId}`, sql`c.shop_id = o.shop_id`, sql`exists (select 1 from user_shops us join shops s2 on s2.id = us.shop_id where us.user_id = ${userId} and us.shop_id = o.shop_id and s2.active)`, sql`o.status = 'active'`, sql`o.last_success_at >= ${freshSince}`,
    sql`m.last_evaluated_at >= c.updated_at`,
    sql`m.last_evaluated_at >= coalesce((select updated_at from user_profiles where user_id = c.user_id), '-infinity'::timestamptz)`,
    sql`m.last_evaluated_at >= coalesce((select updated_at from application_settings where key = 'app'), '-infinity'::timestamptz)`];
  if (f.criterionId) where.push(sql`m.criterion_id = ${f.criterionId}`);
  if (f.shopId) where.push(sql`o.shop_id = ${f.shopId}`);
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
          : sql`max(m.score) desc,
              case when prev.price_cents > o.current_price_cents then 1 else 0 end desc,
              case when o.stock_status = 'in_stock' then 1 else 0 end desc,
              o.current_price_cents asc, o.id`;

  const base = sql`
    from deal_matches m
    join product_offers o on o.id = m.offer_id
    join shops sh on sh.id = o.shop_id
    join products p on p.id = o.product_id
    join search_criteria c on c.id = m.criterion_id
    left join lateral (
      select ph.price_cents from price_history ph where ph.offer_id = o.id
      order by ph.observed_at desc, ph.id desc offset 1 limit 1
    ) prev on true
    where ${sql.join(where, sql` and `)}
    group by o.id, p.id, sh.id, prev.price_cents
    ${having}`;

  const rows = await db().execute<DealRow>(sql`
    select o.id as offer_id, o.shop_id, sh.name as shop_name, p.id as product_id, o.title, o.url, p.image_url, p.image_urls, p.brand, p.category_path, o.seller,
      o.current_price_cents, o.original_price_cents, o.advertised_discount_pct::float as advertised_discount_pct,
      o.stock_status, o.status as offer_status, o.last_success_at, o.first_seen_at, prev.price_cents as prev_price_cents, o.min_price_cents,
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
  const userId = (await requireUser()).id;
  const [brands, categories, criteria, shops] = await Promise.all([
    db().execute<{ brand: string }>(sql`
      select distinct p.brand from products p join product_offers o on o.product_id = p.id
      join deal_matches m on m.offer_id = o.id and m.is_match
      join search_criteria c on c.id = m.criterion_id and c.user_id = ${userId}
      where p.brand is not null order by 1`),
    db().execute<{ category_path: string }>(sql`
      select distinct p.category_path from products p join product_offers o on o.product_id = p.id
      join deal_matches m on m.offer_id = o.id and m.is_match
      join search_criteria c on c.id = m.criterion_id and c.user_id = ${userId}
      where p.category_path is not null order by 1`),
    db().select({ id: searchCriteria.id, name: searchCriteria.name, enabled: searchCriteria.enabled }).from(searchCriteria)
      .where(eq(searchCriteria.userId, userId)).orderBy(searchCriteria.name),
    listUserShops(db(), userId),
  ]);
  return { brands: brands.rows.map((r) => r.brand), categories: categories.rows.map((r) => r.category_path), criteria, shops };
}

/** Shared catalog for every shop assigned to the signed-in account. */
export async function shopDiscovery(opts: { shopId?: string; q?: string; sort?: "best" | "recent" | "price"; page?: number } = {}) {
  const userId = (await requireUser()).id;
  const shops = await listUserShops(db(), userId);
  const since = new Date(Date.now() - (await getAppSettings(db())).staleAfterHours * 3_600_000);
  const stats = shops.length ? await db().execute<{ shop_id: string; name: string; base_url: string; offers: number; fresh: number; last_seen: string | null }>(sql`
    select s.id as shop_id, s.name, s.base_url,
      count(o.id) filter (where o.status = 'active' and o.current_price_cents is not null)::int as offers,
      count(o.id) filter (where o.status = 'active' and o.current_price_cents is not null and o.last_success_at >= ${since})::int as fresh,
      max(o.last_success_at) as last_seen
    from shops s
    join user_shops us on us.shop_id = s.id and us.user_id = ${userId}
    left join product_offers o on o.shop_id = s.id
    where s.active = true
    group by s.id
    order by s.name
  `) : { rows: [] };
  const allowed = shops.map((s) => s.id);
  const invalidShop = Boolean(opts.shopId && !allowed.includes(opts.shopId));
  if (!allowed.length || invalidShop) return { shops: stats.rows, rows: [], total: 0, page: 1, pages: 1, invalidShop };

  const where = [inArray(productOffers.shopId, allowed), eq(productOffers.status, "active"), isNotNull(productOffers.currentPriceCents)];
  if (opts.shopId) where.push(eq(productOffers.shopId, opts.shopId));
  if (opts.q?.trim()) where.push(sql`${productOffers.title} ilike ${`%${opts.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`}`);
  const filter = and(...where);
  const pageSize = 24;
  const page = Math.max(1, Math.min(10000, Math.trunc(opts.page ?? 1)));
  const prevPrice = sql<number | null>`(select ph.price_cents from price_history ph where ph.offer_id = ${productOffers.id} order by ph.observed_at desc, ph.id desc offset 1 limit 1)`;
  const orderBy = opts.sort === "price" ? [asc(productOffers.currentPriceCents), desc(productOffers.lastSuccessAt)]
    : opts.sort === "recent" ? [desc(productOffers.lastSuccessAt)]
      : [sql`case when ${prevPrice} > ${productOffers.currentPriceCents} then (${prevPrice} - ${productOffers.currentPriceCents})::numeric / ${prevPrice} else 0 end desc`, desc(productOffers.lastSuccessAt), sql`${productOffers.advertisedDiscountPct} desc nulls last`];
  const [rows, [total]] = await Promise.all([
    db().select({
      offerId: productOffers.id, shopId: productOffers.shopId, shopName: shopTable.name,
      title: productOffers.title, url: productOffers.url, imageUrl: products.imageUrl, brand: products.brand,
      priceCents: productOffers.currentPriceCents, originalPriceCents: productOffers.originalPriceCents,
      discountPct: productOffers.advertisedDiscountPct, previousPriceCents: prevPrice,
      minPriceCents: productOffers.minPriceCents, firstSeenAt: productOffers.firstSeenAt,
      observedAt: productOffers.lastSuccessAt, stock: productOffers.stockStatus,
    }).from(productOffers).innerJoin(shopTable, eq(shopTable.id, productOffers.shopId)).innerJoin(products, eq(products.id, productOffers.productId))
      .where(filter).orderBy(...orderBy).limit(pageSize).offset((page - 1) * pageSize),
    db().select({ n: count() }).from(productOffers).where(filter),
  ]);
  const countTotal = Number(total?.n ?? 0);
  return { shops: stats.rows, rows, total: countTotal, page, pages: Math.max(1, Math.ceil(countTotal / pageSize)), invalidShop: false };
}

/* ----------------------------------------------------------------- product */

export async function offerDetail(offerId: string) {
  const userId = (await requireUser()).id;
  const [row] = await db()
    .select({ offer: productOffers, product: products })
    .from(productOffers)
    .innerJoin(products, eq(products.id, productOffers.productId))
    .where(and(eq(productOffers.id, offerId), sql`exists (select 1 from user_shops us join shops s on s.id = us.shop_id where us.user_id = ${userId} and us.shop_id = ${productOffers.shopId} and s.active)`))
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
      .where(and(eq(dealMatches.offerId, offerId), eq(searchCriteria.userId, userId)))
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
  const userId = (await requireUser()).id;
  return db()
    .select({ offer: productOffers, product: products })
    .from(productOffers)
    .innerJoin(products, eq(products.id, productOffers.productId))
    .where(and(inArray(productOffers.id, ids.slice(0, 4)), sql`exists (select 1 from user_shops us join shops s on s.id=us.shop_id where us.user_id=${userId} and us.shop_id=${productOffers.shopId} and s.active)`));
}

/* ----------------------------------------------------------- price history */

export async function recentPriceChanges(q?: string, limit = 50) {
  const userId = (await requireUser()).id;
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
    image_url: string | null;
    image_urls: string[];
  }>(sql`
    select x.offer_id, o.title, o.seller, x.price_cents, x.prev, x.observed_at, o.min_price_cents, x.stock_status, p.image_url, p.image_urls
    from (
      select ph.*, lag(ph.price_cents) over (partition by ph.offer_id order by ph.observed_at, ph.id) as prev
      from price_history ph
    ) x
    join product_offers o on o.id = x.offer_id
    join products p on p.id = o.product_id
    where x.prev is not null and x.prev <> x.price_cents ${filter}
      and exists (select 1 from user_shops us join shops s on s.id=us.shop_id where us.user_id=${userId} and us.shop_id=o.shop_id and s.active)
    order by (x.price_cents < x.prev) desc,
      case when x.prev > 0 and x.price_cents < x.prev then (x.prev - x.price_cents)::numeric / x.prev end desc nulls last,
      x.observed_at desc
    limit ${limit}`);
  return res.rows;
}

export type TrackedSort = "recent" | "drop" | "cheapest" | "observed";

export type TrackedOffer = {
  id: string;
  title: string;
  image_url: string | null;
  image_urls: string[];
  current_price_cents: number | null;
  min_price_cents: number | null;
  observations: number;
  first_seen_at: string;
  last_success_at: string | null;
  status: string;
  /** Observed prices (centimes), oldest → newest, for the sparkline. */
  spark: number[];
};

export async function trackedOffers(opts: { q?: string; sort?: TrackedSort; limit?: number } = {}): Promise<TrackedOffer[]> {
  const userId = (await requireUser()).id;
  const { q, sort = "recent" } = opts;
  const limit = Math.min(opts.limit ?? 50, 300);
  const filter = q ? sql`and o.title ilike ${`%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`}` : sql``;
  // "Closest to its lowest" first: smallest gap between current and min price.
  const order =
    sort === "cheapest"
      ? sql`o.current_price_cents asc nulls last`
      : sort === "observed"
        ? sql`observations desc`
        : sort === "drop"
          ? sql`case when o.min_price_cents > 0 and o.current_price_cents is not null
                   then (o.current_price_cents - o.min_price_cents)::numeric / o.min_price_cents end asc nulls last`
          : sql`o.last_seen_at desc`;
  const res = await db().execute<TrackedOffer>(sql`
    select o.id, o.title, p.image_url, p.image_urls, o.current_price_cents, o.min_price_cents, o.first_seen_at, o.last_success_at, o.status,
      (select count(*)::int from price_history ph where ph.offer_id = o.id) as observations,
      coalesce((
        select json_agg(x.price_cents order by x.observed_at, x.id)
        from (select price_cents, observed_at, id from price_history ph where ph.offer_id = o.id order by observed_at desc, id desc limit 40) x
      ), '[]'::json) as spark
    from product_offers o join products p on p.id=o.product_id where exists (select 1 from user_shops us join shops s on s.id=us.shop_id where us.user_id=${userId} and us.shop_id=o.shop_id and s.active) ${filter}
    order by ${order}
    limit ${limit}`);
  return res.rows;
}

/** Headline counts for the price-history page. */
export async function priceHistorySummary(q?: string) {
  const userId = (await requireUser()).id;
  const access = sql`and exists (select 1 from user_shops us join shops s on s.id=us.shop_id where us.user_id=${userId} and us.shop_id=o.shop_id and s.active)`;
  const filter = q ? sql`and o.title ilike ${`%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`}` : sql``;
  const [row] = (await db().execute<{
    tracked: number;
    observations: number;
    at_lowest: number;
    drops_7d: number;
  }>(sql`
    select
      (select count(*)::int from product_offers o where true ${access} ${filter}) as tracked,
      (select count(*)::int from price_history ph join product_offers o on o.id = ph.offer_id where true ${access} ${filter}) as observations,
      (select count(*)::int from product_offers o
         where o.current_price_cents is not null and o.min_price_cents is not null
           and o.current_price_cents <= o.min_price_cents ${access} ${filter}) as at_lowest,
      (select count(*)::int from (
         select ph.offer_id, ph.price_cents, ph.observed_at,
                lag(ph.price_cents) over (partition by ph.offer_id order by ph.observed_at, ph.id) as prev
         from price_history ph join product_offers o on o.id = ph.offer_id
         where true ${access} ${filter}
       ) x where x.observed_at > now() - interval '7 days' and x.prev is not null and x.price_cents < x.prev) as drops_7d`)).rows;
  return {
    tracked: Number(row?.tracked ?? 0),
    observations: Number(row?.observations ?? 0),
    atLowest: Number(row?.at_lowest ?? 0),
    drops7d: Number(row?.drops_7d ?? 0),
  };
}

/* ------------------------------------------------------------------- runs */

export async function listRuns(limit = 50) {
  const userId = (await requireUser()).id;
  const runs = await db().select().from(scrapingRuns).where(sql`exists (select 1 from user_shops us join shops s on s.id=us.shop_id where us.user_id=${userId} and us.shop_id=${scrapingRuns.shopId} and s.active)`).orderBy(desc(scrapingRuns.startedAt)).limit(limit);
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
  const userId = (await requireUser()).id;
  const where = [eq(searchCriteria.userId, userId), sql`exists (select 1 from user_shops us join shops s on s.id=us.shop_id where us.user_id=${userId} and us.shop_id=${searchCriteria.shopId} and s.active)`];
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
    .innerJoin(searchCriteria, eq(searchCriteria.id, notifications.criterionId))
    .leftJoin(productOffers, eq(productOffers.id, notifications.offerId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

/* -------------------------------------------------------------- criterion */

export async function criterionMatches(criterionId: string, limit = 30) {
  const userId = (await requireUser()).id;
  const settings = await getAppSettings(db());
  const freshSince = new Date(Date.now() - settings.staleAfterHours * 3600_000);
  return db()
    .select({ match: dealMatches, offer: productOffers, product: { imageUrl: products.imageUrl, brand: products.brand } })
    .from(dealMatches)
    .innerJoin(productOffers, eq(productOffers.id, dealMatches.offerId))
    .innerJoin(products, eq(products.id, productOffers.productId))
    .innerJoin(searchCriteria, eq(searchCriteria.id, dealMatches.criterionId))
    .where(and(eq(dealMatches.criterionId, criterionId), eq(searchCriteria.userId, userId), eq(dealMatches.isMatch, true), eq(searchCriteria.enabled, true),
      eq(searchCriteria.shopId, productOffers.shopId), sql`exists (select 1 from user_shops us join shops s on s.id=us.shop_id where us.user_id=${userId} and us.shop_id=${productOffers.shopId} and s.active)`,
      eq(productOffers.status, "active"), gte(productOffers.lastSuccessAt, freshSince),
      gte(dealMatches.lastEvaluatedAt, searchCriteria.updatedAt),
      sql`${dealMatches.lastEvaluatedAt} >= coalesce((select updated_at from user_profiles where user_id = ${searchCriteria.userId}), '-infinity'::timestamptz)`,
      sql`${dealMatches.lastEvaluatedAt} >= coalesce((select updated_at from application_settings where key = 'app'), '-infinity'::timestamptz)`))
    .orderBy(desc(dealMatches.score))
    .limit(limit);
}

export async function criteriaSummaries() {
  const userId = (await requireUser()).id;
  const settings = await getAppSettings(db());
  const freshSince = new Date(Date.now() - settings.staleAfterHours * 3600_000);
  const res = await db().execute<{ criterion_id: string; matches: number; best_score: number | null; last_notified: string | null }>(sql`
    select c.id as criterion_id,
      (select count(*)::int from deal_matches m join product_offers o on o.id = m.offer_id
        where m.criterion_id = c.id and m.is_match and c.enabled and o.status = 'active' and o.shop_id = c.shop_id
          and exists (select 1 from user_shops us join shops s on s.id=us.shop_id where us.user_id=${userId} and us.shop_id=o.shop_id and s.active)
          and o.last_success_at >= ${freshSince} and m.last_evaluated_at >= c.updated_at
          and m.last_evaluated_at >= coalesce((select updated_at from user_profiles where user_id = c.user_id), '-infinity'::timestamptz)
          and m.last_evaluated_at >= coalesce((select updated_at from application_settings where key = 'app'), '-infinity'::timestamptz)) as matches,
      (select max(m.score) from deal_matches m join product_offers o on o.id = m.offer_id
        where m.criterion_id = c.id and m.is_match and c.enabled and o.status = 'active' and o.shop_id = c.shop_id
          and exists (select 1 from user_shops us join shops s on s.id=us.shop_id where us.user_id=${userId} and us.shop_id=o.shop_id and s.active)
          and o.last_success_at >= ${freshSince} and m.last_evaluated_at >= c.updated_at
          and m.last_evaluated_at >= coalesce((select updated_at from user_profiles where user_id = c.user_id), '-infinity'::timestamptz)
          and m.last_evaluated_at >= coalesce((select updated_at from application_settings where key = 'app'), '-infinity'::timestamptz)) as best_score,
      (select max(created_at) from notifications n where n.criterion_id = c.id) as last_notified
    from search_criteria c where c.user_id = ${userId}`);
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

/* -------------------------------------------------------------- ventes flash */

export type FlashRow = {
  offer_id: string;
  title: string;
  url: string;
  image_url: string | null;
  image_urls: string[];
  brand: string | null;
  raw_specs: Record<string,string>;
  category_path: string | null;
  seller: string | null;
  current_price_cents: number;
  original_price_cents: number | null;
  advertised_discount_pct: number | null;
  previous_price_cents: number | null;
  min_price_cents: number | null;
  first_seen_at: Date;
  last_seen_at: Date;
  matches: { id: string; name: string; score: number }[];
};

export type FlashSort = "discount" | "price" | "drop" | "new";

/** Promotion pages that were crawled at least once, with their last successful crawl. */
export async function flashPages() {
  const userId = (await requireUser()).id;
  const rows = await db().execute<{ path: string; last_success_at: Date; item_count: number; method: string | null }>(sql`
    select lc.path, lc.last_success_at, lc.item_count, lc.method from listing_crawls lc
    where lc.shop_id = 'marjane-mall' and exists (select 1 from user_shops us join shops s on s.id=us.shop_id where us.user_id=${userId} and us.shop_id=lc.shop_id and s.active)
    order by lc.path`);
  return rows.rows.map((r) => ({ ...r, last_success_at: new Date(r.last_success_at) }));
}

/**
 * Offers currently displayed on a promotion page: seen during the last
 * successful crawl of that page (a 1-hour margin covers long runs).
 */
export async function flashOffers(path: string, opts: { sort?: FlashSort; q?: string; scope?: 'profile' | 'all' } = {}): Promise<FlashRow[]> {
  const userId = (await requireUser()).id;
  const q = opts.q?.trim() ? `%${opts.q.trim()}%` : null;
  const settings = await getUserSettings(db(), userId);
  const freshSince = new Date(Date.now() - settings.staleAfterHours * 3600_000);
  const order =
    opts.sort === "price"
      ? sql`o.current_price_cents asc`
      : opts.sort === "drop"
        ? sql`(case when prev.price_cents > 0 then (o.current_price_cents - prev.price_cents)::numeric / prev.price_cents end) asc nulls last`
        : opts.sort === "new"
          ? sql`a.first_seen_at desc`
          : sql`o.advertised_discount_pct desc nulls last`;
  const rows = await db().execute<FlashRow>(sql`
    select o.id as offer_id, o.title, o.url, p.image_url, p.image_urls, p.brand, p.raw_specs, p.category_path, o.seller,
           o.current_price_cents, o.original_price_cents, o.advertised_discount_pct::float as advertised_discount_pct,
           prev.price_cents as previous_price_cents, o.min_price_cents,
           a.first_seen_at, a.last_seen_at,
           coalesce((
             select json_agg(json_build_object('id', c.id, 'name', c.name, 'score', m.score) order by m.score desc)
             from deal_matches m join search_criteria c on c.id = m.criterion_id
             where m.offer_id = o.id and m.is_match and c.enabled and c.user_id = ${userId} and m.last_evaluated_at >= c.updated_at
               and m.last_evaluated_at >= coalesce((select updated_at from user_profiles where user_id = c.user_id), '-infinity'::timestamptz)
               and m.last_evaluated_at >= coalesce((select updated_at from application_settings where key='app'), '-infinity'::timestamptz)
           ), '[]'::json) as matches
    from listing_appearances a
    join listing_crawls lc on lc.path = a.listing_path and lc.shop_id = 'marjane-mall'
    join product_offers o on o.id = a.offer_id
    join products p on p.id = o.product_id
    left join lateral (
      select ph.price_cents from price_history ph
      where ph.offer_id = o.id
      order by ph.observed_at desc, ph.id desc offset 1 limit 1
    ) prev on true
    where a.listing_path = ${path} and o.shop_id = 'marjane-mall'
      and exists (select 1 from user_shops us join shops s on s.id=us.shop_id where us.user_id=${userId} and us.shop_id=o.shop_id and s.active)
      and o.last_success_at >= ${freshSince}
      and a.last_seen_at >= lc.last_success_at - interval '1 hour'
      and o.status = 'active'
      ${q ? sql`and (o.title ilike ${q} or p.brand ilike ${q})` : sql``}
    order by ${order}, o.title
    limit 1000`);
  return rows.rows.filter(r => opts.scope === 'all' || fitsPromotionProfile({title:r.title,brand:r.brand,rawSpecs:r.raw_specs,categoryPath:r.category_path},settings.shopperProfile)).slice(0,300);
}

/**
 * "Cette semaine": the best offers seen on any promotion page during the last
 * 7 days (one row per offer), ranked by advertised discount.
 */
export async function weeklyOffers(
  paths: string[],
  opts: { sort?: FlashSort; q?: string; requireDeal?: boolean; limit?: number; includeCampaigns?: boolean; scope?: 'profile' | 'all' } = {},
): Promise<FlashRow[]> {
  const userId = (await requireUser()).id;
  if (opts.includeCampaigns) {
    const campaigns = await flashPages();
    paths=[...new Set([...paths,...campaigns.filter(c=>+c.last_success_at>Date.now()-86400_000 && /^\/(panier-malin|trouvailles-marjane-mall|les-deals-|tout-a-moins-de-)/.test(c.path)).map(c=>c.path)])];
  }
  if (paths.length === 0) return [];
  const settings = await getUserSettings(db(), userId);
  const freshSince = new Date(Date.now() - settings.staleAfterHours * 3600_000);
  const q = opts.q?.trim() ? `%${opts.q.trim()}%` : null;
  // Promo aggregation ("Cette semaine") keeps only real deals; a clearance hub
  // ("Tout le déstockage") is already all clearance, so it shows everything.
  const requireDeal = opts.requireDeal ?? true;
  const limit = Math.min(opts.limit ?? 60, 300);
  const order =
    opts.sort === "price"
      ? sql`o.current_price_cents asc`
      : opts.sort === "drop"
        ? sql`(case when prev.price_cents > 0 then (o.current_price_cents - prev.price_cents)::numeric / prev.price_cents end) asc nulls last`
        : opts.sort === "new"
          ? sql`w.first_seen_at desc`
          : sql`o.advertised_discount_pct desc nulls last`;
  const rows = await db().execute<FlashRow>(sql`
    select o.id as offer_id, o.title, o.url, p.image_url, p.brand, p.raw_specs, p.category_path, o.seller,
           o.current_price_cents, o.original_price_cents, o.advertised_discount_pct::float as advertised_discount_pct,
           prev.price_cents as previous_price_cents, o.min_price_cents,
           w.first_seen_at, w.last_seen_at,
           coalesce((
             select json_agg(json_build_object('id', c.id, 'name', c.name, 'score', m.score) order by m.score desc)
             from deal_matches m join search_criteria c on c.id = m.criterion_id
             where m.offer_id = o.id and m.is_match and c.enabled and c.user_id = ${userId} and m.last_evaluated_at >= c.updated_at
               and m.last_evaluated_at >= coalesce((select updated_at from user_profiles where user_id = c.user_id), '-infinity'::timestamptz)
               and m.last_evaluated_at >= coalesce((select updated_at from application_settings where key='app'), '-infinity'::timestamptz)
           ), '[]'::json) as matches
    from (
      select offer_id, min(first_seen_at) as first_seen_at, max(last_seen_at) as last_seen_at
      from listing_appearances
      where last_seen_at >= now() - interval '7 days'
        and listing_path in (${sql.join(paths.map((x) => sql`${x}`), sql`, `)})
      group by offer_id
    ) w
    join product_offers o on o.id = w.offer_id
    join products p on p.id = o.product_id
    left join lateral (
      select ph.price_cents from price_history ph
      where ph.offer_id = o.id
      order by ph.observed_at desc, ph.id desc offset 1 limit 1
    ) prev on true
    where o.status = 'active' and o.shop_id = 'marjane-mall'
      and exists (select 1 from user_shops us join shops s on s.id=us.shop_id where us.user_id=${userId} and us.shop_id=o.shop_id and s.active)
      and o.last_success_at >= ${freshSince}
      ${requireDeal ? sql`and (o.advertised_discount_pct >= 20 or (prev.price_cents > o.current_price_cents))` : sql``}
      ${q ? sql`and (o.title ilike ${q} or p.brand ilike ${q})` : sql``}
    order by ${order}, o.title
    limit 1000`);
  return rows.rows.filter(r => opts.scope === 'all' || fitsPromotionProfile({title:r.title,brand:r.brand,rawSpecs:r.raw_specs,categoryPath:r.category_path},settings.shopperProfile)).slice(0,limit);
}


/** Fresh observed eligibility only; no inference from a discount badge. */
export async function basketCandidates() {
  const userId = (await requireUser()).id;
  const settings = await getUserSettings(db(), userId);
  const rows = await db().execute<{id:string;title:string;price_cents:number;brand:string|null;raw_specs:Record<string,string>;category_path:string|null;eligible:boolean}>(sql`
    select o.id,o.title,o.current_price_cents as price_cents,p.brand,p.raw_specs,p.category_path,
      exists(select 1 from listing_appearances a where a.offer_id=o.id
        and (a.listing_path='/panier-malin' or a.listing_path like '/panier-malin/%')
        and a.last_seen_at >= now()-interval '24 hours') as eligible
    from product_offers o join products p on p.id=o.product_id
    where o.status='active' and o.shop_id='marjane-mall' and o.stock_status <> 'out_of_stock' and o.current_price_cents>0
      and exists (select 1 from user_shops us join shops s on s.id=us.shop_id where us.user_id=${userId} and us.shop_id=o.shop_id and s.active)
      and o.last_success_at >= ${new Date(Date.now()-settings.staleAfterHours*3600_000)}
    order by eligible desc,o.current_price_cents asc,o.id limit 1000`);
  return rows.rows.filter(r=>fitsPromotionProfile({title:r.title,brand:r.brand,rawSpecs:r.raw_specs,categoryPath:r.category_path},settings.shopperProfile)).slice(0,100)
    .map(r=>({id:r.id,title:r.title,priceCents:r.price_cents,eligible:r.eligible}));
}

/** Candidate comparison only: matching a model name does not prove identical variants or bundles. */
export async function similarModelOffers(offerId:string, modelRef:string|null, brand:string|null) {
  if (!modelRef || modelRef.replace(/[^a-z0-9]/gi,'').length<4 || !brand) return [];
  const userId = (await requireUser()).id;
  const brands = /^(anker|soundcore)$/i.test(brand.trim()) ? ['anker','soundcore'] : [brand.toLowerCase().trim()];
  const settings=await getAppSettings(db());
  const rows=await db().execute<{id:string;title:string;price_cents:number;seller:string|null}>(sql`
    select o.id,o.title,o.current_price_cents as price_cents,o.seller from product_offers o join products p on p.id=o.product_id
    where o.id <> ${offerId} and o.status='active' and o.stock_status <> 'out_of_stock'
      and exists (select 1 from user_shops us join shops s on s.id=us.shop_id where us.user_id=${userId} and us.shop_id=o.shop_id and s.active)
      and o.current_price_cents>0 and o.last_success_at >= ${new Date(Date.now()-settings.staleAfterHours*3600_000)}
      and lower(trim(p.brand)) in (${sql.join(brands.map(b=>sql`${b}`),sql`,`)})
      and regexp_replace(lower(p.model_ref),'[^a-z0-9]','','g') = ${modelRef.toLowerCase().replace(/[^a-z0-9]/g,'')}
    order by o.current_price_cents,o.id limit 8`);
  return rows.rows;
}
