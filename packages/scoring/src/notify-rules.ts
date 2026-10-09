import { madToCents, type Criterion } from "@mdw/shared";
import type { Evaluation } from "./evaluate";

export type DealEvent = "new_match" | "target_reached" | "price_drop" | "back_in_stock" | "exceptional";

/** Previous state of the (criterion, offer) pair, as stored in deal_matches. */
export interface PreviousMatchState {
  isMatch: boolean;
  score: number;
  dealClass: string;
  priceCents: number | null;
  lastNotifiedPriceCents: number | null;
  lastNotifiedAt: Date | null;
}

export interface OfferTransition {
  offerId: string;
  priceCents: number;
  previousPriceCents: number | null;
  previousStock: "in_stock" | "out_of_stock" | "unknown" | null;
  currentStock: "in_stock" | "out_of_stock" | "unknown";
  /** Identifier of the current observation; makes restock events unique. */
  observationKey: string;
}

export interface NotificationDecision {
  event: DealEvent;
  /** All events detected this run, most important first. */
  events: DealEvent[];
  dedupeKey: string;
  reasons: string[];
}

const PRIORITY: DealEvent[] = ["target_reached", "price_drop", "exceptional", "new_match", "back_in_stock"];

const MODE_ALLOWS: Record<Criterion["notifyMode"], (e: DealEvent, ev: Evaluation) => boolean> = {
  all: () => true,
  new_only: (e) => e === "new_match",
  price_drops: (e) => e === "price_drop" || e === "target_reached",
  exceptional_only: (_e, ev) => ev.dealClass === "exceptional",
};

/**
 * Decides whether a (criterion, offer) evaluation deserves a Telegram alert.
 * Alerts are driven by state transitions (new match, price crossing the
 * target, further drop since the last alert, restock), so an unchanged offer
 * never triggers again. Each decision carries a deterministic idempotency key.
 */
export function decideNotification(
  criterion: Criterion,
  evaluation: Evaluation,
  prev: PreviousMatchState | null,
  t: OfferTransition,
): NotificationDecision | null {
  if (!evaluation.isMatch) return null;
  const events: DealEvent[] = [];
  const reasons: string[] = [];
  const minDrop = criterion.minPriceDropPct / 100;
  const passesThreshold = evaluation.score >= criterion.notifyMinScore;
  const wasNotified = prev?.lastNotifiedAt != null;

  // New match: first time this offer satisfies the criterion with enough score.
  if (passesThreshold && (!prev || !prev.isMatch || (!wasNotified && prev.score < criterion.notifyMinScore))) {
    events.push("new_match");
    reasons.push("nouvelle offre correspondant au critère");
  }

  // Target reached: the price crossed the target from above (or first seen below it).
  const target = criterion.filters.targetPrice !== null ? madToCents(criterion.filters.targetPrice) : null;
  if (target !== null && t.priceCents <= target) {
    const prevAbove = prev?.priceCents == null || prev.priceCents > target || !prev.isMatch;
    if (prevAbove) {
      events.push("target_reached");
      reasons.push("prix cible atteint");
    }
  }

  // Price drop: vs last notified price (further drop) or vs previous observation.
  if (passesThreshold) {
    const ref = prev?.lastNotifiedPriceCents ?? null;
    const dropVsNotified = ref !== null && t.priceCents <= Math.round(ref * (1 - minDrop));
    const dropVsPrevious =
      t.previousPriceCents !== null && t.priceCents <= Math.round(t.previousPriceCents * (1 - minDrop)) && (ref === null || t.priceCents < ref);
    if (dropVsNotified || dropVsPrevious) {
      events.push("price_drop");
      reasons.push(dropVsNotified ? "nouvelle baisse depuis la dernière alerte" : "baisse de prix significative");
    }
  }

  // Exceptional: became exceptional (class change).
  if (evaluation.dealClass === "exceptional" && prev?.dealClass !== "exceptional" && prev?.isMatch) {
    events.push("exceptional");
    reasons.push("offre devenue exceptionnelle");
  }

  // Back in stock (only when stock is reliably observed on both sides).
  if (passesThreshold && t.previousStock === "out_of_stock" && t.currentStock === "in_stock") {
    events.push("back_in_stock");
    reasons.push("produit de nouveau en stock");
  }

  const allowed = events.filter((e) => MODE_ALLOWS[criterion.notifyMode](e, evaluation));
  if (allowed.length === 0) return null;
  allowed.sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b));
  const event = allowed[0]!;

  const base = `${criterion.id}:${t.offerId}`;
  const dedupeKey =
    event === "new_match"
      ? `new:${base}`
      : event === "target_reached"
        ? `target:${base}:${target}:${t.priceCents}`
        : event === "price_drop"
          ? `drop:${base}:${t.priceCents}`
          : event === "exceptional"
            ? `exc:${base}:${t.priceCents}`
            : `restock:${base}:${t.observationKey}`;

  return { event, events: allowed, dedupeKey, reasons };
}
