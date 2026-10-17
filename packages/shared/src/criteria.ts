import { z } from "zod";
import { SPEC_ATTRIBUTE_KEYS } from "./specs";
import { cleanList } from "./text";

export const NOTIFY_MODES = ["all", "new_only", "price_drops", "exceptional_only"] as const;
export type NotifyMode = (typeof NOTIFY_MODES)[number];

export const NOTIFY_MODE_LABELS: Record<NotifyMode, string> = {
  all: "Toutes les correspondances",
  new_only: "Nouvelles offres uniquement",
  price_drops: "Baisses de prix significatives uniquement",
  exceptional_only: "Offres exceptionnelles uniquement",
};

export const SPEC_OPERATORS = ["eq", "gte", "lte", "contains", "not_contains"] as const;
export type SpecOperator = (typeof SPEC_OPERATORS)[number];
export const SPEC_OPERATOR_LABELS: Record<SpecOperator, string> = {
  eq: "égal à",
  gte: "au moins",
  lte: "au plus",
  contains: "contient",
  not_contains: "ne contient pas",
};

export const specRuleSchema = z.object({
  attribute: z.enum(SPEC_ATTRIBUTE_KEYS),
  operator: z.enum(SPEC_OPERATORS),
  value: z.string().trim().min(1, "Valeur requise").max(100),
});
export type SpecRule = z.infer<typeof specRuleSchema>;

/** Category / listing path on marjanemall.ma, e.g. "/tv-son-photo/tv-home-cinema/televiseur". */
/**
 * A listing on marjanemall.ma: a path, optionally with the site's own filter
 * query string (e.g. "/boutique-officielle/adidas?maas_46800=42&maas_28003=Homme").
 * Full URLs are accepted and reduced to path + query; the host is always fixed.
 */
export const sitePathSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/^https?:\/\/(www\.)?marjanemall\.ma/i, "").replace(/#.*$/, "").replace(/[?&]+$/, ""))
  .pipe(
    z
      .string()
      .regex(
        /^\/[a-z0-9][a-z0-9\-/]*(\?[A-Za-z0-9_\-.,=&%+]+)?$/i,
        "Chemin invalide (ex. /tv-son-photo/tv-home-cinema/televiseur ou une URL Marjane Mall avec ses filtres)",
      )
      .max(500)
      .refine((p) => !p.includes(".."), "Chemin invalide"),
  );

/** True when the listing path carries site filters (only applied by the page's JavaScript). */
export function hasListingFilters(path: string): boolean {
  return path.includes("?");
}

const stringList = (max = 30, maxLen = 80) =>
  z
    .array(z.string().trim().max(maxLen))
    .max(max)
    .default([])
    .transform((v) => cleanList(v));

const optionalMad = z
  .union([z.number(), z.null()])
  .optional()
  .transform((v) => (v === undefined ? null : v))
  .refine((v) => v === null || (v >= 0 && v <= 10_000_000), "Montant invalide");

/** Filters of a search criterion. Amounts are in MAD (not centimes). */
export const criterionFiltersSchema = z
  .object({
    categoryPaths: z.array(sitePathSchema).max(10).default([]),
    productType: z.enum(['any', 'shoes', 'pants', 'tops']).default('any'),
    sizes: stringList(12, 10),
    genders: stringList(5, 20),
    keywords: stringList(),
    altKeywords: stringList(),
    modelRef: z
      .string()
      .trim()
      .max(60)
      .nullish()
      .transform((v) => (v ? v : null)),
    includedBrands: stringList(),
    excludedBrands: stringList(),
    preferredBrands: stringList(),
    minPrice: optionalMad,
    maxPrice: optionalMad,
    targetPrice: optionalMad,
    minDiscountPct: z.number().min(0).max(99).nullish().transform((v) => v ?? null),
    mandatorySpecs: z.array(specRuleSchema).max(20).default([]),
    preferredSpecs: z.array(specRuleSchema).max(20).default([]),
    preferredCharacteristics: stringList(),
    excludedCharacteristics: stringList(),
    preferredSellers: stringList(),
    excludedSellers: stringList(),
    minRating: z.number().min(0).max(5).nullish().transform((v) => v ?? null),
    minReviewCount: z.number().int().min(0).max(100000).nullish().transform((v) => v ?? null),
    condition: z.enum(["any", "new_only"]).default("any"),
  })
  .superRefine((f, ctx) => {
    if (f.minPrice !== null && f.maxPrice !== null && f.minPrice > f.maxPrice) {
      ctx.addIssue({ code: "custom", path: ["maxPrice"], message: "Le prix maximum doit être supérieur au prix minimum" });
    }
    if (f.targetPrice !== null && f.maxPrice !== null && f.targetPrice > f.maxPrice) {
      ctx.addIssue({ code: "custom", path: ["targetPrice"], message: "Le prix cible doit être inférieur ou égal au prix maximum" });
    }
    if (f.keywords.length === 0 && f.altKeywords.length === 0 && !f.modelRef && f.categoryPaths.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["keywords"],
        message: "Indiquez au moins un mot-clé, une référence ou une catégorie",
      });
    }
  });
export type CriterionFilters = z.infer<typeof criterionFiltersSchema>;

export const criterionInputSchema = z.object({
  shopId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(60).default("marjane-mall"),
  name: z.string().trim().min(1, "Nom requis").max(120),
  description: z.string().trim().max(1000).default(""),
  enabled: z.boolean().default(true),
  notifyMode: z.enum(NOTIFY_MODES).default("all"),
  notifyMinScore: z.number().int().min(0).max(100).default(50),
  minPriceDropPct: z.number().min(0.5).max(90).default(5),
  filters: criterionFiltersSchema,
});
export type CriterionInput = z.infer<typeof criterionInputSchema>;
export type CriterionInputRaw = z.input<typeof criterionInputSchema>;

/** A criterion as consumed by the matching engine. */
export interface Criterion extends CriterionInput {
  id: string;
  ownerId?: string;
}

/** Demonstration criteria (seeded disabled-by-default on demand, never hardcoded rules). */
export const EXAMPLE_CRITERIA: CriterionInputRaw[] = [
  {
    name: "Smart TV 55\" 4K",
    description: "Exemple : TV 4K 55 pouces entre 4 000 et 6 000 MAD.",
    enabled: false,
    notifyMode: "all",
    notifyMinScore: 70,
    filters: {
      categoryPaths: ["/tv-son-photo/tv-home-cinema/televiseur"],
      keywords: ["TV", "Téléviseur", "Smart TV"],
      altKeywords: ["QLED", "Mini LED", "4K"],
      preferredBrands: ["TCL", "Samsung", "LG"],
      minPrice: 4000,
      maxPrice: 6000,
      targetPrice: 4500,
      mandatorySpecs: [
        { attribute: "screen_size_in", operator: "eq", value: "55" },
        { attribute: "resolution", operator: "gte", value: "4K" },
      ],
      preferredSpecs: [{ attribute: "panel", operator: "contains", value: "QLED" }],
    },
  },
  {
    name: "Ordinateur portable 16 Go / 512 Go",
    description: "Exemple : laptop Lenovo/ASUS/HP entre 6 000 et 10 000 MAD.",
    enabled: false,
    notifyMode: "price_drops",
    notifyMinScore: 60,
    filters: {
      categoryPaths: ["/informatique-gaming"],
      keywords: ["ordinateur portable", "laptop", "ultrabook", "PC portable"],
      preferredBrands: ["Lenovo", "ASUS", "HP"],
      minPrice: 6000,
      maxPrice: 10000,
      mandatorySpecs: [
        { attribute: "ram_gb", operator: "gte", value: "16" },
        { attribute: "storage_gb", operator: "gte", value: "512" },
      ],
    },
  },
  {
    name: "Accessoires auto",
    description: "Exemple : dashcam et supports téléphone.",
    enabled: false,
    notifyMode: "all",
    notifyMinScore: 50,
    filters: {
      categoryPaths: ["/auto-moto"],
      keywords: ["dashcam", "support téléphone", "accessoires auto"],
      altKeywords: ["caméra embarquée", "support smartphone voiture"],
      maxPrice: 1000,
    },
  },
];

/**
 * Recommended criteria, enabled, added once on first start (and on demand
 * from the criteria page). Paths come from the site structure observed in
 * October 2026; each one stays editable.
 */
/** Children's and women's products, as named on Marjane Mall ("pour Fille", "EL I", "… W"). */
export const ADIDAS_HOMME_EXCLUSIONS = ["enfants", "enfant", "femme", "femmes", "W", "fille", "filles", "garçon", "garcon", "junior", "kids", "bébé", "bebe"];

export const RECOMMENDED_CRITERIA: CriterionInputRaw[] = [
  {
    name: "Adidas Homme – pointure 42",
    description: "Boutique officielle Adidas filtrée sur le site : pointure 42, Homme, livraison express, tri par prix croissant.",
    enabled: true,
    notifyMode: "all",
    notifyMinScore: 50,
    minPriceDropPct: 5,
    filters: {
      categoryPaths: [
        "https://www.marjanemall.ma/boutique-officielle/adidas?maas_46800=42&m_shipping_express=1&maas_28003=Homme&sortBy=magento2_prod_fr_products_price_default_asc",
      ],
      keywords: ["chaussures", "shoes", "baskets", "sneakers", "claquette", "mules"],
      includedBrands: ["Adidas"],
      excludedCharacteristics: ADIDAS_HOMME_EXCLUSIONS,
    },
  },
  {
    name: "Ventes flash : -40 % et plus",
    description: "Tout produit des Ventes flash dont la remise annoncée atteint au moins 40 %.",
    enabled: true,
    notifyMode: "all",
    notifyMinScore: 70,
    filters: {
      categoryPaths: ["/ventes-flash"],
      minDiscountPct: 40,
    },
  },
  {
    name: "Smart TV 55\" 4K – moins de 6 000 MAD",
    description: "Téléviseur 4K de 55 pouces, idéalement sous 4 500 MAD.",
    enabled: true,
    notifyMode: "all",
    notifyMinScore: 70,
    filters: {
      categoryPaths: ["/tv-son-photo/tv-home-cinema/televiseur"],
      keywords: ["TV", "Téléviseur", "Smart TV"],
      preferredBrands: ["TCL", "Samsung", "LG", "Hisense"],
      maxPrice: 6000,
      targetPrice: 4500,
      mandatorySpecs: [
        { attribute: "screen_size_in", operator: "eq", value: "55" },
        { attribute: "resolution", operator: "gte", value: "4K" },
      ],
    },
  },
  {
    name: "Casques & écouteurs – moins de 500 MAD",
    description: "Casques et écouteurs avec au moins 20 % de remise annoncée.",
    enabled: true,
    notifyMode: "all",
    notifyMinScore: 60,
    filters: {
      categoryPaths: ["/tv-son-photo/audio-hifi-musique/casque-ecouteur"],
      keywords: ["casque", "écouteurs", "écouteur", "earbuds", "headphones"],
      maxPrice: 500,
      minDiscountPct: 20,
    },
  },
  {
    name: "Friteuse sans huile – moins de 1 000 MAD",
    description: "Airfryer sous 1 000 MAD, idéalement sous 700 MAD.",
    enabled: true,
    notifyMode: "all",
    notifyMinScore: 60,
    filters: {
      categoryPaths: ["/electromenager/cuisine-et-cuisson/airfryer"],
      keywords: ["friteuse", "airfryer", "air fryer"],
      maxPrice: 1000,
      targetPrice: 700,
    },
  },
];

/** Women's / children's products to keep out of a men's fashion search. */
export const MEN_FASHION_EXCLUSIONS = ["femme", "femmes", "fille", "filles", "enfant", "enfants", "bébé", "bebe", "garçon", "garcon", "junior", "kids", "W"];

/**
 * Men's fashion searches tuned for the best promos, pre-filtered on the site by
 * genre (Homme) and the right size facet per garment (taille M for tops,
 * pointure 42 for shoes). Seeded once via a dedicated migration so they land on
 * databases that already ran the first recommended-criteria seed. Every path
 * and size stays editable, and they follow the shopper profile where it is set.
 */
export const FASHION_CRITERIA: CriterionInputRaw[] = [
  {
    name: "Mode Homme – Hauts en promo (taille M)",
    description: "T-shirts, polos, sweats et chemises homme en taille M, triés sur les plus fortes remises (≥ 30 %).",
    enabled: true,
    notifyMode: "all",
    notifyMinScore: 55,
    filters: {
      categoryPaths: [
        "/vetements-chaussures-bijoux-accessoires/vetements-homme/t-shirts-polos?maas_28003=Homme&taille_master=M",
        "/vetements-chaussures-bijoux-accessoires/vetements-homme/sweat-shirt-hoodies?maas_28003=Homme&taille_master=M",
      ],
      keywords: ["t-shirt", "tee-shirt", "polo", "sweat", "hoodie", "chemise", "pull", "veste"],
      minDiscountPct: 30,
      excludedCharacteristics: MEN_FASHION_EXCLUSIONS,
    },
  },
  {
    name: "Mode Homme – Pantalons & jeans (taille 32/33)",
    description: "Pantalons et jeans homme (cargo, chino, jogger) en promo. Pré-filtré Homme ; affinez la taille 32/33 sur la fiche.",
    enabled: true,
    notifyMode: "all",
    notifyMinScore: 55,
    filters: {
      categoryPaths: ["/vetements-chaussures-bijoux-accessoires/vetements-homme/pantalons-jeans?maas_28003=Homme"],
      keywords: ["pantalon", "jean", "chino", "cargo", "jogger"],
      maxPrice: 700,
      minDiscountPct: 20,
      excludedCharacteristics: MEN_FASHION_EXCLUSIONS,
    },
  },
  {
    name: "Chaussures Homme – pointure 42 en promo",
    description: "Baskets, sneakers et chaussures de sport homme en pointure 42, avec au moins 20 % de remise annoncée.",
    enabled: true,
    notifyMode: "all",
    notifyMinScore: 55,
    filters: {
      categoryPaths: [
        "/sport/vetements-chaussures-de-sport?maas_46800=42&maas_28003=Homme",
        "/vetements-chaussures-bijoux-accessoires/vetements-homme?maas_46800=42&maas_28003=Homme",
      ],
      keywords: ["chaussures", "baskets", "sneakers", "shoes", "running", "sandales", "claquette", "mules"],
      minDiscountPct: 20,
      excludedCharacteristics: MEN_FASHION_EXCLUSIONS,
    },
  },
];
