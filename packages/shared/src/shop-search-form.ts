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

export const SHOP_SEARCH_FORMS: Record<string, ShopSearchFormConfig> = {
  "marjane-mall": MARJANE_SEARCH_FORM,
  "urban-jungle-ma": URBAN_JUNGLE_SEARCH_FORM,
};

export function shopSearchForm(shopId: string): ShopSearchFormConfig | null {
  return SHOP_SEARCH_FORMS[shopId] ?? null;
}
