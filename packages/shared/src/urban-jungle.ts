import type { HiddenStyle, ShopperProfile } from "./profile";
import { fitsPromotionProfile, type PromotionProfileInput } from "./promotion-profile";
import { normalizeText, phraseMatches } from "./text";

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

/** Product kinds recognised in Urban Jungle titles; the first match wins, so specific words come first. */
const PRODUCT_KINDS: { value: string; label: string; words: string[] }[] = [
  { value: "maillot", label: "Les maillots", words: ["maillot", "jersey"] },
  { value: "sweat", label: "Les sweats et hoodies", words: ["sweat", "hoodie", "crewneck"] },
  { value: "veste", label: "Les vestes et manteaux", words: ["veste", "jacket", "coupe vent", "windbreaker", "doudoune", "parka", "manteau"] },
  { value: "survetement", label: "Les survêtements", words: ["survetement", "tracksuit"] },
  { value: "t-shirt", label: "Les t-shirts", words: ["t shirt", "tee shirt"] },
  { value: "polo", label: "Les polos", words: ["polo"] },
  { value: "chemise", label: "Les chemises", words: ["chemise"] },
  { value: "pantalon", label: "Les pantalons et joggings", words: ["pantalon", "jogging", "jogger", "cargo", "jean", "chino"] },
  { value: "short", label: "Les shorts", words: ["short", "bermuda"] },
  { value: "legging", label: "Les leggings et brassières", words: ["legging", "brassiere"] },
  { value: "casquette", label: "Les casquettes et chapeaux", words: ["casquette", "chapeau", "bob", "bonnet"] },
  { value: "chaussettes", label: "Les chaussettes", words: ["chaussette", "socquette"] },
  { value: "sac", label: "Les sacs", words: ["sac", "pochette", "sacoche"] },
  { value: "claquettes", label: "Les claquettes et sandales", words: ["claquette", "sandale", "mule", "slide"] },
  { value: "bottes", label: "Les bottes", words: ["botte", "boots"] },
];
const SNEAKERS = { value: "baskets", label: "Les baskets" };

/** Collections often named in titles without a store tag. */
const TITLE_COLLECTIONS = ["AFCON", "World Cup", "Coupe du Monde"];

/** Model lines recognised in titles, offered like the store's own collections. */
const MODEL_LINES = [
  "Air Force 1", "Air Max", "Dunk", "Jordan 1", "Jordan 4", "Spizike", "Blazer", "Cortez", "P-6000", "Field General", "V-S1", "Nocta", "Tech Fleece",
  "Samba", "Gazelle", "Campus", "Superstar", "Stan Smith", "Forum", "Spezial", "Yeezy", "Ultraboost", "Adizero",
  "Suede", "Speedcat", "Palermo", "LaMelo", "Chuck Taylor", "Chuck 70", "Run Star",
];

export interface UrbanJungleItem extends PromotionProfileInput {
  url?: string | null;
}

const styleOf = (kind: HiddenStyle["kind"], value: string, label: string): HiddenStyle => ({ shopId: URBAN_JUNGLE_SHOP_ID, kind, value, label });

/** The styles a shopper can hide from one Urban Jungle product, most specific first. */
export function urbanJungleStyles(item: UrbanJungleItem): HiddenStyle[] {
  const styles: HiddenStyle[] = [];
  const url = item.url?.split(/[?#]/)[0];
  if (url) styles.push(styleOf("product", url, item.title.slice(0, 160)));
  const kind = PRODUCT_KINDS.find((k) => k.words.some((w) => phraseMatches(item.title, w)))
    ?? (/chaussures/i.test(item.rawSpecs?.["Type de produit"] ?? "") ? SNEAKERS : undefined);
  if (kind) styles.push(styleOf("kind", kind.value, kind.label));
  const collections = [...(item.rawSpecs?.Collection ?? "").split(",").map((c) => c.trim()).filter(Boolean), ...TITLE_COLLECTIONS.filter((c) => phraseMatches(item.title, c))];
  for (const c of collections) styles.push(styleOf("collection", normalizeText(c), `La collection ${c}`));
  for (const line of MODEL_LINES.filter((l) => phraseMatches(item.title, l))) styles.push(styleOf("collection", normalizeText(line), `La ligne ${line}`));
  if (item.brand) styles.push(styleOf("brand", normalizeText(item.brand), `La marque ${item.brand}`));
  return styles.filter((s, i) => styles.findIndex((o) => o.kind === s.kind && o.value === s.value) === i);
}

export function isHiddenUrbanJungleStyle(item: UrbanJungleItem, hidden: HiddenStyle[]): boolean {
  const mine = hidden.filter((h) => h.shopId === URBAN_JUNGLE_SHOP_ID);
  return mine.length > 0 && urbanJungleStyles(item).some((s) => mine.some((h) => h.kind === s.kind && h.value === s.value));
}

/** Urban Jungle is browsed through the shopper profile: gender, age, an available size and no hidden style. */
export function fitsUrbanJungleProfile(item: UrbanJungleItem, profile: ShopperProfile): boolean {
  if (isHiddenUrbanJungleStyle(item, profile.hiddenStyles)) return false;
  // Urban Jungle sizes joggers and shorts in letters (S–XL) as well as waist numbers.
  return fitsPromotionProfile(item, { ...profile, pantsSizes: [...profile.pantsSizes, ...profile.clothingSizes] });
}
