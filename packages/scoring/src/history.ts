import type { PriceHistoryFacts } from "@mdw/shared";

export interface Observation {
  priceCents: number;
  observedAt: Date;
}

/**
 * Computes history facts from stored observations (oldest first). The last
 * element is the current observation. Nothing is inferred about prices before
 * monitoring started.
 */
export function historyFacts(observations: Observation[]): PriceHistoryFacts {
  const sorted = [...observations].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  const n = sorted.length;
  if (n === 0) {
    return { observationCount: 0, previousPriceCents: null, minPriceCents: null, previousMinPriceCents: null, firstSeenAt: null };
  }
  const before = sorted.slice(0, -1);
  return {
    observationCount: n,
    previousPriceCents: before.length ? before[before.length - 1]!.priceCents : null,
    minPriceCents: Math.min(...sorted.map((o) => o.priceCents)),
    previousMinPriceCents: before.length ? Math.min(...before.map((o) => o.priceCents)) : null,
    firstSeenAt: sorted[0]!.observedAt,
  };
}

/** Summary used by the product page: min / max / average and change since first. */
export function priceStats(observations: Observation[]) {
  if (observations.length === 0) return null;
  const prices = observations.map((o) => o.priceCents);
  const sorted = [...observations].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  return {
    count: observations.length,
    minCents: Math.min(...prices),
    maxCents: Math.max(...prices),
    avgCents: Math.round(prices.reduce((s, p) => s + p, 0) / prices.length),
    firstCents: first.priceCents,
    lastCents: last.priceCents,
    changeSinceFirstPct: first.priceCents > 0 ? Math.round(((last.priceCents - first.priceCents) / first.priceCents) * 1000) / 10 : 0,
    since: first.observedAt,
  };
}
