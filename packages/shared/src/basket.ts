export interface BasketLine { id: string; priceCents: number; quantity: number; eligible: boolean; }
/** Eligibility must be observed; discount is a conditional estimate, never a rewritten unit price. */
export function estimateBasket(lines: BasketLine[], shippingCents: number | null = null) {
  let subtotalCents = 0, eligibleCents = 0;
  for (const l of lines) {
    if (!Number.isSafeInteger(l.priceCents) || l.priceCents <= 0 || !Number.isSafeInteger(l.quantity) || l.quantity < 0 || l.quantity > 99) throw new Error('Article invalide');
    const total = l.priceCents*l.quantity;
    subtotalCents += total;
    if (l.eligible) eligibleCents += total;
  }
  if (shippingCents !== null && (!Number.isSafeInteger(shippingCents) || shippingCents < 0)) throw new Error('Livraison invalide');
  const discountCents = eligibleCents >= 30000 ? Math.round(eligibleCents*0.1) : 0;
  return {subtotalCents,eligibleCents,discountCents,remainingCents:Math.max(0,30000-eligibleCents),merchandiseCents:subtotalCents-discountCents,totalCents:shippingCents === null ? null : subtotalCents-discountCents+shippingCents};
}
