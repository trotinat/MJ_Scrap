import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { criterionFiltersSchema, fashionFailures, type MatchableProduct } from "@mdw/shared";
import {
  createUrbanJungleAdapter,
  DisallowedUrlError,
  PoliteFetcher,
  ProductParseError,
  RobotsDisallowedError,
  shopifyListingItem,
  shopifyProductDetail,
  toShopifyProduct,
  URBAN_JUNGLE,
} from "../src";

const dir = path.dirname(fileURLToPath(import.meta.url));
const load = (name: string) => JSON.parse(readFileSync(path.join(dir, "../fixtures/urban-jungle", name), "utf8"));
const collection = load("collection-soldes.json") as { products: any[] };
const productJs = load("product-puma-v-s1-totalenergies-afcon-egypte-404147-05.js.json");

const PUMA = "puma-v-s1-totalenergies-afcon-egypte-404147-05";
const raw = (handle: string) => structuredClone(collection.products.find((p) => p.handle === handle));
const product = (handle: string) => toShopifyProduct(raw(handle), "mad")!;
const HOME = '<script>Shopify.currency = {"active":"MAD","rate":"1.0"};\nShopify.country = "MA";</script>';
const ROBOTS = "User-agent: *\nDisallow: /cart\nDisallow: /collections/*sort_by*\nDisallow: /collections/*+*\nDisallow: /search\n";

function setup(routes: (url: URL) => Response | undefined, opts: { home?: string; robots?: string } = {}) {
  const requests: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    requests.push(url.pathname + url.search);
    if (url.pathname === "/robots.txt") return new Response(opts.robots ?? ROBOTS);
    if (url.pathname === "/") return new Response(opts.home ?? HOME);
    return routes(url) ?? new Response("not found", { status: 404 });
  }) as typeof fetch;
  const adapter = createUrbanJungleAdapter({ userAgent: "test", minDelayMs: 0, timeoutMs: 1000, maxRetries: 0, respectRobots: true, fetchImpl, sleep: async () => undefined });
  return { adapter, requests };
}

/** A full 250-product page with ids unique to that page. */
const fullPage = (page: number) =>
  Array.from({ length: 250 }, (_, i) => ({ ...raw(PUMA), id: page * 1000 + i, handle: `p-${page}-${i}` }));

const matchable = (rawSpecs: Record<string, string>): MatchableProduct => ({
  title: "Baskets", brand: null, modelRef: null, categoryPath: null, priceCents: 1, originalPriceCents: null, advertisedDiscountPct: null,
  seller: null, stock: "in_stock", rating: null, reviewCount: null, rawSpecs, specs: {},
});
const sizeFailures = (rawSpecs: Record<string, string>, sizes: string[]) =>
  fashionFailures(criterionFiltersSchema.parse({ keywords: ["basket"], productType: "shoes", sizes }), matchable(rawSpecs)).filter((f) => /taille/.test(f));

describe("Urban Jungle listing feed", () => {
  it("reads exact MAD prices, old prices, brand and canonical URLs", () => {
    const items = collection.products.map((p) => shopifyListingItem(URBAN_JUNGLE, toShopifyProduct(p, "mad")!, "/collections/soldes"));
    expect(items).toHaveLength(6);
    expect(items[0]).toMatchObject({
      sourceId: "10924956254475",
      url: `https://ma.urbanjunglestore.com/products/${PUMA}`,
      priceCents: 46900,
      originalPriceCents: 156900,
      advertisedDiscountPct: 70,
      brand: "Puma",
      seller: "Urban Jungle",
      listingPath: "/collections/soldes",
      stock: "in_stock",
      rawSpecs: { Genre: "Homme, Femme", "Rupture de stock": "42" },
    });
    expect(items[0]!.imageUrl).toMatch(/^https:\/\/cdn\.shopify\.com\//);
    expect(items[1]).toMatchObject({ priceCents: 54900, originalPriceCents: null, advertisedDiscountPct: null, brand: "Nike" });
  });

  it("keeps the store's brand spelling for known aliases", () => {
    const brand = (vendor: string) => shopifyListingItem(URBAN_JUNGLE, toShopifyProduct({ ...raw(PUMA), vendor }, "mad")!, "/").brand;
    expect([brand("URBAN JUNGLE"), brand("NORTH FACE"), brand("HEY DUDE"), brand("NIKE")]).toEqual(["Urban Jungle", "The North Face", "Hey Dude", "Nike"]);
  });

  it("ignores a sold-out size listed at 0,00 instead of reading it as a price", () => {
    const tee = shopifyListingItem(URBAN_JUNGLE, product("jordan-girlfriend-t-shirt-white-im7141-100"), "/");
    expect(tee).toMatchObject({ priceCents: 54900, brand: "Jordan" });
  });

  it("refuses one offer price when the sizes for sale disagree", () => {
    const r = raw("nike-t-shirt-nike-sportswear-noir-iq5860-010");
    r.variants[1].price = "599.00";
    const p = toShopifyProduct(r, "mad")!;
    expect(shopifyListingItem(URBAN_JUNGLE, p, "/").priceCents).toBeNull();
    expect(() => shopifyProductDetail(URBAN_JUNGLE, p)).toThrow(ProductParseError);
    r.variants[1].available = false;
    expect(shopifyListingItem(URBAN_JUNGLE, toShopifyProduct(r, "mad")!, "/").priceCents).toBe(54900);
  });
});

describe("Urban Jungle product detail", () => {
  it("reads the .js fiche in centimes, with the same price as the feed", () => {
    const d = shopifyProductDetail(URBAN_JUNGLE, toShopifyProduct(productJs, "cents")!);
    expect(d).toMatchObject({
      sourceId: "10924956254475",
      priceCents: 46900,
      originalPriceCents: 156900,
      advertisedDiscountPct: 70,
      stock: "in_stock",
      seller: "Urban Jungle",
      extraction: "embedded-data",
      breadcrumb: ["Chaussures"],
    });
    expect(d.rawSpecs).toEqual({
      "Type de produit": "Chaussures",
      Genre: "Homme, Femme",
      "Pointures disponibles": "35, 37, 38, 38.5, 40, 40.5, 41, 42.5, 44",
      "Rupture de stock": "42",
      Référence: "404147-05",
    });
  });

  it("marks children's products and lists only sizes in stock", () => {
    const d = shopifyProductDetail(URBAN_JUNGLE, product("nike-react-live-noir-blanc-gs-cw1622-003"));
    expect(d.rawSpecs).toMatchObject({ Genre: "Garçon", Public: "Enfant", "Pointures disponibles": "36.5, 37.5, 38, 38.5", "Rupture de stock": "35.5, 36, 39, 40" });
    expect(d.modelRef).toBe("CW1622003");
  });

  it("writes fractional EU sizes so the size filter can read them", () => {
    const d = shopifyProductDetail(URBAN_JUNGLE, product("yeezy-yeezy-boost-350-v2-beige-sneakers-11691731"));
    expect(d.rawSpecs["Pointures disponibles"]).toBe("46");
    expect(d.rawSpecs["Rupture de stock"]).toContain("40 2/3");
    expect(sizeFailures(d.rawSpecs, ["46"])).toEqual([]);
    expect(sizeFailures(d.rawSpecs, ["42"])).toEqual(["taille différente (42 recherchée)"]);
  });

  it("never treats sold-out sizes as available", () => {
    const r = raw(PUMA);
    for (const v of r.variants) v.available = false;
    const d = shopifyProductDetail(URBAN_JUNGLE, toShopifyProduct(r, "mad")!);
    expect(d.stock).toBe("out_of_stock");
    expect(d.rawSpecs["Pointures disponibles"]).toBeUndefined();
    expect(sizeFailures(d.rawSpecs, ["40"])).toEqual(["taille non vérifiable : aucune taille produit confirmée"]);
  });

  it("keeps the store's collection tags, not seasons, audiences, types or brands", () => {
    const r = raw(PUMA);
    r.tags = ["Chaussures", "EOSS SP26", "MEN", "SS26", "World Cup Collection", "World Cup", "AFCON", "Puma", "BOOST-1", "badge:sustainable", "Puma T7"];
    expect(shopifyProductDetail(URBAN_JUNGLE, toShopifyProduct(r, "mad")!).rawSpecs.Collection).toBe("World Cup, AFCON, Puma T7");
  });

  it("keeps a one-size accessory and its article code", () => {
    const d = shopifyProductDetail(URBAN_JUNGLE, product("puma-1976-micro-grip-bag-black-091824-02"));
    expect(d).toMatchObject({ priceCents: 24900, originalPriceCents: 41900, advertisedDiscountPct: 41, stock: "in_stock" });
    expect(d.rawSpecs).toMatchObject({ "Type de produit": "Accessoires", Genre: "Homme", "Tailles disponibles": "OS", Référence: "091824-02" });
  });
});

describe("ShopifyAdapter (Urban Jungle)", () => {
  const feed = (url: URL) =>
    url.pathname === "/collections/soldes/products.json" ? new Response(JSON.stringify(url.searchParams.get("page") === "1" ? collection : { products: [] })) : undefined;

  it("checks the market, reads one page and reports complete coverage", async () => {
    const { adapter, requests } = setup(feed);
    const res = await adapter.discover("/collections/soldes", 3);
    expect(res).toMatchObject({ path: "/collections/soldes", method: "http", pagesLoaded: 1, complete: true });
    expect(res.items).toHaveLength(6);
    expect(requests).toEqual(["/robots.txt", "/", "/collections/soldes/products.json?limit=250&page=1"]);
    expect(adapter.shopId).toBe("urban-jungle-ma");
    expect(adapter.dealPagePaths).toEqual(["/collections/soldes"]);
  });

  it("does not claim coverage when the page budget ends on a full page", async () => {
    const { adapter } = setup((url) => new Response(JSON.stringify({ products: fullPage(Number(url.searchParams.get("page"))) })));
    const res = await adapter.discover("/collections/soldes", 2);
    expect(res).toMatchObject({ pagesLoaded: 2, complete: false });
    expect(res.items).toHaveLength(500);
  });

  it("keeps pages already read when a later page fails, without claiming coverage", async () => {
    const { adapter } = setup((url) =>
      url.searchParams.get("page") === "1" ? new Response(JSON.stringify({ products: fullPage(1) })) : new Response("err", { status: 500 }));
    const res = await adapter.discover("/collections/soldes", 3);
    expect(res).toMatchObject({ pagesLoaded: 1, complete: false });
    expect(res.items).toHaveLength(250);
  });

  it("refuses prices when the storefront is not in MAD, before reading products", async () => {
    const { adapter, requests } = setup(feed, { home: '<script>Shopify.currency = {"active":"EUR","rate":"0.09"};</script>' });
    await expect(adapter.discover("/collections/soldes", 1)).rejects.toThrow(/Devise EUR/);
    expect(requests.some((r) => r.includes("products.json"))).toBe(false);
    const { adapter: unknown } = setup(feed, { home: "<html></html>" });
    await expect(unknown.discover("/collections/soldes", 1)).rejects.toThrow(/non vérifiable/);
  });

  it("refuses filtered, unsupported and foreign listing URLs", async () => {
    const { adapter } = setup(feed);
    await expect(adapter.discover("/collections/soldes?filter.v.price.gte=100", 1)).rejects.toThrow(/Filtres/);
    await expect(adapter.discover("/pages/a-propos", 1)).rejects.toThrow(/Rayon non pris en charge/);
    await expect(adapter.discover("https://evil.example/collections/soldes", 1)).rejects.toBeInstanceOf(DisallowedUrlError);
  });

  it("respects robots.txt", async () => {
    const { adapter } = setup(feed, { robots: "User-agent: *\nDisallow: /collections/\n" });
    await expect(adapter.discover("/collections/soldes", 1)).rejects.toBeInstanceOf(RobotsDisallowedError);
  });

  it("reads product fiches and reports deleted products as gone", async () => {
    const { adapter } = setup((url) => (url.pathname === `/products/${PUMA}.js` ? new Response(JSON.stringify(productJs)) : undefined));
    const ok = await adapter.fetchProduct(`https://ma.urbanjunglestore.com/collections/soldes/products/${PUMA}?variant=1`);
    expect(ok.kind === "ok" && ok.detail).toMatchObject({ url: `https://ma.urbanjunglestore.com/products/${PUMA}`, priceCents: 46900 });
    expect(await adapter.fetchProduct("https://ma.urbanjunglestore.com/products/retire")).toEqual({ kind: "gone", status: 404 });
    expect(await adapter.fetchProduct("https://ma.urbanjunglestore.com/pages/x")).toMatchObject({ kind: "error" });
  });

  it("reports an ambiguous price as an error, never as a vanished offer", async () => {
    const js = structuredClone(productJs);
    js.variants[0].price = 49900;
    const { adapter } = setup(() => new Response(JSON.stringify(js)));
    const r = await adapter.fetchProduct(`https://ma.urbanjunglestore.com/products/${PUMA}`);
    expect(r).toEqual({ kind: "error", message: "Extraction impossible : Prix différent selon la taille : choisir une taille avant de comparer" });
  });

  it("leaves the Marjane fetcher restricted to Marjane", async () => {
    const f = new PoliteFetcher({ userAgent: "test", minDelayMs: 0, timeoutMs: 1000, maxRetries: 0, respectRobots: false });
    await expect(f.get("https://ma.urbanjunglestore.com/")).rejects.toBeInstanceOf(DisallowedUrlError);
  });
});
