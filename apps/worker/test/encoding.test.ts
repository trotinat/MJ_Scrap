import { afterAll, beforeAll, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createDb, createCriterion, productOffers, runMigrations, saveAppSettings, scrapingRuns, type DbHandle } from "@mdw/database";
import type { DetailResult, ListingResult, SiteAdapter } from "@mdw/scraper";
import { DEFAULT_SETTINGS, RECOMMENDED_CRITERIA } from "@mdw/shared";
import { runScrape } from "../src/pipeline";
import { createLogger } from "../src/logger";
import { describeDb, TEST_DB_URL } from "../../../test-utils/db";

/**
 * Reproduces the PC case of 10 Oct 2026: an embedded PostgreSQL created with
 * the Windows code page (WIN1252) and a product named "Câble USB‑A vers USB‑C"
 * (U+2011). The store failed, recording the error failed too, and the run
 * stayed "running" forever.
 */
describeDb("database without UTF-8 (Windows code page)", () => {
  let admin: DbHandle;
  let h: DbHandle;
  const name = "mdw_test_win1252";

  beforeAll(async () => {
    admin = createDb(TEST_DB_URL!, 2);
    await admin.db.execute(sql.raw(`drop database if exists ${name}`));
    await admin.db.execute(sql.raw(`create database ${name} template template0 encoding 'WIN1252' lc_collate 'C' lc_ctype 'C'`));
    const url = new URL(TEST_DB_URL!);
    url.pathname = `/${name}`;
    h = createDb(url.toString(), 4);
    await runMigrations(h.db);
  });
  afterAll(async () => {
    await h?.close();
    await admin?.db.execute(sql.raw(`drop database if exists ${name} with (force)`)).catch(() => undefined);
    await admin?.close();
  });

  it("records each failure and always closes the run", async () => {
    await saveAppSettings(h.db, { ...DEFAULT_SETTINGS, dealPagePaths: ["/ventes-flash"] });
    await createCriterion(h.db, RECOMMENDED_CRITERIA[1]!); // Ventes flash -40 %
    const card = (sourceId: string, title: string, price: number, old: number) => ({
      sourceId, url: `https://www.marjanemall.ma/p/x-${sourceId}`, title, imageUrl: null, priceCents: price, originalPriceCents: old,
      advertisedDiscountPct: Math.round((1 - price / old) * 100), seller: null, reviewCount: null, rating: null, listingPath: "/ventes-flash",
    });
    const site: SiteAdapter = {
      requestCount: 0,
      async discover(path): Promise<ListingResult> {
        return {
          path, method: "http", pagesLoaded: 1,
          // Raw title on purpose (the real parser already normalizes it).
          items: [card("c43fd31005130418795", "Câble USB‑A vers USB‑C 1 m — Noir", 1500, 6500), card("aaaxx12345", "Magnesium Marin 375mg", 4990, 17000)],
        };
      },
      async fetchProduct(): Promise<DetailResult> {
        return { kind: "error", message: "unused" };
      },
      async close() {},
    };
    const r = await runScrape({ db: h.db, pool: h.pool, adapter: site, logger: createLogger("silent"), telegram: null, workerId: "t" }, "manual");
    expect(r.status).toBe("partial");
    const [run] = await h.db.select().from(scrapingRuns).where(eq(scrapingRuns.id, r.runId));
    expect(run!.status).toBe("partial");
    expect(run!.finishedAt).not.toBeNull();
    // Each failure is recorded as a readable one-line error (no endless "running" state).
    expect(run!.errorSummary).toMatch(/^2 erreur\(s\) : store: Failed query: insert into "products"/);
    // Such a database cannot even store the alerts (emojis): the launcher converts it to UTF-8.
    expect(await h.db.select().from(productOffers)).toEqual([]);
  });
});
