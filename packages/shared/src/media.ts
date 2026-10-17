import type { ShopperProfile } from "./profile";
import { fitsPromotionProfile } from './promotion-profile';
import { phraseMatches } from './text';

/**
 * Marjane's product images follow a `…_imgN.webp` pattern (img1, img2, img3…).
 * From one image we can offer the next few as a gallery; any that 404 are
 * hidden client-side via an onError handler, so this stays safe to guess.
 * Images that don't match the pattern (UUID names) return just themselves.
 */
export function deriveGallery(imageUrl: string | null, max = 4): string[] {
  if (!imageUrl) return [];
  const m = /^(.*_img)(\d+)(\.[a-z]+)(\?.*)?$/i.exec(imageUrl);
  if (!m) return [imageUrl];
  const [, base, , ext, query = ""] = m;
  const out: string[] = [imageUrl];
  for (let i = 1; out.length < max && i <= max; i++) {
    const candidate = `${base}${i}${ext}${query}`;
    if (!out.includes(candidate)) out.push(candidate);
  }
  return out;
}

export interface HighlightInput {
  brand: string | null;
  title: string;
  seller?: string | null;
  priceCents: number | null;
  discountPct: number | null;
  rawSpecs?: Record<string,string>;
  categoryPath?: string | null;
}

export interface Highlight {
  label: string;
  tone: "profile" | "promo";
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Why an offer suits the shopper: matched brand / seller, within budget, a
 * matching gender hint in the title, or a strong advertised discount. Used to
 * badge cards so the right deals stand out at a glance.
 */
export function profileHighlights(item: HighlightInput, p: ShopperProfile): Highlight[] {
  if (!fitsPromotionProfile(item,p)) return [];
  const out: Highlight[] = [];
  const title = norm(item.title);
  const brand = item.brand ? norm(item.brand) : "";

  if (item.brand && p.preferredBrands.some((b) => norm(b) === brand || title.includes(norm(b)))) {
    out.push({ label: "Votre marque", tone: "profile" });
  }
  if (item.seller && p.preferredSellers.some((s) => norm(s) === norm(item.seller!))) {
    out.push({ label: "Vendeur préféré", tone: "profile" });
  }
  if (p.maxPrice != null && item.priceCents != null && item.priceCents <= p.maxPrice * 100) {
    out.push({ label: "Dans votre budget", tone: "profile" });
  }
  const gender = p.genders.find((g) => phraseMatches(item.title,g));
  if (gender) out.push({ label: gender, tone: "profile" });

  if (item.discountPct != null && (p.minDiscountPct == null || item.discountPct >= p.minDiscountPct) && item.discountPct >= 40) {
    out.push({ label: `-${Math.round(item.discountPct)}%`, tone: "promo" });
  }
  return out;
}

/** True when an offer matches at least one explicit profile preference (brand/seller/budget/gender). */
export function suitsProfile(item: HighlightInput, p: ShopperProfile): boolean {
  return profileHighlights(item, p).some((h) => h.tone === "profile" && h.label !== 'Dans votre budget');
}
