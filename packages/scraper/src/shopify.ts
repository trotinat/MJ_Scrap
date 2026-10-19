import { madToCents, type ListingItem, type ProductDetail, type ShopSearchFormConfig, type StockStatus } from "@mdw/shared";
import type { DetailResult, ListingResult, SiteAdapter } from "./adapter";
import { HttpError, PoliteFetcher, type FetcherOptions } from "./http";
import { canonicalBrand, cleanTitle, extractModelRef } from "./normalize";
import { safeHttpUrl } from "./parse/dom";
import { ProductParseError } from "./parse/product";
import { assertAllowedUrl } from "./url";

/** A Shopify storefront serving one market in one currency. */
export interface ShopifyShop {
  shopId: string;
  name: string;
  origin: string;
  hosts: string[];
  currency: string;
  country: string;
  seller: string;
  dealPagePaths: string[];
  collections: { path: string; label: string }[];
  searchFormConfig: ShopSearchFormConfig;
  brandAliases?: Record<string, string>;
}

interface Variant {
  size: string | null;
  priceCents: number;
  compareAtCents: number | null;
  available: boolean | null;
  sku: string | null;
}

export interface ShopifyProduct {
  id: string;
  handle: string;
  title: string;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  image: string | null;
  variants: Variant[];
}

const PAGE_SIZE = 250;
const PLACEHOLDER_SIZES = /^(default title|misc|ns)$/i;
const GENDER_TAGS: Record<string, string> = { MEN: "Homme", WOMEN: "Femme", BOY: "Garçon", GIRL: "Fille" };
const TYPE_LABELS: Record<string, string> = { footwear: "Chaussures", clothing: "Vêtements", accessories: "Accessoires" };

type Raw = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function parseJson(body: string): Raw | null {
  try {
    const v: unknown = JSON.parse(body);
    return v && typeof v === "object" ? (v as Raw) : null;
  } catch {
    return null;
  }
}

/** `/products.json` gives prices as "249.00" strings, `/products/<handle>.js` as integer centimes. */
export function toShopifyProduct(raw: unknown, priceUnit: "mad" | "cents"): ShopifyProduct | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Raw;
  const id = typeof p.id === "number" || typeof p.id === "string" ? String(p.id) : "";
  const handle = str(p.handle);
  const title = str(p.title);
  if (!/^\d+$/.test(id) || !handle || !/^[a-z0-9][a-z0-9-]*$/i.test(handle) || !title) return null;
  const options = (Array.isArray(p.options) ? p.options : []).map((o) => (typeof o === "string" ? o : str((o as Raw)?.name) ?? ""));
  const sizeIndex = options.findIndex((o) => /^(size|taille|pointure)$/i.test(o.trim()));
  const cents = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : typeof v === "string" && /^\d+(\.\d{1,2})?$/.test(v) ? Number(v) : NaN;
    if (!Number.isFinite(n) || n <= 0) return null;
    return priceUnit === "cents" ? Math.round(n) : madToCents(n);
  };
  const variants = (Array.isArray(p.variants) ? p.variants : []).flatMap((v): Variant[] => {
    const r = (v ?? {}) as Raw;
    const priceCents = cents(r.price);
    if (!priceCents) return [];
    return [{
      size: sizeIndex >= 0 ? str(r[`option${sizeIndex + 1}`]) : null,
      priceCents,
      compareAtCents: cents(r.compare_at_price),
      available: typeof r.available === "boolean" ? r.available : null,
      sku: str(r.sku),
    }];
  });
  const first = Array.isArray(p.images) ? p.images[0] : undefined;
  const tags = Array.isArray(p.tags) ? p.tags.filter((t): t is string => typeof t === "string") : (str(p.tags)?.split(",").map((t) => t.trim()) ?? []);
  return {
    id,
    handle,
    title,
    vendor: str(p.vendor),
    productType: str(p.product_type) ?? str(p.type),
    tags,
    image: str(typeof first === "string" ? first : (first as Raw | undefined)?.src) ?? str(p.featured_image),
    variants,
  };
}

/** One firm price for the offer: the sizes for sale must agree, otherwise a size has to be chosen first. */
function quote(variants: Variant[]) {
  const forSale = variants.some((v) => v.available) ? variants.filter((v) => v.available) : variants;
  if (new Set(forSale.map((v) => v.priceCents)).size !== 1) return null;
  const priceCents = forSale[0]!.priceCents;
  const compares = new Set(forSale.map((v) => v.compareAtCents));
  const old = compares.size === 1 ? forSale[0]!.compareAtCents : null;
  const originalPriceCents = old && old > priceCents ? old : null;
  return {
    priceCents,
    originalPriceCents,
    advertisedDiscountPct: originalPriceCents ? Math.round((1 - priceCents / originalPriceCents) * 100) : null,
    oldPriceVaries: compares.size > 1,
  };
}

function stockOf(variants: Variant[]): StockStatus {
  if (variants.some((v) => v.available === true)) return "in_stock";
  return variants.length > 0 && variants.every((v) => v.available === false) ? "out_of_stock" : "unknown";
}

/** "43_2/3" and "47 1-3" are written "43 2/3" and "47 1/3" so size filters can read them. */
const cleanSize = (s: string) => s.replace(/^(\d{2})[_ ](\d)[/-](\d)$/, "$1 $2/$3");

/** Article code shared by every size SKU ("404147-05_6_5" -> "404147-05"). */
function styleCode(variants: Variant[]): string | null {
  const codes = new Set(variants.map((v) => v.sku?.split("_")[0] ?? ""));
  const [code] = codes;
  return codes.size === 1 && code && /^[A-Z0-9][A-Z0-9-]{3,24}$/i.test(code) ? code : null;
}

const isFootwear = (p: ShopifyProduct) => /^footwear$/i.test(p.productType ?? "") || p.tags.some((t) => /^chaussures$/i.test(t.trim()));

function specsOf(p: ShopifyProduct): Record<string, string> {
  const specs: Record<string, string> = {};
  const type = p.productType ? TYPE_LABELS[p.productType.toLowerCase()] ?? p.productType : null;
  if (type) specs["Type de produit"] = type;
  const genders = [...new Set(p.tags.map((t) => GENDER_TAGS[t.trim().toUpperCase()]).filter((g): g is string => !!g))];
  if (genders.length) specs.Genre = genders.join(", ");
  if (genders.length && genders.every((g) => g === "Garçon" || g === "Fille")) specs.Public = "Enfant";
  const sized = p.variants.filter((v) => v.size && !PLACEHOLDER_SIZES.test(v.size));
  const sizes = (available: boolean) => [...new Set(sized.filter((v) => v.available === available).map((v) => cleanSize(v.size!)))].join(", ");
  // Size filters read every "taille/pointure" label when no "disponibles" one exists: sold-out sizes use a neutral label.
  if (sizes(true)) specs[isFootwear(p) ? "Pointures disponibles" : "Tailles disponibles"] = sizes(true);
  if (sizes(false)) specs["Rupture de stock"] = sizes(false);
  const ref = styleCode(p.variants);
  if (ref) specs["Référence"] = ref;
  return specs;
}

function brandOf(shop: ShopifyShop, p: ShopifyProduct): string | null {
  const vendor = p.vendor?.toUpperCase();
  return (vendor && shop.brandAliases?.[vendor]) || canonicalBrand(p.vendor);
}

export const shopifyProductUrl = (shop: ShopifyShop, handle: string) => `${shop.origin}/products/${handle.toLowerCase()}`;

export function shopifyListingItem(shop: ShopifyShop, p: ShopifyProduct, listingPath: string): ListingItem {
  const q = quote(p.variants);
  return {
    sourceId: p.id,
    url: shopifyProductUrl(shop, p.handle),
    title: cleanTitle(p.title),
    imageUrl: safeHttpUrl(p.image, shop.origin),
    priceCents: q?.priceCents ?? null,
    originalPriceCents: q?.originalPriceCents ?? null,
    advertisedDiscountPct: q?.advertisedDiscountPct ?? null,
    seller: shop.seller,
    reviewCount: null,
    rating: null,
    brand: brandOf(shop, p),
    expressDelivery: null,
    stock: stockOf(p.variants),
    rawSpecs: specsOf(p),
    listingPath,
  };
}

export function shopifyProductDetail(shop: ShopifyShop, p: ShopifyProduct): ProductDetail {
  const q = quote(p.variants);
  if (!q) throw new ProductParseError(p.variants.length ? "Prix différent selon la taille : choisir une taille avant de comparer" : "Aucun prix de variante");
  const title = cleanTitle(p.title);
  const rawSpecs = specsOf(p);
  const type = rawSpecs["Type de produit"];
  return {
    sourceId: p.id,
    url: shopifyProductUrl(shop, p.handle),
    title,
    brand: brandOf(shop, p),
    modelRef: extractModelRef(title, rawSpecs),
    imageUrl: safeHttpUrl(p.image, shop.origin),
    priceCents: q.priceCents,
    originalPriceCents: q.originalPriceCents,
    advertisedDiscountPct: q.advertisedDiscountPct,
    seller: shop.seller,
    stock: stockOf(p.variants),
    rating: null,
    reviewCount: null,
    breadcrumb: type ? [type] : [],
    rawSpecs,
    extraction: "embedded-data",
    warnings: q.oldPriceVaries ? ["Ancien prix différent selon la taille : non retenu"] : [],
  };
}

/**
 * Shopify storefront adapter: reads the public product feeds
 * (`/collections/<handle>/products.json`, `/products/<handle>.js`), which hold
 * exact prices, old prices and per-size availability. No HTML parsing, no browser.
 */
export class ShopifyAdapter implements SiteAdapter {
  readonly shopId: string;
  readonly dealPagePaths: string[];
  private readonly fetcher: PoliteFetcher;
  private readonly hosts: ReadonlySet<string>;
  private market: Promise<void> | null = null;

  constructor(readonly shop: ShopifyShop, opts: FetcherOptions) {
    this.shopId = shop.shopId;
    this.dealPagePaths = shop.dealPagePaths;
    this.hosts = new Set(shop.hosts);
    this.fetcher = new PoliteFetcher({ ...opts, origin: shop.origin, allowedHosts: shop.hosts });
  }

  get requestCount(): number {
    return this.fetcher.requestCount;
  }

  /** Prices are only usable once the storefront proves it sells in the expected market and currency. */
  private checkMarket(): Promise<void> {
    return (this.market ??= (async () => {
      const res = await this.fetcher.get(`${this.shop.origin}/`);
      if (res.status >= 400) throw new HttpError(`Accueil HTTP ${res.status}`, res.status, res.url);
      const currency = /Shopify\.currency\s*=\s*\{[^}]*"active"\s*:\s*"([A-Z]{3})"/.exec(res.body)?.[1];
      const country = /Shopify\.country\s*=\s*"([A-Z]{2})"/.exec(res.body)?.[1];
      if (currency !== this.shop.currency) {
        throw new HttpError(currency ? `Devise ${currency} au lieu de ${this.shop.currency} : prix écartés` : "Devise de la boutique non vérifiable : prix écartés", 0, res.url);
      }
      if (country && country !== this.shop.country) throw new HttpError(`Marché ${country} au lieu de ${this.shop.country} : prix écartés`, 0, res.url);
    })());
  }

  /** "/collections/<handle>" or "/" (whole catalogue). The JSON feed ignores filters and sorting. */
  private feedPath(path: string): string {
    const u = assertAllowedUrl(new URL(path, this.shop.origin).toString(), this.hosts);
    if (u.search) throw new HttpError("Filtres et tris non pris en charge : utilisez une collection sans paramètres", 0, u.toString());
    const p = u.pathname.replace(/\/+$/, "");
    if (!p) return "/products.json";
    const m = /^\/collections\/([a-z0-9][a-z0-9-]*)$/i.exec(p);
    if (!m) throw new HttpError(`Rayon non pris en charge : ${u.pathname}`, 0, u.toString());
    return `/collections/${m[1]!.toLowerCase()}/products.json`;
  }

  private handleOf(url: string): string | null {
    try {
      const u = assertAllowedUrl(new URL(url, this.shop.origin).toString(), this.hosts);
      return /^(?:\/collections\/[a-z0-9-]+)?\/products\/([a-z0-9][a-z0-9-]*)\/?$/i.exec(u.pathname)?.[1]?.toLowerCase() ?? null;
    } catch {
      return null;
    }
  }

  async discover(path: string, maxPages: number): Promise<ListingResult> {
    const feed = this.feedPath(path);
    await this.checkMarket();
    const items = new Map<string, ListingItem>();
    let pagesLoaded = 0;
    let complete = false;
    let skipped = 0;
    for (let page = 1; page <= Math.max(1, maxPages); page++) {
      const url = `${this.shop.origin}${feed}?limit=${PAGE_SIZE}&page=${page}`;
      try {
        const res = await this.fetcher.get(url);
        if (res.status === 404 || res.status === 410) throw new HttpError(`Page introuvable (HTTP ${res.status})`, res.status, url);
        if (res.status >= 400) throw new HttpError(`HTTP ${res.status}`, res.status, url);
        const raw = parseJson(res.body)?.products;
        if (!Array.isArray(raw)) throw new HttpError("Réponse produits illisible", res.status, url);
        pagesLoaded++;
        for (const r of raw) {
          const p = toShopifyProduct(r, "mad");
          if (!p) skipped++;
          else if (!items.has(p.id)) items.set(p.id, shopifyListingItem(this.shop, p, path));
        }
        if (raw.length < PAGE_SIZE) {
          complete = skipped === 0;
          break;
        }
      } catch (err) {
        // Pages already read stay usable, but an interrupted pagination never proves an offer disappeared.
        if (err instanceof HttpError && pagesLoaded > 0) break;
        throw err;
      }
    }
    return { path, items: [...items.values()], method: "http", pagesLoaded, complete };
  }

  async fetchProduct(url: string): Promise<DetailResult> {
    const handle = this.handleOf(url);
    if (!handle) return { kind: "error", message: `URL produit non reconnue : ${url}` };
    let res;
    try {
      await this.checkMarket();
      res = await this.fetcher.get(`${this.shop.origin}/products/${handle}.js`);
    } catch (err) {
      if (err instanceof HttpError) return { kind: "error", message: err.message, status: err.status };
      throw err; // AccessBlockedError / robots errors abort the run
    }
    if (res.status === 404 || res.status === 410) return { kind: "gone", status: res.status };
    if (res.status >= 400) return { kind: "error", message: `HTTP ${res.status}`, status: res.status };
    const product = toShopifyProduct(parseJson(res.body), "cents");
    if (!product) return { kind: "error", message: "Fiche produit illisible" };
    try {
      return { kind: "ok", detail: shopifyProductDetail(this.shop, product) };
    } catch (err) {
      if (err instanceof ProductParseError) return { kind: "error", message: `Extraction impossible : ${err.message}` };
      throw err;
    }
  }

  async close(): Promise<void> {}
}
