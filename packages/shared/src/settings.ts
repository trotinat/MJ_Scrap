import { z } from "zod";
import { sitePathSchema } from "./criteria";

export const scoreWeightsSchema = z.object({
  price: z.number().min(0).max(100).default(30),
  observedDrop: z.number().min(0).max(100).default(20),
  advertisedDiscount: z.number().min(0).max(100).default(15),
  specs: z.number().min(0).max(100).default(15),
  brand: z.number().min(0).max(100).default(10),
  rating: z.number().min(0).max(100).default(5),
  seller: z.number().min(0).max(100).default(5),
  stock: z.number().min(0).max(100).default(5),
});
export type ScoreWeights = z.infer<typeof scoreWeightsSchema>;

export const scoreThresholdsSchema = z
  .object({
    exceptional: z.number().int().min(1).max(100).default(85),
    veryGood: z.number().int().min(1).max(100).default(70),
    interesting: z.number().int().min(1).max(100).default(50),
  })
  .refine((t) => t.exceptional > t.veryGood && t.veryGood > t.interesting, {
    message: "Les seuils doivent être décroissants (exceptionnelle > très bonne > intéressante)",
  });
export type ScoreThresholds = z.infer<typeof scoreThresholdsSchema>;

export const appSettingsSchema = z.object({
  /** Promotion pages scanned on every run in addition to criteria categories. */
  dealPagePaths: z.array(sitePathSchema).max(20).default(["/ventes-flash", "/destockage", "/les-deals-de-l-automne", "/tout-a-moins-de-200-dh"]),
  maxListingPagesPerPath: z.number().int().min(1).max(20).default(4),
  maxDetailFetchesPerRun: z.number().int().min(0).max(1000).default(40),
  requestDelayMs: z.number().int().min(1000).max(60000).default(3000),
  /** After this many consecutive successful runs without seeing an offer, it is marked "missing". */
  missingAfterRuns: z.number().int().min(1).max(30).default(3),
  /** Hours after which an observation is considered stale in the UI. */
  staleAfterHours: z.number().int().min(1).max(240).default(26),
  weights: scoreWeightsSchema.default({}),
  thresholds: scoreThresholdsSchema.default({}),
  notificationsEnabled: z.boolean().default(true),
});
export type AppSettings = z.infer<typeof appSettingsSchema>;

export const DEFAULT_SETTINGS: AppSettings = appSettingsSchema.parse({});

export type DealClass = "exceptional" | "very_good" | "interesting" | "ordinary";

export const DEAL_CLASS_LABELS: Record<DealClass, string> = {
  exceptional: "Offre exceptionnelle",
  very_good: "Très bonne offre",
  interesting: "Offre intéressante",
  ordinary: "Offre ordinaire",
};

export function classifyScore(score: number, t: ScoreThresholds): DealClass {
  if (score >= t.exceptional) return "exceptional";
  if (score >= t.veryGood) return "very_good";
  if (score >= t.interesting) return "interesting";
  return "ordinary";
}
