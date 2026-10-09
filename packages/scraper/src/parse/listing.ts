import * as cheerio from "cheerio";
import type { Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import type { ListingItem } from "@mdw/shared";
import { canonicalProductUrl, SITE_ORIGIN, sourceIdFromUrl } from "../url";
import { cleanTitle } from "../normalize";
import { safeHttpUrl, textLines } from "./dom";
import { findRating, findReviewCount, findSeller } from "./fields";
import { parsePriceLines } from "./price";

const NON_TITLE = /(vendu par|\bDH\b|\bMAD\b|%|avis\)|ajouter au panier|^\d+$|^-)/i;

/**
 * Parses product cards from a listing page (category, promotion page, home).
 * Works on server HTML and on HTML rendered by Playwright alike: each product
 * link is expanded to the largest ancestor that contains no other product, and
 * that card's text nodes are parsed.
 */
export function parseListingHtml(html: string, listingPath: string): ListingItem[] {
  const $ = cheerio.load(html);
  const byUrl = new Map<string, ListingItem>();
  const productUrlOf = (el: Cheerio<AnyNode>) => canonicalProductUrl(el.attr("href") ?? "");

  $('a[href*="/p/"]').each((_, a) => {
    const anchor = $(a);
    const url = productUrlOf(anchor);
    if (!url || byUrl.has(url)) return;

    let card: Cheerio<AnyNode> = anchor;
    for (let depth = 0; depth < 10; depth++) {
      const parent = card.parent();
      if (!parent.length || parent.is("body, main, html")) break;
      const urls = new Set<string>();
      parent.find('a[href*="/p/"]').each((__, x) => {
        const u = productUrlOf($(x));
        if (u) urls.add(u);
      });
      if (urls.size > 1) break;
      card = parent;
    }

    const lines = textLines($, card);
    const prices = parsePriceLines(lines);
    if (prices.priceCents === null) return; // not a product card (e.g. a text link)

    const img = card.find("img").first();
    const title = cleanTitle(
      anchor.attr("title") ||
        img.attr("alt") ||
        lines.filter((l) => !NON_TITLE.test(l) && l.length >= 8).sort((x, y) => y.length - x.length)[0] ||
        "",
    );
    if (!title) return;

    const sourceId = sourceIdFromUrl(url);
    if (!sourceId) return;

    byUrl.set(url, {
      sourceId,
      url,
      title,
      imageUrl: safeHttpUrl(img.attr("src") || img.attr("data-src") || img.attr("srcset"), SITE_ORIGIN),
      priceCents: prices.priceCents,
      originalPriceCents: prices.originalPriceCents,
      advertisedDiscountPct: prices.advertisedDiscountPct,
      seller: findSeller(lines),
      reviewCount: findReviewCount(lines),
      rating: findRating(lines),
      listingPath,
    });
  });
  return [...byUrl.values()];
}

/** Category links discovered on a page (used to suggest category paths in the UI). */
export function parseCategoryLinks(html: string): { path: string; label: string }[] {
  const $ = cheerio.load(html);
  const out = new Map<string, string>();
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    let u: URL;
    try {
      u = new URL(href, SITE_ORIGIN);
    } catch {
      return;
    }
    if (!/(^|\.)marjanemall\.ma$/.test(u.hostname)) return;
    const p = u.pathname.replace(/\/$/, "");
    if (!/^\/[a-z0-9-]+(\/[a-z0-9-]+){0,3}$/.test(p) || p.startsWith("/p/")) return;
    if (/^\/(customer|checkout|cart|login|account|api|aide|faq|contact|blog|cms)/.test(p)) return;
    const label = $(a).text().replace(/\s+/g, " ").trim();
    if (label && label.length <= 60 && !out.has(p)) out.set(p, label);
  });
  return [...out.entries()].map(([path, label]) => ({ path, label }));
}
