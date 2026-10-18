import type { Evaluation } from "@mdw/scoring";
import { fitsUrbanJungleProfile, OUT_OF_PROFILE_REASON, type PromotionProfileInput, type ShopperProfile } from "@mdw/shared";

/** Urban Jungle verdicts name their own store and only match products that fit the search owner's profile. */
export function urbanJungleVerdict(ev: Evaluation, product: PromotionProfileInput, profile: ShopperProfile | undefined): Evaluation {
  const explanation = ev.explanation.replace("Remise annoncée par Marjane Mall", "Remise annoncée par Urban Jungle");
  if (ev.isMatch && profile && !fitsUrbanJungleProfile(product, profile)) {
    return { ...ev, explanation, isMatch: false, failedReasons: [...ev.failedReasons, OUT_OF_PROFILE_REASON] };
  }
  return { ...ev, explanation };
}
