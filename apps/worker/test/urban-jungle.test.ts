import { describe, expect, it } from "vitest";
import type { Evaluation } from "@mdw/scoring";
import { EMPTY_PROFILE } from "@mdw/shared";
import { urbanJungleVerdict } from "../src/urban-jungle";

const match = { isMatch: true, failedReasons: [], explanation: "Cette offre correspond à vos critères. Remise annoncée par Marjane Mall : -30 %." } as unknown as Evaluation;
const man = { ...EMPTY_PROFILE, genders: ["Homme"] };

describe("Urban Jungle verdict", () => {
  it("names Urban Jungle as the store announcing the discount", () => {
    const ev = urbanJungleVerdict(match, { title: "T-Shirt Jordan Rare Air", brand: "Jordan", rawSpecs: { Genre: "Homme, Femme" } }, man);
    expect(ev.isMatch).toBe(true);
    expect(ev.explanation).toContain("Remise annoncée par Urban Jungle : -30 %");
  });

  it("turns a match outside the owner's profile into a rejection", () => {
    const ev = urbanJungleVerdict(match, { title: "Short Jordan pour femme", brand: "Jordan", rawSpecs: { Genre: "Femme" } }, man);
    expect(ev).toMatchObject({ isMatch: false, failedReasons: ["hors de votre profil (genre, âge ou taille)"] });
  });
});
