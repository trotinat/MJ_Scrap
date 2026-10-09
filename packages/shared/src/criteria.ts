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
export const sitePathSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/^https?:\/\/(www\.)?marjanemall\.ma/i, ""))
  .pipe(
    z
      .string()
      .regex(/^\/[a-z0-9][a-z0-9\-/]*$/i, "Chemin invalide (ex. /tv-son-photo/tv-home-cinema/televiseur)")
      .max(200)
      .refine((p) => !p.includes(".."), "Chemin invalide"),
  );

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
