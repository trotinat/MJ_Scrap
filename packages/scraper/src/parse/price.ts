import { madToCents, parseAmount } from "@mdw/shared";

/**
 * Price parsing for Marjane Mall cards and product pages.
 *
 * Observed renderings (October 2026):
 *   - current price split in two elements: "4149" + "00DH"  -> 4 149,00 MAD
 *   - current price flattened: "89900DH"                    -> 899,00 MAD
 *     (the two last digits are the centimes rendered as a superscript)
 *   - old price: "1299 DH" or "6500.00 DH"
 *   - discount: "-31%"
 * Because the flattened form is ambiguous, candidate interpretations are
 * cross-checked against the advertised discount when one is present.
 */

export interface MoneyCandidate {
  /** Alternative readings in centimes, most likely first. */
  readings: number[];
  /** Index of the line where the candidate starts. */
  line: number;
  /** True when the amount was written with a space or decimal separator ("1299 DH"). */
  explicit: boolean;
}

export interface PriceParse {
  priceCents: number | null;
  originalPriceCents: number | null;
  advertisedDiscountPct: number | null;
  warnings: string[];
}

const CURRENCY = /(?:DH|DHS|MAD|Dirhams?)/i;
const DISCOUNT_RE = /(?:^|\s|\b)-\s?(\d{1,2}(?:[.,]\d)?)\s?%/;

function cents(v: number): number {
  return madToCents(v);
}

/** Readings for a digits-only run directly followed by "DH" (e.g. "89900"). */
function flattenedReadings(digits: string): number[] {
  const out: number[] = [];
  if (digits.length >= 3) out.push(Number(digits.slice(0, -2)) * 100 + Number(digits.slice(-2)));
  out.push(Number(digits) * 100);
  return out;
}

/** Extracts money candidates from an ordered list of text lines. */
export function moneyCandidates(lines: string[]): MoneyCandidate[] {
  const out: MoneyCandidate[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.replace(/[  ]/g, " ").trim();
    const next = (lines[i + 1] ?? "").replace(/[  ]/g, " ").trim();
    const next2 = (lines[i + 2] ?? "").trim();

    // Split rendering: "4149" + "00DH" | "4149" + ",00 DH" | "4149" + "00" + "DH"
    if (/^\d[\d .]*$/.test(line) && /^[,.]?\d{2}\s*(?:DH|DHS|MAD)?$/i.test(next)) {
      const hasCurrency = CURRENCY.test(next) || /^(?:DH|DHS|MAD)$/i.test(next2);
      if (hasCurrency) {
        const intPart = parseAmount(line.replace(/\s/g, ""));
        const dec = Number(next.replace(/\D/g, ""));
        if (intPart !== null) {
          out.push({ readings: [cents(intPart) + dec], line: i, explicit: true });
          i += 1;
          continue;
        }
      }
    }

    // Any amounts written inside this line.
    const re = /(\d[\d .,]*?)(\s*)(DH|DHS|MAD)\b/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      const amountText = m[1]!.trim();
      const spaced = m[2]!.length > 0;
      const hasSep = /[ .,]/.test(amountText);
      if (!spaced && !hasSep && /^\d+$/.test(amountText)) {
        // Flattened "89900DH". If digits were glued to a word ("MARJANE89900DH"),
        // the regex already started at the first digit.
        out.push({ readings: flattenedReadings(amountText), line: i, explicit: false });
      } else {
        const v = parseAmount(amountText);
        if (v !== null) out.push({ readings: [cents(v)], line: i, explicit: true });
      }
    }
  }
  return out;
}

export function findDiscount(lines: string[]): number | null {
  for (const raw of lines) {
    const line = raw.replace(/[  ]/g, " ");
    const m = DISCOUNT_RE.exec(line);
    if (m) {
      const v = Number(m[1]!.replace(",", "."));
      if (v > 0 && v < 100) return v;
    }
  }
  return null;
}

/** Relative gap between the advertised discount and the one implied by the two prices. */
export function discountGap(priceCents: number, originalCents: number, discountPct: number): number {
  if (originalCents <= 0) return 1;
  const implied = (1 - priceCents / originalCents) * 100;
  return Math.abs(implied - discountPct);
}

/**
 * Determines current price, advertised original price and discount from the
 * text lines of one card / one product block.
 */
export function parsePriceLines(lines: string[]): PriceParse {
  const warnings: string[] = [];
  const candidates = moneyCandidates(lines);
  const discount = findDiscount(lines);
  if (candidates.length === 0) return { priceCents: null, originalPriceCents: null, advertisedDiscountPct: discount, warnings };

  const first = candidates[0]!;
  const second = candidates[1];

  if (!second) {
    return { priceCents: first.readings[0]!, originalPriceCents: null, advertisedDiscountPct: discount, warnings };
  }

  // Choose the combination of readings most consistent with the discount.
  let best: { price: number; original: number; gap: number } | null = null;
  for (const a of first.readings) {
    for (const b of second.readings) {
      const price = Math.min(a, b);
      const original = Math.max(a, b);
      const gap = discount !== null ? discountGap(price, original, discount) : original === price ? 99 : 0;
      if (!best || gap < best.gap) best = { price, original, gap };
    }
  }
  const chosen = best!;
  if (discount !== null && chosen.gap > 3) {
    warnings.push(
      `Remise annoncée (-${discount} %) incohérente avec les prix lus (${chosen.price / 100} / ${chosen.original / 100} MAD)`,
    );
  }
  if (chosen.original === chosen.price) {
    return { priceCents: chosen.price, originalPriceCents: null, advertisedDiscountPct: discount, warnings };
  }
  return { priceCents: chosen.price, originalPriceCents: chosen.original, advertisedDiscountPct: discount, warnings };
}
