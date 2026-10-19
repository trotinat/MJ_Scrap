import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asc, count, eq } from "drizzle-orm";
import {
  createCriterion,
  createUser,
  createDb,
  dealMatches,
  listCriteria,
  listingAppearances,
  listingCrawls,
  notifications,
  priceHistory,
  productOffers,
  products,
  runRequests,
  saveAppSettings,
  scrapingRuns,
  scrapingErrors,
  searchCriteria,
  shops,
  seedRecommendedCriteria,
  type DbHandle,
} from "@mdw/database";
import { AccessBlockedError, type DetailResult, type ListingResult, type SiteAdapter } from "@mdw/scraper";
import { DEFAULT_SETTINGS, EXAMPLE_CRITERIA, type ListingItem, type ProductDetail } from "@mdw/shared";
import { TelegramClient } from "@mdw/notifications";
import { runScrape, type PipelineDeps } from "../src/pipeline";
import { saveObservation, type OfferObservation } from "../src/persist";
import { Scheduler } from "../src/scheduler";
import { markInterruptedRuns } from "../src/deps";
import { createLogger } from "../src/logger";
import { describeDb, freshDb, TEST_DB_URL, truncateAll } from "../../../test-utils/db";

/* ------------------------------ fake website ------------------------------ */

interface FakeProduct {
  sourceId: string;
  title: string;
  priceCents: number;
  originalPriceCents?: number | null;
  discount?: number | null;
  rawSpecs?: Record<string, string>;
  brand?: string | null;
  stock?: "in_stock" | "out_of_stock";
  path: string;
  /** Other listings showing the same card (e.g. a TV also in Ventes flash). */
  alsoOn?: string[];
}

class FakeSite implements SiteAdapter {
  products = new Map<string, FakeProduct>();
  blocked = false;
  /** Paths refused with HTTP 403 (e.g. a listing that needs browser rendering). */
  blockedPaths = new Set<string>();
  delayMs = 0;
  requestCount = 0;
  detailCalls = 0;
  detailUrls: string[] = [];
  complete = true;

  put(p: FakeProduct) {
    this.products.set(p.sourceId, p);
  }
  url(id: string) {
    return `https://www.marjanemall.ma/p/produit-${id}`;
  }
  async discover(path: string): Promise<ListingResult> {
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.blocked) throw new AccessBlockedError("Accès refusé par le site (HTTP 403)", 403);
    if (this.blockedPaths.has(path)) throw new AccessBlockedError("Accès refusé lors du rendu (HTTP 403)", 403, `https://www.marjanemall.ma${path}`);
    const items: ListingItem[] = [...this.products.values()]
      .filter((p) => p.path === path || p.alsoOn?.includes(path))
      .map((p) => ({
        sourceId: p.sourceId,
        url: this.url(p.sourceId),
        title: p.title,
        imageUrl: `https://www.marjanemall.ma/media/${p.sourceId}.jpg`,
        priceCents: p.priceCents,
        originalPriceCents: p.originalPriceCents ?? null,
        advertisedDiscountPct: p.discount ?? null,
        seller: "MARJANE",
        reviewCount: null,
        rating: null,
        listingPath: path,
      }));
    return { path, items, method: "http", pagesLoaded: 1, complete: this.complete };
  }
  async fetchProduct(url: string): Promise<DetailResult> {
    this.detailCalls++;
    this.detailUrls.push(url);
    const id = url.split("-").pop()!;
    const p = this.products.get(id);
    if (!p) return { kind: "gone", status: 404 };
    const detail: ProductDetail = {
      sourceId: p.sourceId,
      url,
      title: p.title,
      brand: p.brand ?? null,
      modelRef: null,
      imageUrl: `https://www.marjanemall.ma/media/${p.sourceId}.jpg`,
      priceCents: p.priceCents,
      originalPriceCents: p.originalPriceCents ?? null,
      advertisedDiscountPct: p.discount ?? null,
      seller: "MARJANE",
      stock: p.stock ?? "in_stock",
      rating: null,
      reviewCount: null,
      breadcrumb: [],
      rawSpecs: p.rawSpecs ?? {},
      extraction: "html-text",
      warnings: [],
    };
    return { kind: "ok", detail };
  }
  async close() {}
}

function fakeTelegram() {
  const sent: string[] = [];
  let nextId = 100;
  const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    sent.push(String(body.caption ?? body.text));
    return new Response(JSON.stringify({ ok: true, result: { message_id: nextId++ } }), { status: 200 });
  }) as typeof fetch;
  return { client: new TelegramClient({ botToken: "1:abc", chatId: "1", fetchImpl }), sent };
}

const TV_PATH = "/tv-son-photo/tv-home-cinema/televiseur";
const LAPTOP_PATH = "/informatique-gaming";

describeDb("worker pipeline (PostgreSQL + fake site)", () => {
  let h: DbHandle;
  let site: FakeSite;
  let tg: ReturnType<typeof fakeTelegram>;
  const logger = createLogger(process.env.TEST_LOG_LEVEL ?? "silent");
  let clock: Date;

  const deps = (): PipelineDeps => ({
    db: h.db,
    pool: h.pool,
    adapter: site,
    logger,
    telegram: tg.client,
    workerId: "test-worker",
    now: () => clock,
  });
  const advance = (hours: number) => {
    clock = new Date(clock.getTime() + hours * 3600_000);
  };

  beforeAll(async () => {
    h = await freshDb();
  });
  afterAll(async () => {
    await h?.close();
  });
  beforeEach(async () => {
    await truncateAll(h);
    const owner = await createUser(h.db, "owner@example.com", "un-mot-de-passe-solide");
    clock = new Date();
    site = new FakeSite();
    tg = fakeTelegram();
    await saveAppSettings(h.db, { ...DEFAULT_SETTINGS, dealPagePaths: ["/ventes-flash"], missingAfterRuns: 2 });
    await createCriterion(h.db, { ...EXAMPLE_CRITERIA[0]!, enabled: true }, owner.id);
    await createCriterion(h.db, { ...EXAMPLE_CRITERIA[1]!, enabled: true }, owner.id);
    site.put({
      sourceId: "abbb332004180907425",
      title: "Téléviseur Samsung QLED 55 pouces – Modèle QA55Q6FAAUXMV",
      brand: "Samsung",
      priceCents: 449900,
      originalPriceCents: 650000,
      discount: 31,
      rawSpecs: { "Résolution d'affichage": "3840 x 2160 pixels - (Ultra HD 4K)", "Classe de diagonale": '55"' },
      path: TV_PATH,
    });
    site.put({ sourceId: "aaab50inch01", title: "Téléviseur TCL 50 pouces 4K Smart TV", brand: "TCL", priceCents: 429900, path: TV_PATH });
    site.put({ sourceId: "aaac0laptop1", title: "PC Portable Lenovo IdeaPad 16 Go RAM 512 Go SSD", brand: "Lenovo", priceCents: 799900, path: LAPTOP_PATH });
    site.put({ sourceId: "aaad0blender", title: "Blender Denwa BL424CB 1,5 L", priceCents: 23900, path: "/ventes-flash" });
  });

  it("separates identical external ids and product keys across shops", async () => {
    await h.db.insert(shops).values({ id: "nike-ma", name: "Nike Maroc", baseUrl: "https://www.nike.com/ma", active: true });
    const [run] = await h.db.insert(scrapingRuns).values({ trigger: "manual", status: "running" }).returning();
    const base: OfferObservation = {
      sourceId: "same-id", url: "https://www.marjanemall.ma/p/same-id", title: "Nike Air Test", brand: "Nike", modelRef: "AIR-TEST", imageUrl: null,
      priceCents: 30000, originalPriceCents: null, advertisedDiscountPct: null, seller: null, stock: "in_stock", rating: null, reviewCount: null,
      rawSpecs: {}, categoryPath: null, listingPath: null, source: "detail", extraction: "structured-data",
    };
    const a = await h.db.transaction(tx => saveObservation(tx, { ...base, shopId: "marjane-mall" }, run!.id, clock));
    const b = await h.db.transaction(tx => saveObservation(tx, { ...base, shopId: "nike-ma", url: "https://www.nike.com/ma/t/same-id" }, run!.id, clock));
    expect(a.offerId).not.toBe(b.offerId);
    expect(a.productId).not.toBe(b.productId);
  });

  it("reuses unchanged recent details but refreshes changed prices and expired stock", async()=>{
    advance(1/60);
    await runScrape(deps(),"manual");
    const initial=site.detailCalls;
    const warm=await runScrape(deps(),"manual");
    expect(warm.stats.detailCacheHits).toBeGreaterThan(0);
    expect(warm.stats.notificationsQueued).toBe(0);
    expect(site.detailCalls-initial).toBeLessThan(initial);
    const product=site.products.get("abbb332004180907425")!;
    product.priceCents-=10000;
    const calls=site.detailCalls;
    const changed=await runScrape(deps(),"manual");
    expect(site.detailCalls).toBeGreaterThan(calls);
    expect(changed.stats.priceDrops).toBeGreaterThan(0);
    advance(1);
    const expired=await runScrape(deps(),"manual");
    expect(expired.stats.detailFetches).toBeGreaterThan(0);
    expect(expired.stats.detailCacheHits??0).toBe(0);
  });

  it("checks a newly discovered product before rechecking known cards when details are limited", async () => {
    await runScrape(deps(), "manual");
    site.put({ sourceId: "newtv01", title: "Téléviseur Samsung QLED 55 pouces 4K", brand: "Samsung", priceCents: 399900, path: TV_PATH });
    await saveAppSettings(h.db, { ...DEFAULT_SETTINGS, dealPagePaths: ["/ventes-flash"], maxDetailFetchesPerRun: 1 });
    const before = site.detailUrls.length;
    const run = await runScrape(deps(), "manual");
    expect(run.stats.detailFetches).toBe(1);
    expect(site.detailUrls.slice(before)).toEqual([site.url("newtv01")]);
  });

  it("scans personal searches each run but defers recent promo pages on scheduled runs",async()=>{
    await runScrape(deps(),"manual");
    const quick=await runScrape(deps(),"schedule");
    expect(quick.stats.promoPagesSkipped).toBe(1);
    expect(quick.stats.listingPaths).toBe(2);
    const manual=await runScrape(deps(),"manual");
    expect(manual.stats.promoPagesSkipped).toBe(0);
    expect(manual.stats.listingPaths).toBe(3);
  });

  it("collects, stores history, matches criteria independently and notifies once", async () => {
    const r1 = await runScrape(deps(), "manual");
    expect(r1.status).toBe("success");
    // The laptop criterion uses the "price_drops" mode: a new match alone does not alert.
    expect(r1.stats).toMatchObject({ cardsSeen: 4, newOffers: 4, notificationsQueued: 1, notificationsSent: 1 });

    // The blender matches no criterion but comes from Ventes flash: stored from its card only.
    expect((await h.db.select({ n: count() }).from(productOffers))[0]!.n).toBe(4);
    const matches = await h.db.select().from(dealMatches).where(eq(dealMatches.isMatch, true));
    expect(matches).toHaveLength(2); // Samsung TV (TV criterion) + laptop (laptop criterion)
    // The 50" TCL violates the mandatory 55" requirement: retain the negative
    // evaluation so its unchanged detail page need not be fetched next run.
    const nonMatches = await h.db.select().from(dealMatches).where(eq(dealMatches.isMatch, false));
    expect(nonMatches).toHaveLength(1);

    expect(tg.sent).toHaveLength(1);
    expect(tg.sent.join("\n")).toContain("Téléviseur Samsung QLED 55 pouces");
    expect(tg.sent.join("\n")).toContain("4 499,00 MAD");

    // Second run, nothing changed: history grows, no duplicate alert.
    advance(9);
    const r2 = await runScrape(deps(), "schedule");
    expect(r2.stats.notificationsQueued).toBe(0);
    expect(tg.sent).toHaveLength(1);
    expect((await h.db.select({ n: count() }).from(priceHistory))[0]!.n).toBe(8);

    // Third run: the TV drops by 8 % -> one price-drop alert with numbers from our history.
    site.products.get("abbb332004180907425")!.priceCents = 413900;
    advance(9);
    const r3 = await runScrape(deps(), "schedule");
    expect(r3.stats).toMatchObject({ priceDrops: 1, notificationsQueued: 1 });
    expect(tg.sent).toHaveLength(2);
    expect(tg.sent[1]).toContain("Baisse de prix");
    expect(tg.sent[1]).toContain("-8 %");
    const [tvMatch] = await h.db
      .select()
      .from(dealMatches)
      .innerJoin(productOffers, eq(productOffers.id, dealMatches.offerId))
      .where(eq(productOffers.sourceId, "abbb332004180907425"));
    expect(tvMatch!.deal_matches.explanation).toContain("inférieur de 8 % à celui observé lors de la précédente collecte");
    expect(tvMatch!.product_offers.minPriceCents).toBe(413900);
  });

  it("collects promotion pages even without any criterion (Ventes flash)", async () => {
    await h.db.delete(searchCriteria);
    site.put({ sourceId: "aaae0shaver1", title: "Tondeuse Philips série 3000", priceCents: 4990, originalPriceCents: 17000, discount: 71, path: "/ventes-flash" });
    const r = await runScrape(deps(), "manual");
    expect(r.status).toBe("success");
    expect(r.stats).toMatchObject({ listingPaths: 1, cardsSeen: 2, newOffers: 2, detailFetches: 0, matches: 0 });
    const shown = await h.db.select().from(listingAppearances).where(eq(listingAppearances.listingPath, "/ventes-flash"));
    expect(shown).toHaveLength(2);
    const [crawl] = await h.db.select().from(listingCrawls).where(eq(listingCrawls.path, "/ventes-flash"));
    expect(crawl).toMatchObject({ itemCount: 2, method: "http" });
    expect(crawl!.lastSuccessAt.getTime()).toBe(clock.getTime());
    // Advertised discount stays the site's value; no observed change on a first reading.
    const [shaver] = await h.db.select().from(productOffers).where(eq(productOffers.sourceId, "aaae0shaver1"));
    expect(shaver).toMatchObject({ currentPriceCents: 4990, originalPriceCents: 17000, advertisedDiscountPct: 71 });
  });

  it("matches a product seen on Ventes flash against category and promotion criteria", async () => {
    await h.db.delete(searchCriteria);
    expect(await seedRecommendedCriteria(h.db, { once: true })).toBe(5);
    expect(await seedRecommendedCriteria(h.db, { once: true })).toBe(0); // only once per database
    expect(await seedRecommendedCriteria(h.db)).toBe(0); // names already present
    expect((await listCriteria(h.db, { enabledOnly: true })).length).toBe(5);

    // A 55" 4K TV listed only on Ventes flash (category unknown) with -45 %.
    site.put({
      sourceId: "aaaf0tvflash",
      title: "Smart TV TCL 55 pouces 4K UHD QLED",
      brand: "TCL",
      priceCents: 429900,
      originalPriceCents: 790000,
      discount: 45,
      rawSpecs: { "Résolution d'affichage": "3840 x 2160 pixels - (Ultra HD 4K)", "Classe de diagonale": '55"' },
      path: "/ventes-flash",
    });
    // The Samsung TV from the TV category is also shown on Ventes flash (31 %, below 40 %).
    site.products.get("abbb332004180907425")!.alsoOn = ["/ventes-flash"];
    await runScrape(deps(), "manual");

    const matchedNames = async (sourceId: string) => {
      const rows = await h.db
        .select({ name: searchCriteria.name, isMatch: dealMatches.isMatch })
        .from(dealMatches)
        .innerJoin(searchCriteria, eq(searchCriteria.id, dealMatches.criterionId))
        .innerJoin(productOffers, eq(productOffers.id, dealMatches.offerId))
        .where(eq(productOffers.sourceId, sourceId));
      return rows.filter((r) => r.isMatch).map((r) => r.name).sort();
    };
    expect(await matchedNames("aaaf0tvflash")).toEqual(["Smart TV 55\" 4K – moins de 6 000 MAD", "Ventes flash : -40 % et plus"]);
    expect(await matchedNames("abbb332004180907425")).toEqual(["Smart TV 55\" 4K – moins de 6 000 MAD"]);
    // The blender (no discount) is stored for the Ventes flash page but matches nothing.
    expect(await matchedNames("aaad0blender")).toEqual([]);
    const samsung = await h.db
      .select({ path: listingAppearances.listingPath })
      .from(listingAppearances)
      .innerJoin(productOffers, eq(productOffers.id, listingAppearances.offerId))
      .where(eq(productOffers.sourceId, "abbb332004180907425"));
    expect(samsung.map((r) => r.path).sort()).toEqual([TV_PATH, "/ventes-flash"].sort());
  });

  it("a refusal on one listing stops the run but keeps what was read before it", async () => {
    site.blockedPaths.add(TV_PATH);
    const r = await runScrape(deps(), "manual");
    expect(r.status).toBe("partial");
    expect(r.stats.accessBlocked).toBe(true);
    // Promotion pages are read first; nothing is requested after the refusal (no product pages).
    expect(r.stats).toMatchObject({ cardsSeen: 1, detailFetches: 0, newOffers: 1 });
    expect(site.detailCalls).toBe(0);
    const [run] = await h.db.select().from(scrapingRuns).where(eq(scrapingRuns.id, r.runId));
    expect(run!.errorSummary).toMatch(/sans contourner la protection ; 1 fiche\(s\) lues avant le refus/);
    const [error] = await h.db.select().from(scrapingErrors).where(eq(scrapingErrors.runId, r.runId));
    expect(error).toMatchObject({ stage: "access", httpStatus: 403, url: `https://www.marjanemall.ma${TV_PATH}` });
    expect(await h.db.select().from(listingAppearances)).toHaveLength(1);
  });

  it("a blocked/failed run keeps existing data and never marks offers missing", async () => {
    await runScrape(deps(), "manual");
    site.blocked = true;
    advance(9);
    for (let i = 0; i < 3; i++) {
      const r = await runScrape(deps(), "schedule");
      expect(r.status).toBe("failed");
      expect(r.stats.accessBlocked).toBe(true);
    }
    const offers = await h.db.select().from(productOffers);
    expect(offers).toHaveLength(4); // 3 matched products + the Ventes flash blender
    expect(offers.every((o) => o.status === "active" && o.consecutiveMisses === 0)).toBe(true);
    const [failed] = await h.db.select().from(scrapingRuns).where(eq(scrapingRuns.status, "failed")).limit(1);
    expect(failed!.errorSummary).toMatch(/Accès refusé/);
  });

  it("marks offers missing only after N successful runs without them, without deleting", async () => {
    await runScrape(deps(), "manual");
    site.products.delete("aaac0laptop1");
    // The laptop page also disappears: detail fetch for the tracked match returns 404.
    advance(9);
    await runScrape(deps(), "schedule");
    let [laptop] = await h.db.select().from(productOffers).where(eq(productOffers.sourceId, "aaac0laptop1"));
    expect(laptop!.status).toBe("unavailable");
    // Product came back.
    site.put({ sourceId: "aaac0laptop1", title: "PC Portable Lenovo IdeaPad 16 Go RAM 512 Go SSD", brand: "Lenovo", priceCents: 799900, path: LAPTOP_PATH });
    advance(9);
    await runScrape(deps(), "schedule");
    [laptop] = await h.db.select().from(productOffers).where(eq(productOffers.sourceId, "aaac0laptop1"));
    expect(laptop!.status).toBe("active");

    // The 50" TV (not a match, so not refreshed) vanishes from a listing that is still crawled.
    site.products.delete("aaab50inch01");
    advance(9);
    await runScrape(deps(), "schedule");
    let [tcl] = await h.db.select().from(productOffers).where(eq(productOffers.sourceId, "aaab50inch01"));
    expect(tcl!.status).toBe("active");
    expect(tcl!.consecutiveMisses).toBe(1);
    advance(9);
    await runScrape(deps(), "schedule");
    [tcl] = await h.db.select().from(productOffers).where(eq(productOffers.sourceId, "aaab50inch01"));
    expect(tcl!.status).toBe("missing");
    expect((await h.db.select({ n: count() }).from(priceHistory).where(eq(priceHistory.offerId, tcl!.id)))[0]!.n).toBeGreaterThan(0);
  });

  it("prevents overlapping runs", async () => {
    site.delayMs = 400;
    const [a, b] = await Promise.all([runScrape(deps(), "schedule"), new Promise((r) => setTimeout(r, 50)).then(() => runScrape(deps(), "manual"))]);
    expect([a.status, b.status].sort()).toEqual(["skipped", "success"]);
    const runs = await h.db.select().from(scrapingRuns).orderBy(asc(scrapingRuns.startedAt));
    expect(runs.map((r) => r.status).sort()).toEqual(["skipped", "success"]);
  });

  it("data persists across a worker restart and stale runs become 'interrupted'", async () => {
    await runScrape(deps(), "manual");
    await h.db.insert(scrapingRuns).values({ trigger: "schedule", status: "running" });
    await h.close();
    // "Restart": brand-new pool.
    h = createDb(TEST_DB_URL, 8);
    expect(await markInterruptedRuns(h.db, h.pool)).toBe(1);
    expect((await h.db.select({ n: count() }).from(products))[0]!.n).toBe(4);
    expect((await h.db.select({ n: count() }).from(priceHistory))[0]!.n).toBe(4);
    expect((await h.db.select({ n: count() }).from(notifications))[0]!.n).toBe(1);
  });

  it('does not infer missing offers from truncated listings', async () => {
    await runScrape(deps(), 'manual');
    site.products.delete('aaac0laptop1');
    site.complete = false;
    // Direct refresh cannot rescue the missing product in this scenario.
    await saveAppSettings(h.db, {...DEFAULT_SETTINGS,dealPagePaths:['/ventes-flash'],missingAfterRuns:1,maxDetailFetchesPerRun:0});
    await runScrape(deps(), 'manual');
    const [offer] = await h.db.select().from(productOffers).where(eq(productOffers.sourceId,'aaac0laptop1'));
    expect(offer!.status).toBe('active');
    expect(offer!.consecutiveMisses).toBe(0);
  });

  it('gives a confirmed product 404 precedence over a stale listing card', async () => {
    await runScrape(deps(), 'manual');
    site.fetchProduct = async () => ({kind:'gone',status:404});
    await runScrape(deps(), 'manual');
    const [offer] = await h.db.select().from(productOffers).where(eq(productOffers.sourceId,'abbb332004180907425'));
    expect(offer!.status).toBe('unavailable');
  });

  describe("scheduler", () => {
    const makeScheduler = () =>
      new Scheduler(deps(), {
        scheduleTimes: "09:00,18:00",
        catchUpWindowHours: 6,
        outboxIntervalSeconds: 60,
        version: "test",
        makeDeps: deps,
        run: runScrape,
      });

    it("catches up a missed slot once, within the window", async () => {
      const s = makeScheduler();
      // 2026-10-01 10:30 Casablanca = 09:30Z; the 09:00 slot (08:00Z) was missed.
      expect(await s.catchUp(new Date("2026-10-01T09:30:00Z"))).toBe(true);
      await new Promise((r) => setTimeout(r, 50));
      while (s.busy) await new Promise((r) => setTimeout(r, 50));
      const [run] = await h.db.select().from(scrapingRuns);
      expect(run!.trigger).toBe("catchup");
      // Too late for the window:
      expect(await s.catchUp(new Date("2026-10-01T16:30:00Z"))).toBe(false);
      await s.stop(1000);
    });

    it("executes manual run requests from the dashboard", async () => {
      const s = makeScheduler();
      await h.db.insert(runRequests).values({ requestedBy: "admin@x.ma" });
      await s.pollRequests();
      const [req] = await h.db.select().from(runRequests);
      expect(req!.status).toBe("done");
      expect(req!.runId).not.toBeNull();
      const [run] = await h.db.select().from(scrapingRuns);
      expect(run!.trigger).toBe("manual");
      await s.stop(1000);
    });

    it("arms croner with the next Morocco-time slot", async () => {
      const s = makeScheduler();
      await s.start();
      const next = s.nextRunAt()!;
      const local = new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Casablanca", hour: "2-digit", minute: "2-digit" }).format(next);
      expect(["09:00", "18:00"]).toContain(local);
      await s.stop(1000);
    });
  });
});
