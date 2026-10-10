import { describe, expect, it } from "vitest";
import { extractFlightData, parseEmbeddedProducts } from "../src/parse/embedded";

// Two product objects exactly as observed in the Adidas store page data on
// 10 Oct 2026 (abridged: listCategories trimmed), inside a CMS block.
const RSC = `5:["$","div",null,{"initialData":{"success":true,"data":{"product_slider_4":{"type":"product_slider","group":"group_2","data":{"title":"","items":[{"image":"https://cdnprd.marjanemall.ma/cn0picture0products0mm/b9389eb5-fdc8-4f07-8cb9-74ffcea9fec3.webp","tags_infos":"[]","m_shipping_express":true,"link":null,"title":null,"url_key":"adidas-sac-a-dos-pour-enfants-11-5-l-lk-bp-3bar-unisexe-noir-aaaoz94787","id":"955765","name":"ADIDAS - Sac à dos Pour Enfants 11,5 L - LK BP 3BAR - Unisexe - Noir ","sku":"AAAOZ94787","price":199,"oldPrice":270,"seller_name":"MARJANEMALL","media_gallery_entries":[{"img":"https://cdnprd.marjanemall.ma/cn0picture0products0mm/b9389eb5-fdc8-4f07-8cb9-74ffcea9fec3.webp"}],"abroad_delivery":false,"isNew":false,"type_id":"simple","m_shipping_location":"LOCAL","note":5,"is_in_vente_flash":false,"review_number":1,"brand_url":"","brand_name":"adidas","eco_discount":"Eco. de 26%","listCategories":[{"item_category":"Default Category"}]},{"image":"https://cdnprd.marjanemall.ma/cn0picture0products0mm/c207d3b7-5933-4c02-a580-d7eaf7a15678.webp","tags_infos":"[]","m_shipping_express":false,"link":null,"title":null,"url_key":"adidas-shoes-galaxy-8-m-cblack-bogold-carbon-aae9a32309080943675-0001-group","id":"6761622","name":"Adidas-SHOES-GALAXY 8 M          CBLACK/BOGOLD/CARBON","sku":"AAE9A32309080943675-0001_Group","price":449,"oldPrice":639,"seller_name":"MARJANEMALL","media_gallery_entries":[{"img":"https://cdnprd.marjanemall.ma/cn0picture0products0mm/c207d3b7-5933-4c02-a580-d7eaf7a15678.webp"}],"abroad_delivery":false,"isNew":false,"type_id":"configurable","note":0,"is_in_vente_flash":false,"review_number":0,"brand_name":"","listCategories":[]},{"image":"x","url_key":"adidas-sac-a-dos-pour-enfants-11-5-l-lk-bp-3bar-unisexe-noir-aaaoz94787","name":"duplicate","price":199}]}}}}}]
`;
// A flash item with decimals, as on /ventes-flash ("49,90 DH -71% 170 DH").
const FLASH = `7:{"items":[{"image":"https://cdnprd.marjanemall.ma/a.webp","url_key":"magnesium-marin-375mg-b6-b12-capsule-aaaxx12345","name":"Magnesium Marin 375mg + B6 + B12 capsule","sku":"AAAXX12345","price":49.9,"oldPrice":170,"seller_name":"HOLCARE LABORATOIRES","note":4.6,"review_number":5,"is_in_vente_flash":true}]}\n`;

/** Wraps flight data the way Next.js embeds it in HTML. */
function asHtml(flight: string): string {
  const chunks = [flight.slice(0, 700), flight.slice(700)];
  return `<!DOCTYPE html><html><body><div>…</div>${chunks
    .map((c) => `<script>self.__next_f.push([1,${JSON.stringify(c)}])</script>`)
    .join("")}</body></html>`;
}

describe("page data (Next.js flight) parser", () => {
  it("unescapes and joins the embedded chunks", () => {
    expect(extractFlightData(asHtml(RSC))).toBe(RSC);
    expect(extractFlightData(RSC)).toBe(RSC);
  });

  it("reads exact product values from an HTML page and from an RSC response", () => {
    for (const body of [asHtml(RSC), RSC]) {
      const items = parseEmbeddedProducts(body, "/boutique-officielle/adidas");
      expect(items).toHaveLength(2); // duplicate url ignored
      expect(items[0]).toMatchObject({
        sourceId: "aaaoz94787",
        url: "https://www.marjanemall.ma/p/adidas-sac-a-dos-pour-enfants-11-5-l-lk-bp-3bar-unisexe-noir-aaaoz94787",
        title: "ADIDAS - Sac à dos Pour Enfants 11,5 L - LK BP 3BAR - Unisexe - Noir",
        priceCents: 19900,
        originalPriceCents: 27000,
        advertisedDiscountPct: 26,
        seller: "MARJANEMALL",
        rating: 5,
        reviewCount: 1,
        brand: "adidas",
        expressDelivery: true,
        imageUrl: "https://cdnprd.marjanemall.ma/cn0picture0products0mm/b9389eb5-fdc8-4f07-8cb9-74ffcea9fec3.webp",
        listingPath: "/boutique-officielle/adidas",
      });
      expect(items[1]).toMatchObject({ title: "Adidas-SHOES-GALAXY 8 M CBLACK/BOGOLD/CARBON", priceCents: 44900, originalPriceCents: 63900, advertisedDiscountPct: 30, rating: null, brand: null });
    }
  });

  it("keeps decimal prices and the site's rounded discount", () => {
    const [m] = parseEmbeddedProducts(asHtml(FLASH), "/ventes-flash");
    expect(m).toMatchObject({ priceCents: 4990, originalPriceCents: 17000, advertisedDiscountPct: 71, rating: 4.6, reviewCount: 5 });
  });

  it("returns nothing (never invents) when the page has no product data", () => {
    expect(parseEmbeddedProducts("<html><body>Accès refusé</body></html>", "/x")).toEqual([]);
    expect(parseEmbeddedProducts(asHtml('1:{"url_key":"x-1","name":"Sans prix"}'), "/x")).toEqual([]);
  });
});
