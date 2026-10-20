import { describe, expect, it, vi } from "vitest";
import { AccessBlockedError, createCityFashionAdapter } from "../src";

// Sanitized markup from City Fashion's public PrestaShop theme, observed 2026-10-20.
const listing = `<div id="products"><article class="item-product"><div class="thumbnail-container product-miniature js-product-miniature">
  <a class="thumbnail product-thumbnail" href="https://cityfashion.ma/7008-37601-new-balance-2002r-steel-blue.html#/29-pointures-38"><img data-src="https://cityfashion.ma/28512-home_default/new-balance.jpg" src="data:image/gif;base64,placeholder" alt="Baskets New Balance"></a>
  <div class="manufacturer"><a>New Balance</a></div>
  <h3><a class="product_name one_line" title="New Balance 2002R Steel Blue" href="https://cityfashion.ma/7008-37601-new-balance-2002r-steel-blue.html#/29-pointures-38">New Balance 2002R Steel Blue</a></h3>
  <div class="product-price-and-shipping"><span class="regular-price">1 799,00&nbsp;MAD</span><span class="price price-sale">1 079,40&nbsp;MAD</span><span class="discount-percentage discount-product">-40%</span></div>
  <div class="availability"><div class="availability-list out-of-stock">Disponibilité: <span>Rupture de stock</span></div></div>
</div></article></div>`;

const product = `<html><head><meta property="product:price:currency" content="MAD"></head><body id="product">
  <nav class="breadcrumb"><li><a href="/3-hommes">Homme</a></li><li><a href="/7008-37609-new-balance-2002r-steel-blue.html#/pointures-44">New Balance</a></li></nav>
  <h1>New Balance 2002R Steel Blue</h1><div class="product-information"></div>
  <div class="product-prices"><span class="regular-price">1 799,00 MAD</span><div class="current-price"><span class="current-price-value" content="1079.4">1 079,40 MAD</span><span class="discount discount-percentage">Économisez 40%</span></div></div>
  <div id="product-availability">Derniers articles en stock</div><div class="product-reference"><span>M2002RFB</span></div>
  <aside>Autre produit -60%</aside>
</body></html>`;

function fixtureAdapter(body: string, status = 200) {
  const fetchImpl = vi.fn(async (input: string | URL | Request) => new Response(String(input).endsWith("/robots.txt") ? "User-agent: *\nAllow: /" : body, { status: String(input).endsWith("/robots.txt") ? 200 : status }));
  return { adapter: createCityFashionAdapter({ userAgent: "HawtaFixtureCheck/1.0", minDelayMs: 0, timeoutMs: 5000, maxRetries: 0, respectRobots: true, fetchImpl: fetchImpl as typeof fetch, sleep: async () => {} }), fetchImpl };
}

describe("City Fashion public storefront", () => {
  it("reads the real theme's product_name titles, MAD prices, brand, image and explicit stock", async () => {
    const { adapter } = fixtureAdapter(listing);
    const result = await adapter.discover("/25-promotions", 1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ title: "New Balance 2002R Steel Blue", brand: "New Balance", priceCents: 107940, originalPriceCents: 179900, advertisedDiscountPct: 40, stock: "out_of_stock", imageUrl: "https://cityfashion.ma/28512-home_default/new-balance.jpg", url: "https://cityfashion.ma/7008-37601-new-balance-2002r-steel-blue.html" });
    expect(result.complete).toBe(false);
  });

  it("reports unrecognized markup instead of claiming a successful empty catalog", async () => {
    await expect(fixtureAdapter("<h1>Promotions</h1>").adapter.discover("/25-promotions", 1)).rejects.toThrow("Catalogue City Fashion non reconnu");
  });

  it("rejects prices without proof of MAD", async () => {
    await expect(fixtureAdapter(listing.replaceAll("MAD", "EUR")).adapter.discover("/25-promotions", 1)).rejects.toThrow("Devise City Fashion non vérifiée");
  });

  it("keeps offer identity stable and reads only the requested product's discount", async () => {
    const result = await fixtureAdapter(product).adapter.fetchProduct("https://cityfashion.ma/7008-37609-new-balance-2002r-steel-blue.html");
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.detail).toMatchObject({ sourceId: "7008-37609-new-balance-2002r-steel-blue", priceCents: 107940, originalPriceCents: 179900, advertisedDiscountPct: 40, stock: "in_stock", rawSpecs: { Référence: "M2002RFB" } });
  });

  it("does not assign another size's price and stock to a sold-out combination", async () => {
    const result = await fixtureAdapter(product).adapter.fetchProduct("https://cityfashion.ma/7008-37601-new-balance-2002r-steel-blue.html");
    expect(result).toMatchObject({ kind: "error", message: expect.stringContaining("autre pointure") });
  });

  it("does not use a recommendation's old price or misread unavailable as available", async () => {
    const body = product.replace('<span class="regular-price">1 799,00 MAD</span>', "").replace("Derniers articles en stock", "Unavailable").replace("<aside>", '<aside><span class="regular-price">3 000,00 MAD</span>');
    const result = await fixtureAdapter(body).adapter.fetchProduct("https://cityfashion.ma/7008-37609-new-balance-2002r-steel-blue.html");
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.detail).toMatchObject({ originalPriceCents: null, stock: "out_of_stock" });
  });

  it("propagates a 403 without retrying or fabricating an empty result", async () => {
    const { adapter, fetchImpl } = fixtureAdapter("<h1>Sorry, you have been blocked</h1>", 403);
    await expect(adapter.discover("/25-promotions", 1)).rejects.toBeInstanceOf(AccessBlockedError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
