import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asc, count, eq } from "drizzle-orm";
import {
  createCriterion,
  createDb,
  dealMatches,
  notifications,
  priceHistory,
  productOffers,
  products,
  runRequests,
  saveAppSettings,
  scrapingRuns,
  type DbHandle,
} from "@mdw/database";
import { AccessBlockedError, type DetailResult, type ListingResult, type SiteAdapter } from "@mdw/scraper";
import { DEFAULT_SETTINGS, EXAMPLE_CRITERIA, type ListingItem, type ProductDetail } from "@mdw/shared";
import { TelegramClient } from "@mdw/notifications";
import { runScrape, type PipelineDeps } from "../src/pipeline";
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
}

class FakeSite implements SiteAdapter {
  products = new Map<string, FakeProduct>();
  blocked = false;
  delayMs = 0;
  requestCount = 0;
  detailCalls = 0;

  put(p: FakeProduct) {
    this.products.set(p.sourceId, p);
  }
  url(id: string) {
    return `https://www.marjanemall.ma/p/produit-${id}`;
  }
  async discover(path: string): Promise<ListingResult> {
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.blocked) throw new AccessBlockedError("Accès refusé par le site (HTTP 403)", 403);
    const items: ListingItem[] = [...this.products.values()]
      .filter((p) => p.path === path)
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
    return { path, items, method: "http", pagesLoaded: 1 };
  }
  async fetchProduct(url: string): Promise<DetailResult> {
    this.detailCalls++;
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
  const logger = createLogger("silent");
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
    clock = new Date();
    site = new FakeSite();
    tg = fakeTelegram();
    await saveAppSettings(h.db, { ...DEFAULT_SETTINGS, dealPagePaths: ["/ventes-flash"], missingAfterRuns: 2 });
    await createCriterion(h.db, { ...EXAMPLE_CRITERIA[0]!, enabled: true });
    await createCriterion(h.db, { ...EXAMPLE_CRITERIA[1]!, enabled: true });
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

  it("collects, stores history, matches criteria independently and notifies once", async () => {
    const r1 = await runScrape(deps(), "manual");
    expect(r1.status).toBe("success");
    // The laptop criterion uses the "price_drops" mode: a new match alone does not alert.
    expect(r1.stats).toMatchObject({ cardsSeen: 4, newOffers: 3, notificationsQueued: 1, notificationsSent: 1 });

    // The blender matches no criterion and is not stored.
    expect((await h.db.select({ n: count() }).from(productOffers))[0]!.n).toBe(3);
    const matches = await h.db.select().from(dealMatches).where(eq(dealMatches.isMatch, true));
    expect(matches).toHaveLength(2); // Samsung TV (TV criterion) + laptop (laptop criterion)
    // The 50" TCL violates the mandatory 55" requirement: stored as an offer, never a match.
    const nonMatches = await h.db.select().from(dealMatches).where(eq(dealMatches.isMatch, false));
    expect(nonMatches).toHaveLength(0);

    expect(tg.sent).toHaveLength(1);
    expect(tg.sent.join("\n")).toContain("Téléviseur Samsung QLED 55 pouces");
    expect(tg.sent.join("\n")).toContain("4 499,00 MAD");

    // Second run, nothing changed: history grows, no duplicate alert.
    advance(9);
    const r2 = await runScrape(deps(), "schedule");
    expect(r2.stats.notificationsQueued).toBe(0);
    expect(tg.sent).toHaveLength(1);
    expect((await h.db.select({ n: count() }).from(priceHistory))[0]!.n).toBe(6);

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
    expect(offers).toHaveLength(3);
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
    expect((await h.db.select({ n: count() }).from(products))[0]!.n).toBe(3);
    expect((await h.db.select({ n: count() }).from(priceHistory))[0]!.n).toBe(3);
    expect((await h.db.select({ n: count() }).from(notifications))[0]!.n).toBe(1);
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
