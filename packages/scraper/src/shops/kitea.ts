import { load } from "cheerio";
import { madToCents, parseAmount, type ListingItem, type ProductDetail, type ShopSearchFormConfig } from "@mdw/shared";
import { HttpError, PoliteFetcher, type FetcherOptions } from "../http";
import type { DetailResult, ListingResult, SiteAdapter } from "../adapter";
import { cleanTitle, detectBrand, extractModelRef } from "../normalize";
import { KITEA_SEARCH_FORM } from "@mdw/shared";

export const KITEA_ORIGIN = "https://www.kitea.com";
export const KITEA_SHOP_ID = "kitea-ma";
export const KITEA_DEAL_PATHS = ["/destockagekitea.html", "/les-petits-prix-de-la-semaine.html"];
const HOSTS = ["www.kitea.com", "kitea.com"] as const;

export interface KiteaAdapterOptions extends FetcherOptions {}

/** Magento storefront adapter. It stays on public category/product pages and obeys Kitea's crawl delay. */
export class KiteaAdapter implements SiteAdapter {
  readonly shopId = KITEA_SHOP_ID;
  readonly searchFormConfig: ShopSearchFormConfig = KITEA_SEARCH_FORM;
  readonly dealPagePaths = KITEA_DEAL_PATHS;
  private readonly fetcher: PoliteFetcher;

  constructor(opts: KiteaAdapterOptions) {
    this.fetcher = new PoliteFetcher({ ...opts, origin: KITEA_ORIGIN, allowedHosts: HOSTS, minDelayMs: Math.max(opts.minDelayMs, 10_000), respectRobots: true });
  }

  get requestCount() { return this.fetcher.requestCount; }

  async discover(path: string, _maxPages: number): Promise<ListingResult> {
    const url = kiteaUrl(path);
    const res = await this.fetcher.get(url);
    if (res.status === 404 || res.status === 410) throw new HttpError(`Page introuvable (HTTP ${res.status})`, res.status, url);
    if (res.status >= 400) throw new HttpError(`HTTP ${res.status}`, res.status, url);
    const $ = load(res.body);
    const items: ListingItem[] = [];
    $("li.product-item").each((_, card) => {
      const el = $(card);
      const anchor = el.find("a.product-item-link").first();
      const href = anchor.attr("href");
      const title = cleanTitle(anchor.attr("title") || anchor.text());
      const productUrl = href ? canonicalKiteaUrl(href) : null;
      if (!title || !productUrl) return;
      const priceBox = el.find(".price-box").first();
      const priceCents = centsFrom(priceBox.find('[data-price-type="finalPrice"]').attr("data-price-amount"))
        ?? centsFrom(priceBox.find('[data-price-type="basePrice"]').attr("data-price-amount"))
        ?? moneyFromText(priceBox.find(".special-price .price, .price-final_price .price, .price").first().text());
      const originalPriceCents = centsFrom(priceBox.find('[data-price-type="oldPrice"]').attr("data-price-amount"))
        ?? moneyFromText(priceBox.find(".old-price .price").first().text());
      const discountMatch = /(?:-|−)\s*(\d{1,2})\s*%/.exec(el.text());
      const image = el.find("img.product-image-photo").first();
      const imageUrl = safeImage(image.attr("data-src") || image.attr("src"));
      const text = el.text();
      items.push({
        sourceId: sourceId(productUrl), url: productUrl, title, imageUrl,
        priceCents, originalPriceCents: originalPriceCents !== priceCents ? originalPriceCents : null,
        advertisedDiscountPct: discountMatch ? Number(discountMatch[1]) : null,
        seller: "KITEA", reviewCount: null, rating: null, brand: null,
        stock: /en stock/i.test(text) ? "in_stock" : /rupture de stock|indisponible/i.test(text) ? "out_of_stock" : "unknown",
        listingPath: new URL(url).pathname,
      });
    });
    const unique = [...new Map(items.map((i) => [i.url, i])).values()];
    return { path: new URL(url).pathname, items: unique, method: "http", pagesLoaded: 1, complete: false };
  }

  async fetchProduct(rawUrl: string): Promise<DetailResult> {
    const url = canonicalKiteaUrl(rawUrl);
    if (!url) return { kind: "error", message: "URL produit KITEA invalide." };
    let res;
    try { res = await this.fetcher.get(url); }
    catch (err) { if (err instanceof HttpError) return { kind: "error", message: err.message, status: err.status }; throw err; }
    if (res.status === 404 || res.status === 410) return { kind: "gone", status: res.status };
    if (res.status >= 400) return { kind: "error", message: `HTTP ${res.status}`, status: res.status };
    const $ = load(res.body);
    const title = cleanTitle($("h1.page-title span").first().text() || $("meta[property='og:title']").attr("content") || $("title").text());
    if (!title || !$(".product-info-main, .product-info-price").length) return { kind: "error", message: "Fiche produit KITEA non reconnue." };
    const priceBox = $(".product-info-main .price-box, .product-info-price .price-box").first();
    const priceCents = centsFrom(priceBox.find('[data-price-type="finalPrice"]').attr("data-price-amount"))
      ?? centsFrom(priceBox.find('[data-price-type="basePrice"]').attr("data-price-amount"))
      ?? moneyFromText(priceBox.find(".special-price .price, .price").first().text());
    if (priceCents === null || priceCents <= 0) return { kind: "error", message: "Prix KITEA absent ou illisible." };
    const original = centsFrom(priceBox.find('[data-price-type="oldPrice"]').attr("data-price-amount")) ?? moneyFromText(priceBox.find(".old-price .price").first().text());
    const sku = cleanTitle($("[itemprop='sku']").attr("content") || $(".product.attribute.sku .value").text() || $("meta[property='product:retailer_item_id']").attr("content") || "");
    const rawSpecs: Record<string, string> = {};
    $("#additional .data.item, .product.attribute").each((_, row) => {
      const label = cleanTitle($(row).find(".col.label, .type").first().text());
      const value = cleanTitle($(row).find(".col.data, .value").first().text());
      if (label && value) rawSpecs[label.slice(0, 80)] = value.slice(0, 400);
    });
    if (sku) rawSpecs["Référence"] = sku;
    const imageUrl = safeImage($("meta[property='og:image']").attr("content") || $(".gallery-placeholder img").attr("src"));
    const breadcrumb = $(".breadcrumbs li").map((_, li) => cleanTitle($(li).text())).get().filter(Boolean);
    const stockText = $(".product-info-stock-sku, .stock").text();
    const pct = /(?:-|−)\s*(\d{1,2})\s*%/.exec($("body").text());
    const detail: ProductDetail = {
      sourceId: sku || sourceId(url), url: canonicalKiteaUrl(res.url) ?? url, title,
      brand: detectBrand(title, rawSpecs["Marque"]), modelRef: extractModelRef(title, rawSpecs), imageUrl,
      priceCents, originalPriceCents: original !== priceCents ? original : null,
      advertisedDiscountPct: pct ? Number(pct[1]) : null, seller: "KITEA",
      stock: /en stock/i.test(stockText) ? "in_stock" : /rupture|indisponible/i.test(stockText) ? "out_of_stock" : "unknown",
      rating: null, reviewCount: null, breadcrumb, rawSpecs, extraction: "html-text", warnings: [],
    };
    return { kind: "ok", detail };
  }

  async close() {}
}

export function createKiteaAdapter(opts: KiteaAdapterOptions): KiteaAdapter { return new KiteaAdapter(opts); }

function kiteaUrl(path: string): string {
  if (path.startsWith("/") && !path.startsWith("//")) return canonicalKiteaUrl(new URL(path, KITEA_ORIGIN).toString())!;
  return canonicalKiteaUrl(path) ?? (() => { throw new Error("Rayon KITEA invalide."); })();
}
function canonicalKiteaUrl(raw: string): string | null {
  try {
    const u = new URL(raw, KITEA_ORIGIN);
    if (u.protocol !== "https:" || !HOSTS.includes(u.hostname as typeof HOSTS[number]) || u.username || u.password) return null;
    if (!(u.pathname === "/" || /\.html$/i.test(u.pathname) || u.pathname === "/literie-bain") || /\/catalog\/(?:category|product)\/view|\/search/i.test(u.pathname)) return null;
    u.hostname = "www.kitea.com"; u.hash = ""; u.search = "";
    return u.toString();
  } catch { return null; }
}
function sourceId(url: string) { return decodeURIComponent(new URL(url).pathname.split("/").pop() || "kitea-product").replace(/\.html$/i, "").toLowerCase(); }
function centsFrom(raw?: string) { const n = raw ? Number(raw) : NaN; return Number.isFinite(n) && n > 0 ? madToCents(n) : null; }
function moneyFromText(raw: string) { const n = parseAmount(raw); return n !== null && n > 0 ? madToCents(n) : null; }
function safeImage(raw?: string) { try { const u = raw ? new URL(raw, KITEA_ORIGIN) : null; return u && u.protocol === "https:" && HOSTS.includes(u.hostname as typeof HOSTS[number]) ? u.toString() : null; } catch { return null; } }
