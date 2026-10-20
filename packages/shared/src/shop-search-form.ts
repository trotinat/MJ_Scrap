import { URBAN_JUNGLE_COLLECTIONS } from "./urban-jungle";

export type ShopSearchFormConfig = {
  connectorLabel: string;
  intro: string;
  keywordPlaceholder: string;
  sizeHint: string;
  scope: { kind: "catalog" | "collections"; label: string; hint: string; choices?: { path: string; label: string }[] };
  fields: { audience: boolean; sizes: boolean; productType: boolean; exactModel: boolean; sellers: boolean; condition: boolean; specs: boolean; reviews: boolean };
};

/** Search controls exposed by each live connector; keep this in sync with its adapter capabilities. */
export const MARJANE_SEARCH_FORM: ShopSearchFormConfig = {
  connectorLabel: "Connecteur Marjane Mall",
  intro: "Recherche dans les rayons du catalogue Marjane, avec contrôle des fiches et des vendeurs.",
  keywordPlaceholder: "Ex. baskets homme, TV 4K, friteuse",
  sizeHint: "Taille ou pointure telle qu’affichée sur la fiche Marjane.",
  scope: { kind: "catalog", label: "Rayons Marjane Mall", hint: "Choisissez un ou plusieurs rayons. Sans sélection, la recherche couvre les pages de promotions configurées." },
  fields: { audience: true, sizes: true, productType: true, exactModel: true, sellers: true, condition: true, specs: true, reviews: true },
};

export const URBAN_JUNGLE_SEARCH_FORM: ShopSearchFormConfig = {
  connectorLabel: "Connecteur boutique Shopify",
  intro: "Recherche dans les collections Urban Jungle et les variantes réellement disponibles.",
  keywordPlaceholder: "Ex. Jordan, casquette, veste homme",
  sizeHint: "Taille disponible sur les variantes du produit (ex. 42, M, XL).",
  scope: { kind: "collections", label: "Collections Urban Jungle", hint: "Choisissez les collections à parcourir. Sans sélection, le connecteur part des soldes.", choices: URBAN_JUNGLE_COLLECTIONS },
  fields: { audience: true, sizes: true, productType: true, exactModel: false, sellers: false, condition: false, specs: false, reviews: false },
};

/** Public Kitea pages selected for the first shopper-facing search experience. */
export const KITEA_CATEGORY_SCOPES = [
  { path: "/", label: "À la une" },
  { path: "/destockagekitea.html", label: "Déstockage" },
  { path: "/les-petits-prix-de-la-semaine.html", label: "Petits prix" },
  { path: "/par-espaces/salon-et-sejour.html", label: "Salon & séjour" },
  { path: "/par-espaces/chambre-adulte.html", label: "Chambres" },
  { path: "/literie-bain", label: "Literie & bain" },
] as const;

export const KITEA_SEARCH_FORM: ShopSearchFormConfig = {
  connectorLabel: "Connecteur KITEA",
  intro: "Parcourez les promotions, le déstockage et les rayons maison de KITEA. Ajoutez des mots-clés pour cibler un meuble, une pièce ou une référence.",
  keywordPlaceholder: "Ex. canapé d’angle, lit 160x200, matelas",
  sizeHint: "",
  scope: {
    kind: "collections",
    label: "Pages et rayons KITEA",
    hint: "Choisissez une ou plusieurs pages. Les prix affichés sont relevés chez KITEA ; Hawta distingue les remises annoncées des baisses mesurées.",
    choices: [...KITEA_CATEGORY_SCOPES],
  },
  fields: { audience: false, sizes: false, productType: false, exactModel: false, sellers: false, condition: false, specs: false, reviews: false },
};

export const CITY_FASHION_CATEGORY_SCOPES = [
  { path: "/25-promotions", label: "Promotions" },
  { path: "/promotions", label: "Toutes les promotions" },
  { path: "/27-vetements-homme", label: "Vêtements homme" },
] as const;

export const CITY_FASHION_SEARCH_FORM: ShopSearchFormConfig = {
  connectorLabel: "Connecteur City Fashion",
  intro: "Parcourez les promotions et les rayons mode de City Fashion. Les prix, réductions annoncées et disponibilités proviennent des fiches publiques de la boutique.",
  keywordPlaceholder: "Ex. baskets homme, Pepe Jeans, pointure 42",
  sizeHint: "Taille ou pointure telle qu’affichée par City Fashion.",
  scope: { kind: "collections", label: "Pages et rayons City Fashion", hint: "Choisissez les pages à parcourir. La collecte respecte les règles publiques du site et s’arrête si l’accès est refusé.", choices: [...CITY_FASHION_CATEGORY_SCOPES] },
  fields: { audience: true, sizes: true, productType: true, exactModel: false, sellers: false, condition: false, specs: false, reviews: false },
};

export const SHOP_SEARCH_FORMS: Record<string, ShopSearchFormConfig> = {
  "marjane-mall": MARJANE_SEARCH_FORM,
  "urban-jungle-ma": URBAN_JUNGLE_SEARCH_FORM,
  "kitea-ma": KITEA_SEARCH_FORM,
  kitea: KITEA_SEARCH_FORM,
  "city-fashion-ma": CITY_FASHION_SEARCH_FORM,
};

export function shopSearchForm(shopId: string): ShopSearchFormConfig | null {
  return SHOP_SEARCH_FORMS[shopId] ?? null;
}
