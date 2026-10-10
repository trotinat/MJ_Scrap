import { RECOMMENDED_CRITERIA } from "@mdw/shared";
// Observed data and criterion for the Adidas filtered-listing test (also used by the preview).
/**
 * Cards seen on 9 Oct 2026 (16:10 UTC) at the URL below, read through a
 * text-only page reader. The server HTML ignored the URL filters (it listed
 * a children's backpack, socks and women's shoes), which is exactly why the
 * criterion's own mandatory filters must still reject them.
 */
export const ADIDAS_URL =
  "https://www.marjanemall.ma/boutique-officielle/adidas?maas_46800=42&m_shipping_express=1&maas_28003=Homme&sortBy=magento2_prod_fr_products_price_default_asc";

export const OBSERVED: [string, number, number, number][] = [
  ["ADIDAS - Sac à dos Pour Enfants 11,5 L - LK BP 3BAR - Unisexe - Noir", 199, 270, 26],
  ["Adidas SOQUETTES SPORTSWEAR THIN&LIGHT (3 PAIRES) - Blanc", 99, 140, 29],
  ["ADIDAS Claquette ADILETTE AQUA pour hommes - FTWWHT/CBLACK/FTWWHT", 229, 309, 26],
  ["Adidas-SHOES-RESPONSE PACE M ASHGRE/SILVMT/LUOR", 509, 719, 29],
  ["BBALL CAP CLIMA WHITE/BLACK/BLACK", 179, 250, 28],
  ["ADIDAS VL COURT BASE - Chaussures pour hommes", 499, 710, 30],
  ["Adidas-SHOES-RESPONSE PACE W PUTMAU/CLOWHI/ACIRED", 499, 719, 31],
  ["Adidas-SHOES-GALAXY 8 M CBLACK/BOGOLD/CARBON", 449, 639, 30],
  ["Adidas-SHOES-GALAXY 8 W DISPIN/STTRBL/CLPINK", 449, 639, 30],
  ["Adidas-SHOES-DURAMO RC2 M MUTPRP/FLAAQU/LURABL", 389, 599, 35],
  // Seen on 10 Oct 2026 and wrongly matched by the first version of the criterion.
  ["Baskets Adidas Runfalcon 5 EL I pour Fille - Vert", 299, 399, 25],
];

/** The same criterion is shipped as the first recommended preset. */
export const ADIDAS_CRITERION_INPUT = RECOMMENDED_CRITERIA[0]!;
