import { describe, expect, it } from "vitest";
import {
  criterionInputSchema,
  DEFAULT_SETTINGS,
  EXAMPLE_CRITERIA,
  extractSpecs,
  type Criterion,
  type CriterionInputRaw,
  type MatchableProduct,
  type PriceHistoryFacts,
} from "@mdw/shared";
import { decideNotification, evaluate, historyFacts, priceStats, type PreviousMatchState } from "../src";

const crit = (raw: CriterionInputRaw, id = "c1"): Criterion => ({ id, ...criterionInputSchema.parse(raw) });
const tvCriterion = crit({ ...EXAMPLE_CRITERIA[0]!, enabled: true }, "tv");
const laptopCriterion = crit({ ...EXAMPLE_CRITERIA[1]!, enabled: true }, "laptop");

/** Builds a product; specs are always re-extracted from the final title + raw specs. */
function product(over: Partial<MatchableProduct> & { title: string }): MatchableProduct {
  const merged: MatchableProduct = {
    brand: null,
    modelRef: null,
    categoryPath: null,
    priceCents: 0,
    originalPriceCents: null,
    advertisedDiscountPct: null,
    seller: null,
    stock: "unknown",
    rating: null,
    reviewCount: null,
    rawSpecs: {},
    ...over,
    specs: {},
  };
  merged.specs = extractSpecs(merged.title, merged.rawSpecs);
  return merged;
}

const noHistory: PriceHistoryFacts = { observationCount: 1, previousPriceCents: null, minPriceCents: null, previousMinPriceCents: null, firstSeenAt: new Date("2026-10-01T08:00:00Z") };

const samsung = product({
  title: "Téléviseur Samsung QLED 55 pouces – Modèle QA55Q6FAAUXMV",
  brand: "Samsung",
  modelRef: "QA55Q6FAAUXMV",
  categoryPath: "/tv-son-photo/tv-home-cinema/televiseur",
  priceCents: 414900,
  originalPriceCents: 650000,
  advertisedDiscountPct: 36,
  seller: "ElectroElaissi",
  stock: "in_stock",
  rawSpecs: { "Résolution d'affichage": "3840 x 2160 pixels - (Ultra HD 4K)", "Classe de diagonale": '55"' },
});

describe("mandatory vs preferred filters", () => {
  it("matches a compliant TV and explains why in French", () => {
    const ev = evaluate(tvCriterion, samsung, noHistory, DEFAULT_SETTINGS);
    expect(ev.isMatch).toBe(true);
    expect(ev.targetReached).toBe(true);
    expect(ev.explanation).toContain("Cette offre correspond à vos critères");
    expect(ev.explanation).toContain("écran 55 pouces");
    expect(ev.explanation).toContain("résolution 4K");
    expect(ev.explanation).toContain("prix inférieur ou égal à votre objectif");
    expect(ev.explanation).toContain("Premier relevé");
    expect(ev.explanation).toContain("Remise annoncée par Marjane Mall : -36 %");
  });

  it("rejects a product violating a mandatory requirement even with a great price", () => {
    const tv50 = product({ ...samsung, title: "Téléviseur Samsung QLED 50 pouces 4K", rawSpecs: {}, priceCents: 400000, advertisedDiscountPct: 60 });
    const ev = evaluate(tvCriterion, tv50, noHistory, DEFAULT_SETTINGS);
    expect(ev.isMatch).toBe(false);
    expect(ev.failedReasons.join(" ")).toMatch(/taille d'écran/);
    expect(ev.explanation).toMatch(/^Ne correspond pas/);
  });

  it("treats missing mandatory data as not verifiable (never as a pass)", () => {
    const noSize = product({ ...samsung, title: "Téléviseur Samsung QLED 4K", rawSpecs: {} });
    const ev = evaluate(tvCriterion, noSize, noHistory, DEFAULT_SETTINGS);
    expect(ev.isMatch).toBe(false);
    expect(ev.failedReasons.join(" ")).toMatch(/non vérifiable/);
  });

  it("enforces price range and excluded brands", () => {
    const tooExpensive = product({ ...samsung, priceCents: 700000 });
    expect(evaluate(tvCriterion, tooExpensive, noHistory, DEFAULT_SETTINGS).isMatch).toBe(false);
    const excl = crit({ name: "x", filters: { keywords: ["téléviseur"], excludedBrands: ["Samsung"] } });
    expect(evaluate(excl, samsung, noHistory, DEFAULT_SETTINGS).failedReasons[0]).toMatch(/marque exclue/);
  });

  it("preferences only affect the score", () => {
    const lg = product({ ...samsung, brand: "LG", title: "Téléviseur LG QNED 55 pouces 4K" });
    const hisense = product({ ...samsung, brand: "Hisense", title: "Téléviseur Hisense 55 pouces 4K" });
    const a = evaluate(tvCriterion, lg, noHistory, DEFAULT_SETTINGS);
    const b = evaluate(tvCriterion, hisense, noHistory, DEFAULT_SETTINGS);
    expect(a.isMatch && b.isMatch).toBe(true);
    expect(a.score).toBeGreaterThan(b.score);
  });

  it("evaluates multiple criteria independently", () => {
    const laptop = product({
      title: 'PC Portable Lenovo IdeaPad Slim 5 14" Ryzen 7 16 Go RAM 512 Go SSD',
      brand: "Lenovo",
      priceCents: 799900,
      stock: "in_stock",
    });
    expect(evaluate(laptopCriterion, laptop, noHistory, DEFAULT_SETTINGS).isMatch).toBe(true);
    expect(evaluate(tvCriterion, laptop, noHistory, DEFAULT_SETTINGS).isMatch).toBe(false);
    expect(evaluate(laptopCriterion, samsung, noHistory, DEFAULT_SETTINGS).isMatch).toBe(false);
    const laptop8 = product({ ...laptop, title: "PC Portable Lenovo 8 Go RAM 512 Go SSD" });
    expect(evaluate(laptopCriterion, laptop8, noHistory, DEFAULT_SETTINGS).isMatch).toBe(false);
  });
});

describe("deal scoring", () => {
  it("stays within 0..100 and does not reward missing data", () => {
    const bare = product({ title: "Téléviseur 55 pouces 4K", priceCents: 590000 });
    const ev = evaluate(tvCriterion, bare, noHistory, DEFAULT_SETTINGS);
    expect(ev.score).toBeGreaterThanOrEqual(0);
    expect(ev.score).toBeLessThanOrEqual(100);
    const rating = ev.breakdown.find((c) => c.key === "rating")!;
    expect(rating.applicable).toBe(false);
    const stock = ev.breakdown.find((c) => c.key === "stock")!;
    expect(stock.applicable).toBe(false);
    expect(ev.breakdown.find((c) => c.key === "advertisedDiscount")!.value).toBe(0);
  });

  it("an observed price drop raises the score and is explained with numbers", () => {
    const hist: PriceHistoryFacts = { observationCount: 3, previousPriceCents: 450900, minPriceCents: 414900, previousMinPriceCents: 449900, firstSeenAt: new Date("2026-10-01T08:00:00Z") };
    const ev = evaluate(tvCriterion, samsung, hist, DEFAULT_SETTINGS);
    const base = evaluate(tvCriterion, samsung, noHistory, DEFAULT_SETTINGS);
    expect(ev.changeVsPreviousPct).toBe(-8);
    expect(ev.isHistoricalLow).toBe(true);
    expect(ev.explanation).toContain("inférieur de 8 % à celui observé lors de la précédente collecte");
    expect(ev.explanation).toContain("plus bas observé");
    expect(ev.score).toBeGreaterThanOrEqual(base.score - 15);
  });

  it("classification thresholds are configurable", () => {
    const strict = { ...DEFAULT_SETTINGS, thresholds: { exceptional: 99, veryGood: 98, interesting: 97 } };
    expect(evaluate(tvCriterion, samsung, noHistory, strict).dealClass).toBe("ordinary");
  });

  it("a high score never overrides mandatory constraints", () => {
    const greatButWrong = product({ ...samsung, title: "Téléviseur Samsung QLED 65 pouces 4K", rawSpecs: {}, advertisedDiscountPct: 70, priceCents: 300000 });
    const ev = evaluate(tvCriterion, greatButWrong, noHistory, DEFAULT_SETTINGS);
    expect(ev.isMatch).toBe(false);
  });
});

describe("history facts", () => {
  it("computes previous price and historical minimum from observations only", () => {
    const f = historyFacts([
      { priceCents: 500000, observedAt: new Date("2026-10-01T08:00:00Z") },
      { priceCents: 450000, observedAt: new Date("2026-10-01T17:00:00Z") },
      { priceCents: 470000, observedAt: new Date("2026-10-02T08:00:00Z") },
    ]);
    expect(f).toMatchObject({ observationCount: 3, previousPriceCents: 450000, minPriceCents: 450000, previousMinPriceCents: 450000 });
    expect(historyFacts([])).toMatchObject({ observationCount: 0, previousPriceCents: null });
    expect(priceStats([{ priceCents: 100, observedAt: new Date(1) }, { priceCents: 80, observedAt: new Date(2) }])).toMatchObject({ changeSinceFirstPct: -20, minCents: 80 });
  });
});

describe("notification rules", () => {
  const t = (priceCents: number, previousPriceCents: number | null = null, extra: Partial<Parameters<typeof decideNotification>[3]> = {}) => ({
    offerId: "o1",
    priceCents,
    previousPriceCents,
    previousStock: null,
    currentStock: "in_stock" as const,
    observationKey: "1",
    ...extra,
  });
  const ev = (priceCents: number) => evaluate(tvCriterion, { ...samsung, priceCents }, noHistory, DEFAULT_SETTINGS);
  const notified = (priceCents: number): PreviousMatchState => {
    const e = ev(priceCents);
    return { isMatch: true, score: e.score, dealClass: e.dealClass, priceCents, lastNotifiedPriceCents: priceCents, lastNotifiedAt: new Date() };
  };

  it("notifies when an existing match becomes exceptional", () => {
    const prev: PreviousMatchState = { ...notified(414900), dealClass: "very_good" };
    const e = ev(414900);
    expect(e.dealClass).toBe("exceptional");
    expect(decideNotification(tvCriterion, e, prev, t(414900, 414900))?.event).toBe("exceptional");
  });

  it("first match below target -> target_reached with a stable key", () => {
    const d = decideNotification(tvCriterion, ev(414900), null, t(414900));
    expect(d?.event).toBe("target_reached");
    expect(d?.events).toContain("new_match");
    expect(d?.dedupeKey).toBe("target:tv:o1:450000:414900");
  });

  it("does not repeat for an unchanged offer", () => {
    expect(decideNotification(tvCriterion, ev(414900), notified(414900), t(414900, 414900))).toBeNull();
  });

  it("notifies again only after a meaningful further drop", () => {
    expect(decideNotification(tvCriterion, ev(437000), notified(440000), t(437000, 440000))).toBeNull(); // -0.7 %
    const d = decideNotification(tvCriterion, ev(410000), notified(440000), t(410000, 437000)); // -6.8 % vs last alert
    expect(d?.event).toBe("price_drop");
    expect(d?.dedupeKey).toBe("drop:tv:o1:410000");
  });

  it("notifies on restock when stock is observed on both sides", () => {
    const d = decideNotification(tvCriterion, ev(414900), notified(414900), t(414900, 414900, { previousStock: "out_of_stock", observationKey: "42" }));
    expect(d?.event).toBe("back_in_stock");
    expect(d?.dedupeKey).toBe("restock:tv:o1:42");
  });

  it("respects the notification mode", () => {
    const newOnly = { ...tvCriterion, notifyMode: "new_only" as const };
    expect(decideNotification(newOnly, ev(390000), notified(414900), t(390000, 414900))).toBeNull();
    expect(decideNotification(newOnly, ev(414900), null, t(414900))?.event).toBe("new_match");
  });

  it("never notifies for non-matching products", () => {
    const bad = evaluate(tvCriterion, { ...samsung, priceCents: 900000 }, noHistory, DEFAULT_SETTINGS);
    expect(decideNotification(tvCriterion, bad, null, t(900000))).toBeNull();
  });
});
