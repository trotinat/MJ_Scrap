/**
 * Money is stored everywhere as integer centimes of MAD to avoid floating
 * point drift. 4 149,00 MAD === 414900.
 */
export type Cents = number;

export function madToCents(mad: number): Cents {
  return Math.round(mad * 100);
}

export function centsToMad(cents: Cents): number {
  return cents / 100;
}

const formatter = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "4 149,00 MAD" (uses a normal space so it renders well in Telegram). */
export function formatMad(cents: Cents | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return `${formatter.format(cents / 100).replace(/[  ]/g, " ")} MAD`;
}

/**
 * Parses a human-written amount using French or English conventions:
 * "4 149,00" "4149.00" "4.149,00" "1 299" "6500.00" -> MAD value (number).
 * Returns null when the input is not a plausible amount.
 */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/[\s  ]/g, "").replace(/(mad|dhs?|dirhams?)$/i, "");
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandSep = decimalSep === "," ? "." : ",";
    s = s.split(thousandSep).join("").replace(decimalSep, ".");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const parts = s.split(sep);
    const last = parts[parts.length - 1] ?? "";
    if (parts.length === 2 && (last.length === 1 || last.length === 2)) {
      s = parts.join(".");
    } else if (parts.slice(1).every((p) => p.length === 3)) {
      s = parts.join("");
    } else {
      return null;
    }
  }
  const value = Number(s);
  return Number.isFinite(value) ? value : null;
}

/** Percentage change from `before` to `after` (negative = cheaper). */
export function percentChange(before: Cents, after: Cents): number {
  if (before <= 0) return 0;
  return ((after - before) / before) * 100;
}

export function roundTo(value: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** French percentage number without the sign handling: 7.8 -> "7,8". */
export function frNumber(value: number, decimals = 1): string {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: decimals }).replace(/[  ]/g, " ");
}
