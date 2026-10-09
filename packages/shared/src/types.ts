import type { NormalizedSpecs } from "./specs";

export type StockStatus = "in_stock" | "out_of_stock" | "unknown";

/** A product card seen on a listing page (category, promotion page). */
export interface ListingItem {
  sourceId: string;
  url: string;
  title: string;
  imageUrl: string | null;
  priceCents: number | null;
  originalPriceCents: number | null;
  advertisedDiscountPct: number | null;
  seller: string | null;
  reviewCount: number | null;
  rating: number | null;
  /** Listing path where the card was seen (used as category scope). */
  listingPath: string;
}

/** Full extraction from a product detail page. */
export interface ProductDetail {
  sourceId: string;
  url: string;
  title: string;
  brand: string | null;
  modelRef: string | null;
  imageUrl: string | null;
  priceCents: number;
  originalPriceCents: number | null;
  advertisedDiscountPct: number | null;
  seller: string | null;
  stock: StockStatus;
  rating: number | null;
  reviewCount: number | null;
  breadcrumb: string[];
  rawSpecs: Record<string, string>;
  /** How the data was obtained, for transparency. */
  extraction: "json-ld" | "html-text" | "listing-card";
  /** Non-fatal inconsistencies found while parsing. */
  warnings: string[];
}

/** Product facts as seen by the matching engine. */
export interface MatchableProduct {
  title: string;
  brand: string | null;
  modelRef: string | null;
  categoryPath: string | null;
  priceCents: number;
  originalPriceCents: number | null;
  advertisedDiscountPct: number | null;
  seller: string | null;
  stock: StockStatus;
  rating: number | null;
  reviewCount: number | null;
  rawSpecs: Record<string, string>;
  specs: NormalizedSpecs;
}

/** Price facts computed from stored observations only. */
export interface PriceHistoryFacts {
  observationCount: number;
  previousPriceCents: number | null;
  minPriceCents: number | null;
  /** Lowest price before the current observation. */
  previousMinPriceCents: number | null;
  firstSeenAt: Date | null;
}
