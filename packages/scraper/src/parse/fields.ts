/** Small field extractors shared by card and product-page parsers. */

const SELLER_STOP = /(\d[\d .,]*\s*(DH|MAD)|-\d{1,2}\s?%|\(\d+\s*avis\)|ajouter au panier)/i;

export function findSeller(lines: string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = /vendu\s+par\s*:?\s*(.*)$/i.exec(line);
    if (!m) continue;
    let name = m[1]!.trim();
    if (!name) name = (lines[i + 1] ?? "").trim();
    // Flattened text: "MARJANE89900DH-31%1299 DH" -> cut at the first price-like token.
    const cut = SELLER_STOP.exec(name);
    if (cut) name = name.slice(0, cut.index);
    name = name.replace(/\d+$/, (d) => (d.length >= 3 ? "" : d)).trim();
    if (name && name.length <= 80 && !/^\d/.test(name)) return name;
  }
  return null;
}

export function findReviewCount(lines: string[]): number | null {
  for (const line of lines) {
    const m = /\(?\s*(\d{1,6})\s*avis\s*\)?/i.exec(line);
    if (m) return Number(m[1]);
  }
  return null;
}

export function findRating(lines: string[]): number | null {
  for (const line of lines) {
    const m = /(\d(?:[.,]\d{1,2})?)\s*(?:\/\s*5|sur\s*5|étoiles?)/i.exec(line);
    if (m) {
      const v = Number(m[1]!.replace(",", "."));
      if (v >= 0 && v <= 5) return v;
    }
  }
  return null;
}

export function findStock(lines: string[]): "in_stock" | "out_of_stock" | "unknown" {
  const text = lines.join(" \n ");
  if (/rupture\s+de\s+stock|indisponible|[ée]puis[ée]|plus\s+disponible|out\s+of\s+stock/i.test(text)) return "out_of_stock";
  if (/ajouter\s+au\s+panier|en\s+stock|acheter\s+maintenant/i.test(text)) return "in_stock";
  return "unknown";
}
