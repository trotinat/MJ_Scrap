import {
  anyPhraseMatches,
  classifyScore,
  formatMad,
  formatMoroccoTime,
  madToCents,
  normalizeRef,
  normalizeText,
  phraseMatches,
  roundTo,
  type AppSettings,
  type Criterion,
  type DealClass,
  type MatchableProduct,
  type PriceHistoryFacts,
} from "@mdw/shared";
import { evaluateRule } from "./rules";

export interface ScoreComponent {
  key: string;
  label: string;
  weight: number;
  /** 0..1 */
  value: number;
  applicable: boolean;
  note?: string;
}

export interface Evaluation {
  isMatch: boolean;
  /** Why the product is NOT a valid match (empty when it matches). */
  failedReasons: string[];
  /** Positive facts used in the explanation. */
  satisfied: string[];
  score: number;
  dealClass: DealClass;
  breakdown: ScoreComponent[];
  explanation: string;
  targetReached: boolean;
  /** Change vs the previous observation (%, negative = cheaper), null when unknown. */
  changeVsPreviousPct: number | null;
  isHistoricalLow: boolean;
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const REFURB = /\b(reconditionn|occasion|refurb|seconde main|d occasion|usag)/;

function joinFr(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

function brandIn(brand: string | null, list: string[]): boolean {
  if (!brand) return false;
  const b = normalizeText(brand);
  return list.some((x) => normalizeText(x) === b);
}

/**
 * Evaluates one product against one criterion.
 * Mandatory filters decide `isMatch`; the score only ranks valid matches and
 * can never turn a non-matching product into a match.
 */
export function evaluate(
  criterion: Criterion,
  p: MatchableProduct,
  history: PriceHistoryFacts,
  settings: Pick<AppSettings, "weights" | "thresholds">,
): Evaluation {
  const f = criterion.filters;
  const failed: string[] = [];
  const satisfied: string[] = [];
  const titleText = `${p.brand ?? ""} ${p.title}`;
  const fullText = `${titleText} ${Object.entries(p.rawSpecs)
    .map(([k, v]) => `${k} ${v}`)
    .join(" ")}`;

  /* ---------------------------- mandatory filters --------------------------- */
  const allKeywords = [...f.keywords, ...f.altKeywords];
  if (allKeywords.length > 0 && !anyPhraseMatches(titleText, allKeywords)) {
    failed.push("aucun mot-clé du critère dans le titre");
  }

  if (f.modelRef) {
    const want = normalizeRef(f.modelRef);
    const ok = (p.modelRef && p.modelRef.includes(want)) || normalizeRef(p.title).includes(want);
    if (!ok) failed.push(`référence ${f.modelRef} absente`);
    else satisfied.push(`référence ${f.modelRef}`);
  }

  if (f.categoryPaths.length > 0 && p.categoryPath) {
    const inCat = f.categoryPaths.some((c) => p.categoryPath!.startsWith(c) || c.startsWith(p.categoryPath!));
    if (!inCat) failed.push("catégorie différente");
  }

  if (f.includedBrands.length > 0) {
    if (!p.brand) failed.push("marque inconnue (marques imposées)");
    else if (!brandIn(p.brand, f.includedBrands)) failed.push(`marque ${p.brand} hors de la liste imposée`);
  }
  if (f.excludedBrands.length > 0 && (brandIn(p.brand, f.excludedBrands) || anyPhraseMatches(titleText, f.excludedBrands))) {
    failed.push(`marque exclue${p.brand ? ` (${p.brand})` : ""}`);
  }

  if (f.minPrice !== null && p.priceCents < madToCents(f.minPrice)) failed.push(`prix inférieur au minimum (${formatMad(madToCents(f.minPrice))})`);
  if (f.maxPrice !== null && p.priceCents > madToCents(f.maxPrice)) failed.push(`prix supérieur au maximum (${formatMad(madToCents(f.maxPrice))})`);

  if (f.minDiscountPct !== null) {
    if (p.advertisedDiscountPct === null) failed.push("aucune remise annoncée");
    else if (p.advertisedDiscountPct < f.minDiscountPct) failed.push(`remise annoncée de ${p.advertisedDiscountPct} % (< ${f.minDiscountPct} %)`);
  }

  for (const rule of f.mandatorySpecs) {
    const r = evaluateRule(rule, p);
    if (r.outcome === "pass") satisfied.push(r.text);
    else failed.push(r.text);
  }

  for (const c of f.excludedCharacteristics) {
    if (phraseMatches(fullText, c)) failed.push(`caractéristique exclue : « ${c} »`);
  }

  if (f.excludedSellers.length > 0 && p.seller && f.excludedSellers.some((s) => normalizeText(s) === normalizeText(p.seller))) {
    failed.push(`vendeur exclu (${p.seller})`);
  }

  if (f.minRating !== null) {
    if (p.rating === null) failed.push("note client non disponible");
    else if (p.rating < f.minRating) failed.push(`note ${p.rating}/5 (< ${f.minRating})`);
  }
  if (f.minReviewCount !== null) {
    if (p.reviewCount === null) failed.push("nombre d'avis non disponible");
    else if (p.reviewCount < f.minReviewCount) failed.push(`${p.reviewCount} avis (< ${f.minReviewCount})`);
  }

  if (f.condition === "new_only" && REFURB.test(normalizeText(fullText))) failed.push("produit reconditionné ou d'occasion");

  /* -------------------------------- scoring -------------------------------- */
  const w = settings.weights;
  const components: ScoreComponent[] = [];
  const target = f.targetPrice !== null ? madToCents(f.targetPrice) : null;
  const max = f.maxPrice !== null ? madToCents(f.maxPrice) : null;
  const price = p.priceCents;
  const targetReached = target !== null && price <= target;

  // 1. Price vs target / max
  {
    let value = 0;
    let note: string | undefined;
    const applicable = target !== null || max !== null;
    if (target !== null) {
      if (price <= target) {
        value = 1;
        note = `≤ prix cible ${formatMad(target)}`;
        satisfied.push(`prix inférieur ou égal à votre objectif (${formatMad(target)})`);
      } else {
        const ref = max ?? Math.round(target * 1.25);
        value = ref > target ? clamp((ref - price) / (ref - target)) * 0.8 : 0;
        note = `${formatMad(price - target)} au-dessus du prix cible`;
        if (max !== null && price <= max) satisfied.push(`prix dans votre budget (≤ ${formatMad(max)})`);
      }
    } else if (max !== null) {
      value = clamp((max - price) / (max * 0.3));
      note = `${roundTo(((max - price) / max) * 100)} % sous le maximum`;
      if (price <= max) satisfied.push(`prix dans votre budget (≤ ${formatMad(max)})`);
    }
    components.push({ key: "price", label: "Prix / objectif", weight: w.price, value, applicable, note });
  }

  // 2. Observed price movement (only from our own observations)
  const prev = history.previousPriceCents;
  const changeVsPreviousPct = prev !== null && prev > 0 ? roundTo(((price - prev) / prev) * 100) : null;
  const isHistoricalLow = history.previousMinPriceCents !== null && price < history.previousMinPriceCents;
  {
    const applicable = history.observationCount >= 2 && prev !== null;
    let value = 0;
    let note = "pas encore d'historique";
    if (applicable) {
      const drop = prev! > 0 ? (prev! - price) / prev! : 0;
      value = clamp(drop / 0.2);
      if (isHistoricalLow) value = Math.max(value, 0.5);
      note =
        changeVsPreviousPct === 0
          ? "prix inchangé"
          : `${changeVsPreviousPct! > 0 ? "+" : ""}${changeVsPreviousPct} % vs relevé précédent${isHistoricalLow ? ", plus bas observé" : ""}`;
    }
    components.push({ key: "observedDrop", label: "Baisse observée", weight: w.observedDrop, value, applicable, note });
  }

  // 3. Advertised discount (as displayed by the site, kept separate)
  components.push({
    key: "advertisedDiscount",
    label: "Remise annoncée",
    weight: w.advertisedDiscount,
    value: p.advertisedDiscountPct !== null ? clamp(p.advertisedDiscountPct / 50) : 0,
    applicable: true,
    note: p.advertisedDiscountPct !== null ? `-${p.advertisedDiscountPct} % annoncé` : "aucune remise annoncée",
  });

  // 4. Preferred specs & characteristics
  {
    const prefs = f.preferredSpecs.length + f.preferredCharacteristics.length;
    let ok = 0;
    for (const rule of f.preferredSpecs) {
      const r = evaluateRule(rule, p);
      if (r.outcome === "pass") {
        ok++;
        satisfied.push(r.text);
      }
    }
    for (const c of f.preferredCharacteristics) {
      if (phraseMatches(fullText, c)) {
        ok++;
        satisfied.push(`« ${c} »`);
      }
    }
    components.push({
      key: "specs",
      label: "Spécifications préférées",
      weight: w.specs,
      value: prefs ? ok / prefs : 0,
      applicable: prefs > 0,
      note: prefs ? `${ok}/${prefs} préférence(s) satisfaite(s)` : undefined,
    });
  }

  // 5. Brand preference
  {
    const applicable = f.preferredBrands.length > 0;
    const preferred = brandIn(p.brand, f.preferredBrands);
    if (applicable && preferred) satisfied.push(`marque préférée (${p.brand})`);
    components.push({
      key: "brand",
      label: "Marque préférée",
      weight: w.brand,
      value: preferred ? 1 : 0,
      applicable,
      note: applicable ? (preferred ? p.brand! : p.brand ? `${p.brand} non préférée` : "marque inconnue") : undefined,
    });
  }

  // 6. Rating (only when the site shows one — absence is not evidence of quality)
  components.push({
    key: "rating",
    label: "Avis clients",
    weight: w.rating,
    value: p.rating !== null ? clamp((p.rating - 3) / 2) * (p.reviewCount !== null && p.reviewCount < 5 ? 0.7 : 1) : 0,
    applicable: p.rating !== null,
    note: p.rating !== null ? `${p.rating}/5${p.reviewCount !== null ? ` (${p.reviewCount} avis)` : ""}` : "note non disponible",
  });

  // 7. Seller
  {
    const applicable = p.seller !== null;
    let value = 0.5;
    const isMarjane = p.seller !== null && /^marjane/i.test(p.seller.trim());
    if (p.seller && f.preferredSellers.some((s) => normalizeText(s) === normalizeText(p.seller))) value = 1;
    else if (isMarjane) value = 1;
    else if (f.preferredSellers.length > 0) value = 0.3;
    components.push({
      key: "seller",
      label: "Vendeur",
      weight: w.seller,
      value: applicable ? value : 0,
      applicable,
      note: p.seller ? `vendu par ${p.seller}${isMarjane ? " (Marjane)" : ""}` : "vendeur inconnu",
    });
  }

  // 8. Stock
  components.push({
    key: "stock",
    label: "Disponibilité",
    weight: w.stock,
    value: p.stock === "in_stock" ? 1 : 0,
    applicable: p.stock !== "unknown",
    note: p.stock === "in_stock" ? "en stock" : p.stock === "out_of_stock" ? "rupture de stock" : "stock non affiché",
  });

  const applicable = components.filter((c) => c.applicable && c.weight > 0);
  const totalWeight = applicable.reduce((s, c) => s + c.weight, 0);
  const score = totalWeight > 0 ? Math.round((100 * applicable.reduce((s, c) => s + c.weight * c.value, 0)) / totalWeight) : 0;
  const isMatch = failed.length === 0;
  const dealClass = classifyScore(score, settings.thresholds);

  const explanation = buildExplanation({ isMatch, failed, satisfied, p, history, changeVsPreviousPct, isHistoricalLow });

  return {
    isMatch,
    failedReasons: failed,
    satisfied,
    score,
    dealClass,
    breakdown: components,
    explanation,
    targetReached,
    changeVsPreviousPct,
    isHistoricalLow,
  };
}

function buildExplanation(a: {
  isMatch: boolean;
  failed: string[];
  satisfied: string[];
  p: MatchableProduct;
  history: PriceHistoryFacts;
  changeVsPreviousPct: number | null;
  isHistoricalLow: boolean;
}): string {
  if (!a.isMatch) return `Ne correspond pas à vos critères : ${joinFr(a.failed)}.`;
  const parts: string[] = [];
  const facts = [...new Set(a.satisfied)].slice(0, 6);
  parts.push(facts.length ? `Cette offre correspond à vos critères : ${joinFr(facts)}.` : "Cette offre correspond à vos critères.");

  if (a.history.observationCount >= 2 && a.changeVsPreviousPct !== null && a.history.previousPriceCents !== null) {
    if (a.changeVsPreviousPct < 0) {
      parts.push(`Son prix est inférieur de ${Math.abs(a.changeVsPreviousPct)} % à celui observé lors de la précédente collecte (${formatMad(a.history.previousPriceCents)}).`);
    } else if (a.changeVsPreviousPct > 0) {
      parts.push(`Son prix a augmenté de ${a.changeVsPreviousPct} % depuis la précédente collecte.`);
    } else {
      parts.push("Prix inchangé depuis la précédente collecte.");
    }
    if (a.isHistoricalLow && a.history.firstSeenAt) {
      parts.push(`C'est le prix le plus bas observé depuis le début du suivi (${formatMoroccoTime(a.history.firstSeenAt)}).`);
    }
  } else {
    parts.push("Premier relevé : pas encore d'historique de prix pour ce produit.");
  }

  if (a.p.advertisedDiscountPct !== null) {
    parts.push(
      `Remise annoncée par Marjane Mall : -${a.p.advertisedDiscountPct} %${a.p.originalPriceCents ? ` (prix barré ${formatMad(a.p.originalPriceCents)})` : ""}.`,
    );
  }
  if (a.p.stock === "out_of_stock") parts.push("Attention : produit actuellement en rupture de stock.");
  return parts.join(" ");
}
