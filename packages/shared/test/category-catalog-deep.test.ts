import { describe, expect, it } from "vitest";
import { extractCategoryPaths } from "../src/category-catalog";

const roots = ["electromenager", "vetements-chaussures-bijoux-accessoires", "sport"];

describe("extractCategoryPaths", () => {
  it("finds deep category paths from anchors and Next data", () => {
    const html = `
      <a href="/electromenager/cuisine-et-cuisson/airfryer/mini">Mini</a>
      <a href="/electromenager/cuisine-et-cuisson">Cuisson</a>
      {"url":"/sport/vetements-chaussures-de-sport/running/homme","label":"Running homme"}
    `;
    const paths = extractCategoryPaths(html, roots);
    expect(paths).toContain("/electromenager/cuisine-et-cuisson/airfryer/mini");
    expect(paths).toContain("/electromenager/cuisine-et-cuisson");
    expect(paths).toContain("/sport/vetements-chaussures-de-sport/running/homme");
  });

  it("rejects products, promos, brand stores, unknown roots and single-segment paths", () => {
    const html = `
      <a href="/p/some-product-aaa123">Product</a>
      <a href="/ventes-flash">Promo</a>
      <a href="/boutique-officielle/adidas">Brand</a>
      <a href="/electromenager">Department root only</a>
      <a href="/unknown-root/child">Unknown</a>
    `;
    expect(extractCategoryPaths(html, roots)).toEqual([]);
  });

  it("strips query/hash, trailing slash, and de-duplicates", () => {
    const html = `
      <a href="/sport/fitness-musculation/?sort=price#top">A</a>
      <a href="https://www.marjanemall.ma/sport/fitness-musculation">A again</a>
      <a href="https://other.example/sport/fitness-musculation/fake">External</a>
    `;
    expect(extractCategoryPaths(html, roots)).toEqual(["/sport/fitness-musculation"]);
  });
});
