import { describe, expect, it } from "vitest";
import { EMPTY_PROFILE, fitsUrbanJungleProfile, urbanJungleStyles, type HiddenStyle } from "../src";

const man = { ...EMPTY_PROFILE, genders: ["Homme"], shoeSizes: ["41", "42"], clothingSizes: ["M", "L"], pantsSizes: ["32"] };
const fits = (title: string, rawSpecs: Record<string, string>) => fitsUrbanJungleProfile({ title, brand: "Jordan", rawSpecs }, man);

describe("Urban Jungle shopper profile", () => {
  it("hides women's and children's products from a man", () => {
    expect(fits("Short Jordan Heritage Diamond Noir pour femme", { Genre: "Femme", "Tailles disponibles": "M" })).toBe(false);
    expect(fits("Air Jordan 1 Low Se Industrial Blue (Gs)", { Genre: "Garçon", Public: "Enfant", "Pointures disponibles": "38" })).toBe(false);
    expect(fits("T-Shirt Jordan Rare Air", { Genre: "Homme, Femme", "Tailles disponibles": "S, M" })).toBe(true);
  });

  it("requires one of the profile sizes to be in stock", () => {
    expect(fits("Air Jordan 1 Mid Se Industrial Blue", { "Type de produit": "Chaussures", Genre: "Homme", "Pointures disponibles": "44" })).toBe(false);
    expect(fits("Air Jordan 1 Mid Se Industrial Blue", { "Type de produit": "Chaussures", Genre: "Homme", "Pointures disponibles": "42, 44" })).toBe(true);
  });

  it("accepts letter sizes for joggers", () => {
    expect(fits("Pantalon de jogging Jordan Brooklyn", { Genre: "Homme", "Tailles disponibles": "S, M" })).toBe(true);
  });
});

describe("Urban Jungle « Pas mon style »", () => {
  const jersey = { url: "https://ma.urbanjunglestore.com/products/maillot-senegal?variant=1", title: "Maillot Sénégal d'avant-match 2025", brand: "Puma", rawSpecs: { Genre: "Homme", Collection: "AFCON", "Tailles disponibles": "M" } };
  const sneaker = { title: "Air Force 1 '07 Low Triple White", brand: "Nike", rawSpecs: { "Type de produit": "Chaussures", Genre: "Homme", "Pointures disponibles": "42" } };

  it("offers this product, its kind, its collections and its brand", () => {
    expect(urbanJungleStyles(jersey).map((s) => [s.kind, s.value, s.label])).toEqual([
      ["product", "https://ma.urbanjunglestore.com/products/maillot-senegal", "Maillot Sénégal d'avant-match 2025"],
      ["kind", "maillot", "Les maillots"],
      ["collection", "afcon", "La collection AFCON"],
      ["brand", "puma", "La marque Puma"],
    ]);
    expect(urbanJungleStyles(sneaker).map((s) => s.label)).toEqual(["Les baskets", "La ligne Air Force 1", "La marque Nike"]);
  });

  it("hides every product sharing a hidden style, and only at Urban Jungle", () => {
    const hide = (kind: HiddenStyle["kind"], value: string, shopId = "urban-jungle-ma") => ({ ...man, hiddenStyles: [{ shopId, kind, value, label: value }] });
    const other = { ...jersey, url: "https://ma.urbanjunglestore.com/products/maillot-ghana", title: "Maillot domicile Ghana 2025", rawSpecs: { Genre: "Homme", "Tailles disponibles": "M" } };
    expect(fitsUrbanJungleProfile(other, hide("kind", "maillot"))).toBe(false);
    expect(fitsUrbanJungleProfile(other, hide("collection", "afcon"))).toBe(true);
    expect(fitsUrbanJungleProfile(jersey, hide("collection", "afcon"))).toBe(false);
    expect(fitsUrbanJungleProfile(other, hide("product", "https://ma.urbanjunglestore.com/products/maillot-senegal"))).toBe(true);
    expect(fitsUrbanJungleProfile(sneaker, hide("brand", "nike"))).toBe(false);
    expect(fitsUrbanJungleProfile(sneaker, hide("brand", "nike", "marjane-mall"))).toBe(true);
  });
});
