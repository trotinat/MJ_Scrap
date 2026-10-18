import { describe, expect, it } from "vitest";
import { EMPTY_PROFILE, fitsUrbanJungleProfile } from "../src";

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
