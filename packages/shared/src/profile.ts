import { z } from "zod";

/**
 * Marjane Mall layered-navigation facets, with the real URL codes observed on
 * the site (October 2026) by opening a fashion listing and toggling each
 * filter. Appended to a listing path, they are applied by the page's
 * JavaScript, so the headless browser returns pre-filtered results.
 *
 *   Genre    maas_28003            → /…?maas_28003=Homme
 *   Pointure maas_46800            → /…?maas_46800=42
 *   Taille   taille_master         → /…?taille_master=M
 *   Couleur  maas_3264             → /…?maas_3264=Noir
 *   Marque   maas_brand            (applied by our engine, not the URL)
 *   Vendeur  maas_offer_seller_name
 */
export const MARJANE_FACETS = {
  gender: { code: "maas_28003", label: "Genre", values: ["Homme", "Femme", "Mixte", "Garçon", "Fille"] },
  shoeSize: {
    code: "maas_46800",
    label: "Pointure",
    values: ["35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47"],
  },
  clothingSize: { code: "taille_master", label: "Taille (haut)", values: ["XS", "S", "M", "L", "XL", "XXL", "3XL", "Taille unique"] },
  pantsSize: {
    code: "taille_master",
    label: "Taille de pantalon",
    values: ["28", "29", "30", "31", "32", "33", "34", "36", "38", "40", "42", "44"],
  },
  color: {
    code: "maas_3264",
    label: "Couleur",
    values: ["Noir", "Blanc", "Gris", "Bleu", "Rouge", "Vert", "Rose", "Beige", "Marron", "Jaune", "Orange", "Violet", "Multicolore"],
  },
} as const;

/** The shopper's own characteristics, used to pre-filter and rank every search. */
export const shopperProfileSchema = z
  .object({
    genders: z.array(z.string().trim().max(20)).max(5).default([]),
    shoeSizes: z.array(z.string().trim().max(6)).max(12).default([]),
    clothingSizes: z.array(z.string().trim().max(20)).max(12).default([]),
    pantsSizes: z.array(z.string().trim().max(6)).max(12).default([]),
    colors: z.array(z.string().trim().max(20)).max(13).default([]),
    preferredBrands: z.array(z.string().trim().max(60)).max(40).default([]),
    excludedBrands: z.array(z.string().trim().max(60)).max(40).default([]),
    preferredSellers: z.array(z.string().trim().max(60)).max(40).default([]),
    maxPrice: z.union([z.number(), z.null()]).optional().transform((v) => (v == null ? null : v)),
    minDiscountPct: z.union([z.number(), z.null()]).optional().transform((v) => (v == null ? null : v)),
  })
  .default({});
export type ShopperProfile = z.infer<typeof shopperProfileSchema>;

export const EMPTY_PROFILE: ShopperProfile = shopperProfileSchema.parse({});

export function profileIsEmpty(p: ShopperProfile): boolean {
  return (
    p.genders.length === 0 &&
    p.shoeSizes.length === 0 &&
    p.clothingSizes.length === 0 &&
    p.pantsSizes.length === 0 &&
    p.colors.length === 0 &&
    p.preferredBrands.length === 0 &&
    p.excludedBrands.length === 0 &&
    p.preferredSellers.length === 0 &&
    p.maxPrice == null &&
    p.minDiscountPct == null
  );
}

/** Fashion departments where genre / size / colour facets make sense. */
const FASHION_PREFIXES = ["/vetements-chaussures-bijoux-accessoires", "/sport", "/boutique-officielle"];

export function isFashionPath(path: string): boolean {
  const p = path.split("?")[0]!.toLowerCase();
  return FASHION_PREFIXES.some((x) => p.startsWith(x));
}

const MAX_SIZE_VARIANTS = 4;
const MAX_PATHS_PER_BASE = 8;

const SHOE_TOKENS = ["chaussure", "basket", "sneaker", "sandale", "mule", "claquette", "soulier", "espadrille", "botte", "running", "football"];
const PANTS_TOKENS = ["pantalon", "jean", "cargo", "chino", "jogger", "short", "bermuda", "survetement", "survêtement", "legging"];
const TOP_TOKENS = ["t-shirt", "tshirt", "polo", "chemise", "sweat", "hoodie", "veste", "pull", "manteau", "robe", "blouse", "top", "debardeur", "débardeur", "doudoune"];

/** Which garment a listing path is about, so only the relevant size facet is applied. */
export function garmentKind(path: string): "shoes" | "pants" | "tops" | "mixed" {
  const p = path.split("?")[0]!.toLowerCase();
  if (SHOE_TOKENS.some((t) => p.includes(t))) return "shoes";
  if (PANTS_TOKENS.some((t) => p.includes(t))) return "pants";
  if (TOP_TOKENS.some((t) => p.includes(t))) return "tops";
  return "mixed";
}

/**
 * Turns one fashion listing path into one or more pre-filtered paths from the
 * profile. Marjane's layered navigation returns nothing for comma-joined
 * multi-values, so each size gets its own path. The right size facet is chosen
 * from the garment the path is about: pointure for shoe listings, waist size
 * for trousers/jeans, letter size for tops; an ambiguous department gets all of
 * them as separate variants. Genre and a single chosen colour are added as
 * shared refinements. A facet already present in the base path is respected and
 * never doubled, and non-fashion paths are returned unchanged.
 */
export function buildProfilePaths(path: string, p: ShopperProfile): string[] {
  if (!isFashionPath(path)) return [path];
  const qIndex = path.indexOf("?");
  const base = qIndex === -1 ? path : path.slice(0, qIndex);
  const query = qIndex === -1 ? "" : path.slice(qIndex + 1);
  const present = new Set(query.split("&").filter(Boolean).map((kv) => kv.split("=")[0]));

  const shared: string[] = [];
  const addShared = (code: string, value: string | undefined) => {
    if (value && !present.has(code)) shared.push(`${code}=${encodeURIComponent(value)}`);
  };
  addShared(MARJANE_FACETS.gender.code, p.genders[0]);
  // Only pin a colour when exactly one is chosen, to avoid empty pages.
  addShared(MARJANE_FACETS.color.code, p.colors.length === 1 ? p.colors[0] : undefined);

  const kind = garmentKind(base);
  const sizeParams: string[] = [];
  const addSizes = (code: string, sizes: string[]) => {
    if (present.has(code)) return;
    for (const s of sizes.slice(0, MAX_SIZE_VARIANTS)) sizeParams.push(`${code}=${encodeURIComponent(s)}`);
  };
  if (kind === "shoes") addSizes(MARJANE_FACETS.shoeSize.code, p.shoeSizes);
  else if (kind === "pants") addSizes(MARJANE_FACETS.pantsSize.code, p.pantsSizes);
  else if (kind === "tops") addSizes(MARJANE_FACETS.clothingSize.code, p.clothingSizes);
  else {
    // Ambiguous department (e.g. the whole men's rayon or a brand store): try
    // each size kind. Shoe sizes and letter/waist sizes use different facets.
    addSizes(MARJANE_FACETS.shoeSize.code, p.shoeSizes);
    addSizes(MARJANE_FACETS.clothingSize.code, [...p.clothingSizes, ...p.pantsSizes]);
  }

  const build = (extra?: string) => {
    const all = [query, ...shared, extra].filter(Boolean).join("&");
    return all ? `${base}?${all}` : base;
  };

  const paths = sizeParams.length > 0 ? sizeParams.map((sp) => build(sp)) : [build()];
  return [...new Set(paths)].slice(0, MAX_PATHS_PER_BASE);
}

/**
 * Criterion-filter fields derived from the profile. These are applied by our
 * own matching/scoring engine on every listing, fashion or not. Existing
 * criterion values win, so a search can always override the profile.
 */
export function profileToFilterPatch(p: ShopperProfile): {
  preferredBrands: string[];
  excludedBrands: string[];
  preferredSellers: string[];
  maxPrice?: number;
  minDiscountPct?: number;
} {
  return {
    preferredBrands: p.preferredBrands,
    excludedBrands: p.excludedBrands,
    preferredSellers: p.preferredSellers,
    ...(p.maxPrice != null ? { maxPrice: p.maxPrice } : {}),
    ...(p.minDiscountPct != null ? { minDiscountPct: p.minDiscountPct } : {}),
  };
}
