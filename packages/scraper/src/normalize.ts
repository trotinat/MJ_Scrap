import { normalizeRef, normalizeText } from "@mdw/shared";

/**
 * Brands observed on Marjane Mall plus common electronics / home brands.
 * Used only when the product page does not provide a "Marque" field.
 */
export const KNOWN_BRANDS = [
  "Samsung", "LG", "TCL", "Hisense", "Sony", "Philips", "Xiaomi", "Huawei", "Honor", "Apple", "Oppo", "Realme",
  "Infinix", "Tecno", "Itel", "Nokia", "Motorola", "Vivo", "OnePlus", "Lenovo", "ASUS", "HP", "Dell", "Acer", "MSI",
  "Microsoft", "Toshiba", "Panasonic", "Sharp", "Thomson", "Starsat", "Condor", "Zatec", "MGS", "Denwa", "Kenz",
  "Taurus", "Moulinex", "Tefal", "Rowenta", "Bosch", "Siemens", "Whirlpool", "Beko", "Brandt", "Arçelik", "Midea",
  "Haier", "Gree", "Carrier", "Daikin", "Black+Decker", "Black & Decker", "Braun", "Babyliss", "Remington", "Kenwood",
  "Delonghi", "De'Longhi", "Nespresso", "Krups", "Seb", "Logitech", "Anker", "Soundcore", "JBL", "Belkin", "Baseus",
  "Ugreen", "Canon", "Nikon", "GoPro", "DJI", "70mai", "Xiaomi Mi", "Garmin", "Fitbit", "Amazfit", "Haylou", "Bose",
  "Marshall", "Sennheiser", "Epson", "Brother", "Kingston", "SanDisk", "Western Digital", "Seagate", "Lexar",
  "Nintendo", "PlayStation", "Xbox", "Razer", "Corsair", "SteelSeries", "HyperX", "Redragon", "Michelin", "Bosch Car",
  "Valeo", "Nivea", "Labello", "L'Oréal", "Garnier", "Secret", "Dove", "Gillette", "Oral-B",
  "Adidas", "Nike", "Puma", "Reebok", "New Balance", "Asics", "Skechers", "Under Armour", "Fila", "Kappa", "Le Coq Sportif",
  "Converse", "Vans", "Decathlon", "Kipsta", "Columbia", "The North Face", "Lacoste", "Tommy Hilfiger", "Levi's",
];

const BRAND_INDEX = KNOWN_BRANDS.map((b) => ({ brand: b, norm: normalizeText(b) })).sort((a, b) => b.norm.length - a.norm.length);

/** Canonical display form for a brand: matches the known list case-insensitively. */
export function canonicalBrand(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const n = normalizeText(raw);
  if (!n) return null;
  const known = BRAND_INDEX.find((b) => b.norm === n);
  if (known) return known.brand;
  // Title-case unknown brands ("ELECTROPLANET" -> "Electroplanet"), keep short acronyms upper-case.
  const cleaned = raw.trim().replace(/\s+/g, " ");
  if (cleaned.length <= 4) return cleaned.toUpperCase();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

/** Detects a brand from the title when no explicit "Marque" field exists. */
export function detectBrand(title: string, explicit?: string | null): string | null {
  if (explicit && normalizeText(explicit)) return canonicalBrand(explicit);
  const words = ` ${normalizeText(title)} `;
  for (const { brand, norm } of BRAND_INDEX) {
    if (words.includes(` ${norm} `)) return brand;
  }
  return null;
}

const NOT_A_REF = /^(\d+(GO|GB|TO|TB|W|HZ|MAH|MM|CM|L|ML|G|KG|V|P|K|MP|PO|POUCES|INCH)?|USB\w*|HDMI\d*|WIFI\d*|DDR\d|LPDDR\d\w*|ANDROID\d+|IOS\d+|IPX\d|IP\d\d|BLUETOOTH\d*|CORE\w*|RTX\d+|GTX\d+|RYZEN\d*|I[3579]\d*|FHD|UHD|QLED|OLED|T2S2|DVB\w*|T2|S2|5G|4G|3G|C\d{2}|CVC\d+)$/;

/**
 * Extracts a manufacturer model reference such as "QA55Q6FAAUXMV",
 * "MA9173003A", "GO-9345" or "BL424CB". Prefers an explicit "Modèle"/"Référence"
 * field, then "modèle XYZ" in the title, then the most reference-like token.
 */
export function extractModelRef(title: string, rawSpecs: Record<string, string> = {}): string | null {
  for (const [label, value] of Object.entries(rawSpecs)) {
    if (/^(mod[eè]le|r[ée]f[ée]rence|ref\.?|num[ée]ro de mod[eè]le|model)$/i.test(label.trim())) {
      const ref = normalizeRef(value);
      if (isPlausibleRef(ref)) return ref;
    }
  }
  const explicit = /(?:mod[eè]le|r[ée]f(?:[ée]rence)?\.?|model)\s*:?\s*([A-Z0-9][A-Z0-9\-/.]{3,24})/i.exec(title);
  if (explicit) {
    const ref = normalizeRef(explicit[1]);
    if (isPlausibleRef(ref)) return ref;
  }
  const candidates = title
    .replace(/&quot;/g, " ")
    .split(/[\s,;()|]+/)
    .map((t) => t.replace(/^[-–]+|[-–.]+$/g, ""))
    .filter((t) => t.length >= 5)
    .map((t) => ({ raw: t, ref: normalizeRef(t) }))
    .filter((c) => isPlausibleRef(c.ref));
  if (candidates.length === 0) return null;
  // Longest, most digit-rich token wins.
  candidates.sort((a, b) => score(b.ref) - score(a.ref));
  return candidates[0]!.ref;
}

function score(ref: string): number {
  return ref.length + (ref.match(/\d/g)?.length ?? 0);
}

function isPlausibleRef(ref: string): boolean {
  if (ref.length < 5 || ref.length > 25) return false;
  const digits = ref.match(/\d/g)?.length ?? 0;
  const letters = ref.match(/[A-Z]/g)?.length ?? 0;
  if (digits < 2 || letters < 1) return false;
  if (NOT_A_REF.test(ref)) return false;
  // Sizes like "55POUCES", "1920X1080", "3840X2160"
  if (/^\d+X\d+$/.test(ref)) return false;
  return true;
}

/**
 * Key used to group offers into products. Two listings are the same product
 * only when brand AND model reference agree; otherwise each listing is its own
 * product, so different variants / capacities / sizes are never merged.
 */
export function canonicalProductKey(
  brand: string | null,
  modelRef: string | null,
  sourceId: string,
  variant: { storage_gb?: number; ram_gb?: number; screen_size_in?: number } = {},
): string {
  if (brand && modelRef) {
    // Variant facets are part of the key so 128 Go / 256 Go or 55" / 65" never merge.
    const v = [variant.screen_size_in && `${variant.screen_size_in}in`, variant.ram_gb && `${variant.ram_gb}ram`, variant.storage_gb && `${variant.storage_gb}st`]
      .filter(Boolean)
      .join("-");
    // Without known variant facets, keep offers separate rather than merge different sizes/colours.
    return v ? `ref:${normalizeRef(brand)}:${modelRef}:${v}` : `src:${sourceId}`;
  }
  return `src:${sourceId}`;
}

/** Cleans a product title for display. */
export function cleanTitle(title: string): string {
  return title
    .replace(/&quot;/g, '"')
    // Typographic hyphens ("USB‑C" with U+2011) become a plain hyphen: easier to
    // search and storable in any database encoding.
    .replace(/[\u2010-\u2012\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}
