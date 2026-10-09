import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  AccessBlockedError,
  assertAllowedUrl,
  canonicalProductKey,
  canonicalProductUrl,
  detectBrand,
  extractModelRef,
  findSeller,
  MarjaneAdapter,
  parseListingHtml,
  parsePriceLines,
  parseProductPage,
  PoliteFetcher,
  ProductParseError,
  RobotsDisallowedError,
  RobotsRules,
  siteUrl,
  sourceIdFromUrl,
} from "../src";

const dir = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(path.join(dir, "../fixtures/synthetic", name), "utf8");

describe("price parsing (observed renderings)", () => {
  it("split integer + centimes nodes", () => {
    expect(parsePriceLines(["4149", "00DH", "6500.00 DH", "-36%"])).toMatchObject({
      priceCents: 414900,
      originalPriceCents: 650000,
      advertisedDiscountPct: 36,
    });
  });
  it("flattened card text with seller glued to the price", () => {
    const r = parsePriceLines(["Vendu par MARJANE89900DH-31%1299 DH"]);
    expect(r).toMatchObject({ priceCents: 89900, originalPriceCents: 129900, advertisedDiscountPct: 31 });
    expect(r.warnings).toEqual([]);
  });
  it("flattened price with non-zero centimes", () => {
    expect(parsePriceLines(["5195DH", "-13%", "59.95 DH"])).toMatchObject({ priceCents: 5195, originalPriceCents: 5995 });
  });
  it("uses the discount to pick the right reading", () => {
    // "299DH" with -40% vs 499 DH: 299,00 is consistent, 2,99 is not.
    expect(parsePriceLines(["29900DH", "-40%", "499 DH"]).priceCents).toBe(29900);
  });
  it("French formatted amount", () => {
    expect(parsePriceLines(["7999", ",00 DH", "9 499,00 DH", "-16%"])).toMatchObject({ priceCents: 799900, originalPriceCents: 949900 });
  });
  it("single price without discount", () => {
    expect(parsePriceLines(["1 299,00 DH"])).toMatchObject({ priceCents: 129900, originalPriceCents: null, advertisedDiscountPct: null });
  });
  it("flags an inconsistent advertised discount", () => {
    const r = parsePriceLines(["1000 DH", "-50%", "1100 DH"]);
    expect(r.warnings.length).toBe(1);
  });
  it("no price", () => {
    expect(parsePriceLines(["Guide d'achat"]).priceCents).toBeNull();
  });
});

describe("seller extraction", () => {
  it("handles split and flattened forms", () => {
    expect(findSeller(["Vendu par", "MARJANE", "899"])).toBe("MARJANE");
    expect(findSeller(["Vendu par ElectroElaissi449900DH-31%6500 DH"])).toBe("ElectroElaissi");
    expect(findSeller(["(13 avis)Vendu par ElectroElaissi139900DH-26%1899 DH"])).toBe("ElectroElaissi");
  });
});

describe("URLs and identifiers", () => {
  it("canonicalizes product URLs and extracts the source id", () => {
    const u = "https://www.marjanemall.ma/p/televiseur-samsung-qled-55-pouces-modele-qa55q6faauxmv-abbb332004180907425?utm=x#top";
    expect(canonicalProductUrl(u)).toBe("https://www.marjanemall.ma/p/televiseur-samsung-qled-55-pouces-modele-qa55q6faauxmv-abbb332004180907425");
    expect(sourceIdFromUrl(u)).toBe("abbb332004180907425");
    expect(sourceIdFromUrl("/p/deodorant-gel-secret-lavande-73-g-sans-alcool-protection-48-h-aaaaa50123")).toBe("aaaaa50123");
    expect(canonicalProductUrl("https://evil.example/p/x-123456")).toBeNull();
    expect(canonicalProductUrl("/tv-son-photo")).toBeNull();
  });
  it("blocks non-Marjane hosts (SSRF guard)", () => {
    expect(() => assertAllowedUrl("http://www.marjanemall.ma/")).toThrow();
    expect(() => assertAllowedUrl("https://169.254.169.254/latest")).toThrow();
    expect(() => assertAllowedUrl("https://www.marjanemall.ma.evil.com/")).toThrow();
    expect(() => assertAllowedUrl("https://user:pw@www.marjanemall.ma/")).toThrow();
    expect(() => siteUrl("//evil.example/x")).toThrow();
    expect(siteUrl("/tv-son-photo")).toBe("https://www.marjanemall.ma/tv-son-photo");
  });
});

describe("listing parser", () => {
  const items = parseListingHtml(fixture("listing-tv.html"), "/tv-son-photo");
  it("extracts one item per product with price, not text links", () => {
    expect(items.map((i) => i.sourceId).sort()).toEqual(["aaab12345", "aaac99887", "aaapd01916", "abbb332004180907425"].sort());
  });
  it("parses split-node card", () => {
    const mgs = items.find((i) => i.sourceId === "aaab12345")!;
    expect(mgs).toMatchObject({ priceCents: 89900, originalPriceCents: 129900, advertisedDiscountPct: 31, seller: "MARJANE" });
    expect(mgs.title).toContain('Téléviseur 31.5" HD');
    expect(mgs.imageUrl).toBe("https://www.marjanemall.ma/media/catalog/product/m332231.jpg");
  });
  it("parses flattened card", () => {
    const s = items.find((i) => i.sourceId === "abbb332004180907425")!;
    expect(s).toMatchObject({ priceCents: 449900, originalPriceCents: 650000, advertisedDiscountPct: 31, seller: "ElectroElaissi" });
    expect(s.title).toBe("Téléviseur Samsung QLED 55 pouces – Modèle QA55Q6FAAUXMV");
    expect(s.url).not.toContain("utm");
  });
  it("parses review count", () => {
    expect(items.find((i) => i.sourceId === "aaac99887")!.reviewCount).toBe(13);
  });
});

describe("product page parser", () => {
  it("extracts the main product, not the related one", () => {
    const d = parseProductPage(fixture("product-samsung-qled55.html"), "https://www.marjanemall.ma/p/televiseur-samsung-qled-55-pouces-modele-qa55q6faauxmv-abbb332004180907425");
    expect(d).toMatchObject({
      sourceId: "abbb332004180907425",
      priceCents: 414900,
      originalPriceCents: 650000,
      advertisedDiscountPct: 36,
      seller: "ElectroElaissi",
      stock: "in_stock",
      brand: "Samsung",
      modelRef: "QA55Q6FAAUXMV",
      extraction: "html-text",
    });
    expect(d.rawSpecs).toMatchObject({ Marque: "SAMSUNG", "Classe de diagonale": '55"', "Nombre de ports HDMI": "3" });
    expect(d.imageUrl).toBe("https://www.marjanemall.ma/media/catalog/product/qa55q6f.jpg");
  });
  it("prefers JSON-LD when consistent with the visible price", () => {
    const d = parseProductPage(fixture("product-jsonld-laptop.html"), "https://www.marjanemall.ma/p/pc-portable-lenovo-ideapad-slim-5-aaalp55501");
    expect(d).toMatchObject({
      priceCents: 799900,
      originalPriceCents: 949900,
      advertisedDiscountPct: 16,
      brand: "Lenovo",
      modelRef: "82XF00ABFE",
      stock: "in_stock",
      rating: 4.5,
      reviewCount: 12,
      seller: "MARJANE",
      extraction: "json-ld",
    });
    expect(d.breadcrumb).toEqual(["Informatique & Gaming", "Ordinateurs portables"]);
    expect(d.rawSpecs["Mémoire vive (RAM)"]).toBe("16 Go");
  });
  it("throws on pages without a product", () => {
    expect(() => parseProductPage(fixture("not-found.html"), "https://www.marjanemall.ma/p/x-aaaa00001")).toThrow(ProductParseError);
  });
});

describe("normalization, deduplication and variants", () => {
  it("detects brands and model references", () => {
    expect(detectBrand("Taurus friteuse sans huile MA9173003A 9L")).toBe("Taurus");
    expect(detectBrand("Produit", "SAMSUNG")).toBe("Samsung");
    expect(extractModelRef("Taurus friteuse sans huile MA9173003A 9L 1800W 12 programmes")).toBe("MA9173003A");
    expect(extractModelRef("Kenz Aspirateur sans sac 3-en-1 2000W filtre HEPA GO-9345")).toBe("GO9345");
    expect(extractModelRef("Smart TV 55 pouces 4K USB-C 1920x1080")).toBeNull();
  });
  it("merges two sellers' listings of the same model, never different variants", () => {
    const a = canonicalProductKey("Samsung", "QA55Q6FAAUXMV", "id1", { screen_size_in: 55 });
    const b = canonicalProductKey("Samsung", "QA55Q6FAAUXMV", "id2", { screen_size_in: 55 });
    const c = canonicalProductKey("Samsung", "SMA556B", "id3", { storage_gb: 128 });
    const d = canonicalProductKey("Samsung", "SMA556B", "id4", { storage_gb: 256 });
    expect(a).toBe(b);
    expect(c).not.toBe(d);
    expect(canonicalProductKey(null, "QA55Q6FAAUXMV", "id5")).toBe("src:id5");
  });
});

describe("robots.txt", () => {
  const robots = RobotsRules.parse(
    `User-agent: CCBot\nDisallow: /\n\nUser-agent: *\nDisallow: /api/\nDisallow: /_next/\nDisallow: /checkout\nAllow: /pub/media/\nDisallow: /*?sortBy=\n`,
    "Mozilla/5.0 (compatible; MarjaneDealsWatcher/1.0)",
  );
  it("applies the * group to our user agent", () => {
    expect(robots.isAllowed("/tv-son-photo")).toBe(true);
    expect(robots.isAllowed("/p/tv-aaaa1234")).toBe(true);
    expect(robots.isAllowed("/api/products")).toBe(false);
    expect(robots.isAllowed("/checkout/cart")).toBe(false);
    expect(robots.isAllowed("/tv?sortBy=price")).toBe(false);
    expect(robots.isAllowed("/pub/media/x.jpg")).toBe(true);
  });
});

describe("PoliteFetcher", () => {
  const robotsBody = "User-agent: *\nDisallow: /api/\n";
  const make = (handler: (url: string) => Response | Promise<Response>) => {
    const sleeps: number[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response(robotsBody, { status: 200 });
      return handler(url);
    }) as unknown as typeof fetch;
    const f = new PoliteFetcher({
      userAgent: "test",
      minDelayMs: 1000,
      timeoutMs: 1000,
      maxRetries: 2,
      respectRobots: true,
      fetchImpl,
      sleep: async (ms) => void sleeps.push(ms),
    });
    return { f, fetchImpl, sleeps };
  };

  it("waits between requests (politeness)", async () => {
    const { f, sleeps } = make(() => new Response("<html></html>", { status: 200 }));
    await f.get("https://www.marjanemall.ma/a");
    await f.get("https://www.marjanemall.ma/b");
    expect(sleeps.some((s) => s >= 900)).toBe(true);
  });
  it("retries transient errors with a bound", async () => {
    let n = 0;
    const { f } = make(() => (++n < 3 ? new Response("err", { status: 502 }) : new Response("ok", { status: 200 })));
    await expect(f.get("https://www.marjanemall.ma/x")).resolves.toMatchObject({ status: 200 });
    expect(n).toBe(3);
  });
  it("gives up after maxRetries", async () => {
    const { f } = make(() => new Response("err", { status: 503 }));
    await expect(f.get("https://www.marjanemall.ma/x")).rejects.toThrow(/HTTP 503/);
  });
  it("stops on access blocks (no bypass)", async () => {
    const { f } = make(() => new Response("<html>captcha</html>", { status: 403 }));
    await expect(f.get("https://www.marjanemall.ma/x")).rejects.toBeInstanceOf(AccessBlockedError);
  });
  it("refuses robots-disallowed paths", async () => {
    const { f } = make(() => new Response("ok"));
    await expect(f.get("https://www.marjanemall.ma/api/x")).rejects.toBeInstanceOf(RobotsDisallowedError);
  });
});

describe("MarjaneAdapter (HTTP mode, fixtures)", () => {
  it("discovers listings and reports gone products", async () => {
    const listing = fixture("listing-tv.html");
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow: /api/\n");
      if (url.includes("/p/")) return new Response(fixture("not-found.html"), { status: 404 });
      return new Response(listing, { status: 200 });
    }) as typeof fetch;
    const adapter = new MarjaneAdapter({
      userAgent: "test",
      minDelayMs: 0,
      timeoutMs: 1000,
      maxRetries: 0,
      respectRobots: true,
      renderMode: "never",
      renderTimeoutMs: 1000,
      fetchImpl,
      sleep: async () => undefined,
    });
    const res = await adapter.discover("/tv-son-photo", 1);
    expect(res.method).toBe("http");
    expect(res.items).toHaveLength(4);
    expect(await adapter.fetchProduct(res.items[0]!.url)).toEqual({ kind: "gone", status: 404 });
  });
});

describe("filtered listing URLs", () => {
  it("are always rendered in the browser (server HTML ignores the filters)", async () => {
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow: /api/\nDisallow: /*SID=\n");
      return new Response(fixture("listing-tv.html"), { status: 200 });
    }) as typeof fetch;
    const adapter = new MarjaneAdapter({
      userAgent: "test", minDelayMs: 0, timeoutMs: 1000, maxRetries: 0, respectRobots: true,
      renderMode: "auto", renderTimeoutMs: 1000, fetchImpl, sleep: async () => undefined,
    });
    const rendered: string[] = [];
    (adapter as unknown as { renderer: unknown }).renderer = {
      render: async (u: string) => (rendered.push(u), fixture("listing-tv.html")),
      close: async () => undefined,
    };
    const path = "/boutique-officielle/adidas?maas_46800=42&maas_28003=Homme";
    const res = await adapter.discover(path, 2);
    expect(res.method).toBe("browser");
    expect(rendered).toEqual([`https://www.marjanemall.ma${path}`]);
    const plain = await adapter.discover("/tv-son-photo", 2);
    expect(plain.method).toBe("http");
  });
});
