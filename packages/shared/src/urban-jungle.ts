import type { ShopperProfile } from "./profile";
import { fitsPromotionProfile, type PromotionProfileInput } from "./promotion-profile";

export const URBAN_JUNGLE_SHOP_ID = "urban-jungle-ma";

/** Urban Jungle Maroc collections (observed October 2026), offered as search scopes. */
export const URBAN_JUNGLE_COLLECTIONS: { path: string; label: string }[] = [
  { path: "/collections/soldes", label: "Soldes" },
  { path: "/collections/soldes-pour-hommes", label: "Soldes Homme" },
  { path: "/collections/soldes-pour-femmes", label: "Soldes Femme" },
  { path: "/collections/chaussures-en-soldes", label: "Chaussures en soldes" },
  { path: "/collections/vetements-en-soldes", label: "Vêtements en soldes" },
  { path: "/collections/chaussures-hommes", label: "Chaussures Homme" },
  { path: "/collections/chaussures-femmes", label: "Chaussures Femme" },
  { path: "/collections/vetements", label: "Vêtements" },
  { path: "/collections/accessoires", label: "Accessoires" },
  { path: "/collections/nike", label: "Nike" },
  { path: "/collections/jordan", label: "Jordan" },
  { path: "/collections/adidas", label: "Adidas" },
  { path: "/collections/puma", label: "Puma" },
  { path: "/collections/the-north-face", label: "The North Face" },
  { path: "/collections/nouveautes", label: "Nouveautés" },
];

export const OUT_OF_PROFILE_REASON = "hors de votre profil (genre, âge ou taille)";

/** Urban Jungle is browsed through the shopper profile: gender, age and an available size must fit. */
export function fitsUrbanJungleProfile(item: PromotionProfileInput, profile: ShopperProfile): boolean {
  // Urban Jungle sizes joggers and shorts in letters (S–XL) as well as waist numbers.
  return fitsPromotionProfile(item, { ...profile, pantsSizes: [...profile.pantsSizes, ...profile.clothingSizes] });
}
