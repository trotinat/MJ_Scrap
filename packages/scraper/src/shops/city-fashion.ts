import { load } from "cheerio";
import { madToCents, parseAmount, type ListingItem, type ProductDetail, type ShopSearchFormConfig } from "@mdw/shared";
import { HttpError, PoliteFetcher, type FetcherOptions } from "../http";
import type { DetailResult, ListingResult, SiteAdapter } from "../adapter";
import { cleanTitle, detectBrand, extractModelRef } from "../normalize";
import { CITY_FASHION_SEARCH_FORM } from "@mdw/shared";

export const CITY_FASHION_ORIGIN = "https://cityfashion.ma";
export const CITY_FASHION_SHOP_ID = "city-fashion-ma";
export const CITY_FASHION_DEAL_PATHS = ["/25-promotions", "/promotions"];
const HOSTS = ["cityfashion.ma", "www.cityfashion.ma"] as const;

/** Public PrestaShop catalog connector. It obeys robots.txt and stops on access blocks. */
export class CityFashionAdapter implements SiteAdapter {
  readonly shopId = CITY_FASHION_SHOP_ID;
  readonly searchFormConfig: ShopSearchFormConfig = CITY_FASHION_SEARCH_FORM;
  readonly dealPagePaths = CITY_FASHION_DEAL_PATHS;
  private readonly fetcher: PoliteFetcher;

  constructor(opts: FetcherOptions) {
    this.fetcher = new PoliteFetcher({ ...opts, origin: CITY_FASHION_ORIGIN, allowedHosts: HOSTS, minDelayMs: Math.max(opts.minDelayMs, 5_000), respectRobots: true });
  }
  get requestCount() { return this.fetcher.requestCount; }

  async discover(path: string, _maxPages: number): Promise<ListingResult> {
    const url = cityFashionUrl(path, false);
    const res = await this.fetcher.get(url);
    if (res.status === 404 || res.status === 410) throw new HttpError(`Page introuvable (HTTP ${res.status})`, res.status, url);
    if (res.status >= 400) throw new HttpError(`HTTP ${res.status}`, res.status, url);
    const $ = load(res.body);
    const items: ListingItem[] = [];
    $("article.product-miniature, .product-miniature").each((_, card) => {
      const el = $(card);
      const anchor = el.find(".product-title a, a.thumbnail, a.product-thumbnail").first();
      const href = anchor.attr("href");
      const productUrl = href ? canonicalCityFashionUrl(href, true) : null;
      const title = cleanTitle(anchor.attr("title") || el.find(".product-title").text() || anchor.text());
      if (!productUrl || !title) return;
      const priceBox = el.find(".product-price-and-shipping").first();
      const priceCents = cents(priceBox.find("[content]").first().attr("content"))
        ?? money(priceBox.find(".price").first().text());
      const originalPriceCents = cents(priceBox.find(".regular-price[content]").attr("content"))
        ?? money(priceBox.find(".regular-price").first().text());
      const stockText = el.find(".product-availability, .availability").text() || el.text();
      const brand = cleanTitle(el.find(".product-brand, .manufacturer-name").text()) || null;
      const img = el.find("img").first();
      const imageUrl = safeImage(img.attr("data-src") || img.attr("data-original") || img.attr("src"));
      const discount = /(?:-|−)\s*(\d{1,2})\s*%/.exec(el.text());
      items.push({ sourceId: sourceId(productUrl), url: productUrl, title, imageUrl, priceCents,
        originalPriceCents: originalPriceCents !== priceCents ? originalPriceCents : null,
        advertisedDiscountPct: discount ? Number(discount[1]) : null, seller: "City Fashion", brand,
        reviewCount: null, rating: null, stock: /out of stock|rupture de stock|indisponible/i.test(stockText) ? "out_of_stock" : /in stock|en stock/i.test(stockText) ? "in_stock" : "unknown",
        listingPath: new URL(url).pathname });
    });
    const unique = [...new Map(items.map((item) => [item.url, item])).values()];
    return { path: new URL(url).pathname, items: unique, method: "http", pagesLoaded: 1, complete: false };
  }

  async fetchProduct(rawUrl: string): Promise<DetailResult> {
    const url = canonicalCityFashionUrl(rawUrl, true);
    if (!url) return { kind: "error", message: "URL produit City Fashion invalide." };
    let res;
    try { res = await this.fetcher.get(url); }
    catch (err) { if (err instanceof HttpError) return { kind: "error", message: err.message, status: err.status }; throw err; }
    if (res.status === 404 || res.status === 410) return { kind: "gone", status: res.status };
    if (res.status >= 400) return { kind: "error", message: `HTTP ${res.status}`, status: res.status };
    const $ = load(res.body);
    const title = cleanTitle($("h1").first().text() || $("meta[property='og:title']").attr("content") || $("title").text());
    if (!title || !$("#product, .product-container, .product-information").length) return { kind: "error", message: "Fiche produit City Fashion non reconnue." };
    const priceCents = cents($("meta[property='product:price:amount'], [itemprop='price']").first().attr("content"))
      ?? cents($(".current-price-value[content], .current-price [content]").first().attr("content"))
      ?? money($(".current-price .price, .current-price-value, .product-prices .price").first().text());
    if (!priceCents) return { kind: "error", message: "Prix City Fashion absent ou illisible." };
    const originalPriceCents = cents($(".regular-price[content]").first().attr("content")) ?? money($(".regular-price").first().text());
    const sku = cleanTitle($("[itemprop='sku']").attr("content") || $(".product-reference span").text());
    const rawSpecs: Record<string, string> = {};
    $("#product-details .data-sheet dt, .product-features dt").each((_, dt) => {
      const label = cleanTitle($(dt).text()); const value = cleanTitle($(dt).next("dd").text());
      if (label && value) rawSpecs[label.slice(0, 80)] = value.slice(0, 400);
    });
    if (sku) rawSpecs["Référence"] = sku;
    const stockText = $("#product-availability, .product-availability, [itemprop='availability']").text() || $("[itemprop='availability']").attr("href") || "";
    const imageUrl = safeImage($("meta[property='og:image']").attr("content") || $(".product-cover img").attr("src"));
    const breadcrumb = $(".breadcrumb li").map((_, li) => cleanTitle($(li).text())).get().filter(Boolean);
    const pct = /(?:-|−)\s*(\d{1,2})\s*%/.exec($("body").text());
    const detail: ProductDetail = { sourceId: sku || sourceId(url), url: canonicalCityFashionUrl(res.url, true) ?? url, title,
      brand: detectBrand(title, rawSpecs["Marque"]), modelRef: extractModelRef(title, rawSpecs), imageUrl, priceCents,
      originalPriceCents: originalPriceCents !== priceCents ? originalPriceCents : null,
      advertisedDiscountPct: pct ? Number(pct[1]) : null, seller: "City Fashion",
      stock: /out of stock|rupture|indisponible/i.test(stockText) ? "out_of_stock" : /in stock|en stock|available/i.test(stockText) ? "in_stock" : "unknown",
      rating: null, reviewCount: null, breadcrumb, rawSpecs, extraction: "html-text", warnings: [] };
    return { kind: "ok", detail };
  }
  async close() {}
}

export function createCityFashionAdapter(opts: FetcherOptions) { return new CityFashionAdapter(opts); }
function cityFashionUrl(raw: string, product: boolean) {
  const result = canonicalCityFashionUrl(raw, product);
  if (!result) throw new Error("Rayon City Fashion invalide.");
  return result;
}
function canonicalCityFashionUrl(raw: string, product: boolean): string | null {
  try {
    const u = new URL(raw, CITY_FASHION_ORIGIN);
    if (u.protocol !== "https:" || !HOSTS.includes(u.hostname as typeof HOSTS[number]) || u.username || u.password) return null;
    if (u.pathname.startsWith("/fr/") || /\/(?:cart|order|my-account|login|search|addresses|identity|authentication)(?:\/|$)/i.test(u.pathname)) return null;
    if (product ? !/\.html$/i.test(u.pathname) : !(u.pathname === "/" || u.pathname === "/promotions" || /^\/\d+-[a-z0-9-]+$/i.test(u.pathname))) return null;
    u.hostname = "cityfashion.ma"; u.hash = ""; u.search = "";
    return u.toString();
  } catch { return null; }
}
function sourceId(url: string) { return decodeURIComponent(new URL(url).pathname.split("/").pop() || "city-fashion-product").replace(/\.html$/i, "").toLowerCase(); }
function cents(raw?: string) { const n = raw ? Number(raw.replace(",", ".")) : NaN; return Number.isFinite(n) && n > 0 ? madToCents(n) : null; }
function money(raw: string) { const n = parseAmount(raw); return n !== null && n > 0 ? madToCents(n) : null; }
function safeImage(raw?: string) { try { const u = raw ? new URL(raw, CITY_FASHION_ORIGIN) : null; return u && u.protocol === "https:" && HOSTS.includes(u.hostname as typeof HOSTS[number]) ? u.toString() : null; } catch { return null; } }
