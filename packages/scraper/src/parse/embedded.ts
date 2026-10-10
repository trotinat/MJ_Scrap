import type { ListingItem } from "@mdw/shared";
import { madToCents } from "@mdw/shared";
import { canonicalProductUrl, SITE_ORIGIN, sourceIdFromUrl } from "../url";
import { cleanTitle } from "../normalize";
import { safeHttpUrl } from "./dom";

/**
 * Marjane Mall pages are Next.js pages: besides the visible HTML, the server
 * sends the page data as JSON inside `self.__next_f.push([1,"…"])` scripts
 * (and as-is in the lighter "RSC" responses). Product cards appear there as
 * objects such as:
 *
 *   {"image":"…","m_shipping_express":true,"url_key":"adidas-…-aaaoz94787",
 *    "name":"ADIDAS - Sac à dos …","sku":"AAAOZ94787","price":199,"oldPrice":270,
 *    "seller_name":"MARJANEMALL","note":5,"review_number":1,"brand_name":"adidas",
 *    "is_in_vente_flash":false,…}
 *
 * Reading these objects is more reliable than reading the visible text: the
 * price, old price, seller and identifiers are exact values, not layout.
 */

/** Concatenated, unescaped Next.js flight data of an HTML page (or the RSC body itself). */
export function extractFlightData(body: string): string {
  if (!/self\.__next_f\.push/.test(body)) return body; // already an RSC payload (or nothing)
  const parts: string[] = [];
  const re = /self\.__next_f\.push\(\[1,"((?:\\.|[^"\\])*)"\]\)/g;
  for (let m = re.exec(body); m; m = re.exec(body)) {
    try {
      parts.push(JSON.parse(`"${m[1]}"`) as string);
    } catch {
      // malformed chunk: ignore it, others remain usable
    }
  }
  return parts.join("");
}

interface RawProduct {
  url_key?: unknown;
  name?: unknown;
  sku?: unknown;
  price?: unknown;
  oldPrice?: unknown;
  image?: unknown;
  media_gallery_entries?: { img?: unknown }[];
  seller_name?: unknown;
  note?: unknown;
  review_number?: unknown;
  brand_name?: unknown;
  m_shipping_express?: unknown;
  is_in_vente_flash?: unknown;
}

/** Every top-level JSON object of `text` that looks like a product card. */
function productObjects(text: string): RawProduct[] {
  const out: RawProduct[] = [];
  const stack: number[] = [];
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") stack.push(i);
    else if (c === "}") {
      const start = stack.pop();
      if (start === undefined) continue;
      const len = i - start;
      if (len > 30_000) continue;
      // Cheap pre-check before parsing: a product object has its own url_key and price.
      const head = text.slice(start, Math.min(i + 1, start + 4000));
      if (!head.includes('"url_key":"') || !head.includes('"price":')) continue;
      try {
        const obj = JSON.parse(text.slice(start, i + 1)) as RawProduct;
        if (typeof obj.url_key === "string" && typeof obj.name === "string" && typeof obj.price === "number") out.push(obj);
      } catch {
        // not plain JSON (flight references): skip
      }
    }
  }
  return out;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Product cards found in the page data, de-duplicated by product URL. */
export function parseEmbeddedProducts(body: string, listingPath: string): ListingItem[] {
  const byUrl = new Map<string, ListingItem>();
  for (const p of productObjects(extractFlightData(body))) {
    const url = canonicalProductUrl(`/p/${p.url_key as string}`);
    const sourceId = url ? sourceIdFromUrl(url) : null;
    const price = num(p.price);
    if (!url || !sourceId || price === null || price <= 0 || byUrl.has(url)) continue;
    const old = num(p.oldPrice);
    const priceCents = madToCents(price);
    const originalPriceCents = old !== null && old > price ? madToCents(old) : null;
    const title = cleanTitle(p.name as string);
    if (!title) continue;
    const img = typeof p.image === "string" ? p.image : typeof p.media_gallery_entries?.[0]?.img === "string" ? (p.media_gallery_entries[0].img as string) : null;
    const rating = num(p.note);
    const reviews = num(p.review_number);
    byUrl.set(url, {
      sourceId,
      url,
      title,
      imageUrl: safeHttpUrl(img ?? undefined, SITE_ORIGIN),
      priceCents,
      originalPriceCents,
      // The site shows the rounded difference between the old and current price.
      advertisedDiscountPct: originalPriceCents ? Math.round((1 - priceCents / originalPriceCents) * 100) : null,
      seller: typeof p.seller_name === "string" && p.seller_name.trim() ? p.seller_name.trim() : null,
      reviewCount: reviews,
      rating: reviews ? rating : null,
      brand: typeof p.brand_name === "string" && p.brand_name.trim() ? p.brand_name.trim() : null,
      expressDelivery: typeof p.m_shipping_express === "boolean" ? p.m_shipping_express : null,
      listingPath,
    });
  }
  return [...byUrl.values()];
}
