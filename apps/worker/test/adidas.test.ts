import { describe, expect, it } from "vitest";
import {
  criterionInputSchema,
  DEFAULT_SETTINGS,
  extractSpecs,
  hasListingFilters,
  madToCents,
  phraseMatches,
  sitePathSchema,
  type Criterion,
  type MatchableProduct,
} from "@mdw/shared";
import { detectBrand, parsePriceLines, findSeller } from "@mdw/scraper";
import { evaluate } from "@mdw/scoring";
import { ADIDAS_CRITERION_INPUT, OBSERVED } from "./fixtures/adidas";

describe("Adidas filtered listing criterion", () => {
  const criterion: Criterion = { id: "adidas", ...criterionInputSchema.parse(ADIDAS_CRITERION_INPUT) };

  it("accepts a filtered Marjane URL and keeps its query", () => {
    const path = criterion.filters.categoryPaths[0]!;
    expect(path).toBe("/boutique-officielle/adidas?maas_46800=42&m_shipping_express=1&maas_28003=Homme&sortBy=magento2_prod_fr_products_price_default_asc");
    expect(hasListingFilters(path)).toBe(true);
    expect(sitePathSchema.safeParse("/boutique-officielle/adidas?x=<script>").success).toBe(false);
    expect(sitePathSchema.safeParse("https://evil.example/boutique?x=1").success).toBe(false);
  });

  it("parses the observed card text and brand", () => {
    expect(parsePriceLines(["Vendu par MARJANEMALL19900DH-26%270 DH"])).toMatchObject({ priceCents: 19900, originalPriceCents: 27000, advertisedDiscountPct: 26 });
    expect(findSeller(["Vendu par MARJANEMALL19900DH-26%270 DH"])).toBe("MARJANEMALL");
    expect(detectBrand("Adidas-SHOES-GALAXY 8 M CBLACK/BOGOLD/CARBON")).toBe("Adidas");
    expect(detectBrand("BBALL CAP CLIMA WHITE/BLACK/BLACK")).toBeNull();
  });

  it("short tokens match whole words only", () => {
    expect(phraseMatches("GALAXY 8 W DISPIN", "W")).toBe(true);
    expect(phraseMatches("CAP WHITE/BLACK", "W")).toBe(false);
  });

  it("keeps only men's Adidas shoes among the 10 observed products", () => {
    const results = OBSERVED.map(([title, price, orig, disc]) => {
      const p: MatchableProduct = {
        title,
        brand: detectBrand(title),
        modelRef: null,
        categoryPath: criterion.filters.categoryPaths[0]!,
        priceCents: madToCents(price),
        originalPriceCents: madToCents(orig),
        advertisedDiscountPct: disc,
        seller: null,
        stock: "unknown",
        rating: null,
        reviewCount: null,
        rawSpecs: {},
        specs: extractSpecs(title),
      };
      return { title, ev: evaluate(criterion, p, { observationCount: 1, previousPriceCents: null, minPriceCents: null, previousMinPriceCents: null, firstSeenAt: new Date() }, DEFAULT_SETTINGS) };
    });
    const matched = results.filter((r) => r.ev.isMatch).map((r) => r.title);
    expect(matched).toEqual([
      "ADIDAS Claquette ADILETTE AQUA pour hommes - FTWWHT/CBLACK/FTWWHT",
      "Adidas-SHOES-RESPONSE PACE M ASHGRE/SILVMT/LUOR",
      "ADIDAS VL COURT BASE - Chaussures pour hommes",
      "Adidas-SHOES-GALAXY 8 M CBLACK/BOGOLD/CARBON",
      "Adidas-SHOES-DURAMO RC2 M MUTPRP/FLAAQU/LURABL",
    ]);
    const why = (t: string) => results.find((r) => r.title.startsWith(t))!.ev.failedReasons.join(" | ");
    expect(why("ADIDAS - Sac à dos")).toMatch(/mot-clé|enfants/);
    expect(why("Adidas-SHOES-RESPONSE PACE W")).toMatch(/« W »/);
    expect(why("BBALL CAP")).toMatch(/marque/);
    // With no price target, the advertised discount drives the ranking: Duramo (-35 %) comes first.
    const score = (t: string) => results.find((r) => r.title.startsWith(t))!.ev.score;
    expect(score("Adidas-SHOES-DURAMO")).toBeGreaterThan(score("Adidas-SHOES-RESPONSE PACE M"));
  });
});
