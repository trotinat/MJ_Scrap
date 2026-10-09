import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { madToCents, parseAmount, type ProductDetail, type StockStatus } from "@mdw/shared";
import { canonicalProductUrl, SITE_ORIGIN, sourceIdFromUrl } from "../url";
import { cleanTitle, detectBrand, extractModelRef } from "../normalize";
import { decodeEntities, safeHttpUrl, textLines } from "./dom";
import { findRating, findReviewCount, findSeller, findStock } from "./fields";
import { parsePriceLines } from "./price";

export class ProductParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductParseError";
  }
}

interface JsonLdProduct {
  name?: string;
  sku?: string;
  mpn?: string;
  brand?: string | { name?: string };
  image?: string | string[] | { url?: string };
  offers?: JsonLdOffer | JsonLdOffer[];
  aggregateRating?: { ratingValue?: number | string; reviewCount?: number | string; ratingCount?: number | string };
}
interface JsonLdOffer {
  price?: number | string;
  lowPrice?: number | string;
  priceCurrency?: string;
  availability?: string;
  seller?: { name?: string };
}

function jsonLdBlocks($: CheerioAPI): unknown[] {
  const out: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, s) => {
    const raw = $(s).contents().text();
    try {
      const data = JSON.parse(raw);
      const stack = Array.isArray(data) ? data : [data];
      for (const item of stack) {
        if (item && typeof item === "object" && Array.isArray((item as { "@graph"?: unknown[] })["@graph"])) {
          out.push(...(item as { "@graph": unknown[] })["@graph"]);
        } else out.push(item);
      }
    } catch {
      // Ignore malformed JSON-LD.
    }
  });
  return out;
}

function typeIs(item: unknown, type: string): boolean {
  if (!item || typeof item !== "object") return false;
  const t = (item as { "@type"?: string | string[] })["@type"];
  return Array.isArray(t) ? t.includes(type) : t === type;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseAmount(String(v));
  return n !== null && Number.isFinite(n) ? n : null;
}

const SPEC_HEADINGS = /^(description produit|caract[ée]ristiques( techniques)?|fiche technique|sp[ée]cifications)$/i;
const SPEC_STOP = /^(avis|avis clients|produits? similaires|vous aimerez aussi|les clients ont aussi|questions|livraison|retour|description)$/i;

/** Extracts label/value pairs from tables, definition lists, or "label / value" lines. */
function extractSpecs($: CheerioAPI, lines: string[]): Record<string, string> {
  const specs: Record<string, string> = {};
  const put = (k: string, v: string) => {
    const key = decodeEntities(k).replace(/\s+/g, " ").replace(/:$/, "").trim();
    const value = decodeEntities(v).replace(/\s+/g, " ").trim();
    if (key && value && key.length <= 60 && value.length <= 300 && !(key in specs)) specs[key] = value;
  };

  $("table tr").each((_, tr) => {
    const cells = $(tr).find("th, td");
    if (cells.length === 2) put($(cells[0]).text(), $(cells[1]).text());
  });
  $("dl").each((_, dl) => {
    const dts = $(dl).find("dt");
    dts.each((i, dt) => {
      const dd = $(dt).next("dd");
      if (dd.length) put($(dt).text(), dd.text());
    });
  });
  if (Object.keys(specs).length > 0) return specs;

  // Fallback: alternating label / value lines after a "Description produit" heading.
  const start = lines.findIndex((l) => SPEC_HEADINGS.test(l.trim()));
  if (start < 0) return specs;
  for (let i = start + 1; i + 1 < lines.length; i += 2) {
    const label = lines[i]!.trim();
    const value = lines[i + 1]!.trim();
    if (SPEC_STOP.test(label) || SPEC_HEADINGS.test(label)) break;
    // A label is short, not a sentence, and not a price.
    if (label.length > 50 || /[.!?]$/.test(label) || /\d\s*(DH|MAD)\b/i.test(label)) break;
    if (value.length > 300) break;
    put(label, value);
    if (Object.keys(specs).length >= 60) break;
  }
  return specs;
}

/**
 * Parses a product detail page. Strategy, most reliable first:
 *   1. schema.org Product JSON-LD (if the site provides it);
 *   2. text of the main product block (title h1 -> first price after it).
 * Throws ProductParseError when no title or price can be validated.
 */
export function parseProductPage(html: string, pageUrl: string): ProductDetail {
  const $ = cheerio.load(html);
  const warnings: string[] = [];
  const url = canonicalProductUrl($('link[rel="canonical"]').attr("href") ?? "") ?? canonicalProductUrl(pageUrl);
  if (!url) throw new ProductParseError(`URL produit invalide : ${pageUrl}`);
  const sourceId = sourceIdFromUrl(url)!;

  const ld = jsonLdBlocks($).find((b) => typeIs(b, "Product")) as JsonLdProduct | undefined;
  const breadcrumbLd = jsonLdBlocks($).find((b) => typeIs(b, "BreadcrumbList")) as
    | { itemListElement?: { name?: string; item?: string | { name?: string } }[] }
    | undefined;

  const h1 = $("h1").first();
  const title = cleanTitle(
    ld?.name || h1.text() || $('meta[property="og:title"]').attr("content") || $("title").text().split("|")[0] || "",
  );
  if (!title) throw new ProductParseError("Titre introuvable");

  // Text lines of the whole page, then focus on the block that follows the h1.
  const allLines = textLines($, $("body"));
  let startIdx = 0;
  if (h1.length) {
    const h1Text = h1.text().replace(/\s+/g, " ").trim();
    const idx = allLines.findIndex((l) => l === h1Text || (h1Text.length > 10 && l.startsWith(h1Text.slice(0, 30))));
    if (idx >= 0) startIdx = idx;
  }
  const specStart = allLines.findIndex((l, i) => i > startIdx && SPEC_HEADINGS.test(l.trim()));
  const blockEnd = Math.min(allLines.length, specStart > startIdx ? specStart : startIdx + 60);
  const block = allLines.slice(Math.max(0, startIdx - 15), blockEnd);
  const afterTitle = allLines.slice(startIdx, blockEnd);

  const textPrices = parsePriceLines(afterTitle);
  warnings.push(...textPrices.warnings);

  let extraction: ProductDetail["extraction"] = "html-text";
  let priceCents = textPrices.priceCents;
  let stock: StockStatus = findStock(afterTitle);
  let seller = findSeller(afterTitle);

  const offers = ld?.offers ? (Array.isArray(ld.offers) ? ld.offers : [ld.offers]) : [];
  const offer = offers[0];
  if (offer) {
    const ldPrice = num(offer.price ?? offer.lowPrice);
    if (ldPrice !== null && (!offer.priceCurrency || /^(MAD|DH)$/i.test(offer.priceCurrency))) {
      const ldCents = madToCents(ldPrice);
      if (priceCents !== null && Math.abs(ldCents - priceCents) > 1) {
        warnings.push(`Prix JSON-LD (${ldPrice}) différent du prix affiché (${priceCents / 100}) ; prix affiché conservé`);
      } else {
        priceCents = ldCents;
        extraction = "json-ld";
      }
    }
    if (offer.availability) {
      if (/InStock|LimitedAvailability|OnlineOnly/i.test(offer.availability)) stock = "in_stock";
      else if (/OutOfStock|SoldOut|Discontinued/i.test(offer.availability)) stock = "out_of_stock";
    }
    if (!seller && offer.seller?.name) seller = offer.seller.name;
  }

  if (priceCents === null || priceCents <= 0) throw new ProductParseError("Prix introuvable ou invalide");
  if (priceCents > madToCents(2_000_000)) throw new ProductParseError(`Prix aberrant : ${priceCents / 100} MAD`);

  const rawSpecs = extractSpecs($, allLines);
  const explicitBrand =
    (typeof ld?.brand === "string" ? ld.brand : ld?.brand?.name) ??
    Object.entries(rawSpecs).find(([k]) => /^marque$/i.test(k.trim()))?.[1] ??
    null;
  const brand = detectBrand(title, explicitBrand);
  const modelRef = extractModelRef(title, { ...rawSpecs, ...(ld?.mpn ? { Référence: ld.mpn } : {}) });

  const ldImage = Array.isArray(ld?.image) ? ld?.image[0] : typeof ld?.image === "object" ? ld?.image?.url : ld?.image;
  const imageUrl =
    safeHttpUrl(ldImage, SITE_ORIGIN) ??
    safeHttpUrl($('meta[property="og:image"]').attr("content"), SITE_ORIGIN) ??
    safeHttpUrl($('img[src*="/catalog/product"]').first().attr("src"), SITE_ORIGIN) ??
    safeHttpUrl($("main img").first().attr("src"), SITE_ORIGIN);

  const breadcrumb = breadcrumbLd?.itemListElement?.length
    ? breadcrumbLd.itemListElement
        .map((e) => e.name ?? (typeof e.item === "object" ? e.item?.name : undefined) ?? "")
        .filter(Boolean)
    : $('nav[aria-label*="breadcrumb" i] a, .breadcrumbs a, ol.breadcrumb a')
        .map((_, a) => $(a).text().trim())
        .get()
        .filter(Boolean);

  const ratingLd = num(ld?.aggregateRating?.ratingValue);
  const reviewsLd = num(ld?.aggregateRating?.reviewCount ?? ld?.aggregateRating?.ratingCount);

  return {
    sourceId,
    url,
    title,
    brand,
    modelRef,
    imageUrl,
    priceCents,
    originalPriceCents: textPrices.originalPriceCents,
    advertisedDiscountPct: textPrices.advertisedDiscountPct,
    seller,
    stock,
    rating: ratingLd ?? findRating(block),
    reviewCount: reviewsLd !== null ? Math.round(reviewsLd) : findReviewCount(block),
    breadcrumb,
    rawSpecs,
    extraction,
    warnings,
  };
}
