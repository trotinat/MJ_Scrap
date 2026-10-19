import { URBAN_JUNGLE_COLLECTIONS, URBAN_JUNGLE_SEARCH_FORM } from "@mdw/shared";
import type { FetcherOptions } from "../http";
import { ShopifyAdapter, type ShopifyShop } from "../shopify";

/** Urban Jungle Maroc (observed October 2026): Shopify storefront in MAD, Moroccan market. */
export const URBAN_JUNGLE: ShopifyShop = {
  shopId: "urban-jungle-ma",
  name: "Urban Jungle Maroc",
  origin: "https://ma.urbanjunglestore.com",
  hosts: ["ma.urbanjunglestore.com"],
  currency: "MAD",
  country: "MA",
  seller: "Urban Jungle",
  dealPagePaths: ["/collections/soldes"],
  collections: URBAN_JUNGLE_COLLECTIONS,
  searchFormConfig: URBAN_JUNGLE_SEARCH_FORM,
  brandAliases: { "NORTH FACE": "The North Face", "URBAN JUNGLE": "Urban Jungle", "HEY DUDE": "Hey Dude" },
};

export const createUrbanJungleAdapter = (opts: FetcherOptions) => new ShopifyAdapter(URBAN_JUNGLE, opts);
