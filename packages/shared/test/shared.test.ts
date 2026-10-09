import { describe, expect, it } from "vitest";
import {
  classifyScore,
  cleanList,
  criterionInputSchema,
  DEFAULT_SETTINGS,
  EXAMPLE_CRITERIA,
  extractSpecs,
  formatMad,
  formatMoroccoTime,
  nextScheduledRuns,
  normalizeText,
  parseAmount,
  phraseMatches,
  previousScheduledRun,
  scheduleTimesToPatterns,
  sitePathSchema,
} from "../src";

describe("parseAmount / MAD normalisation", () => {
  it.each([
    ["4149", 4149],
    ["4 149,00", 4149],
    ["4 149,00", 4149],
    ["6500.00", 6500],
    ["1.299,50", 1299.5],
    ["1,299.50", 1299.5],
    ["1 299", 1299],
    ["51,95", 51.95],
    ["299 DH", 299],
    ["12.345", 12345],
  ])("%s -> %s", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it("rejects garbage", () => {
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("12,3456")).toBeNull();
  });

  it("formats MAD in French", () => {
    expect(formatMad(414900)).toBe("4 149,00 MAD");
    expect(formatMad(null)).toBe("—");
  });
});

describe("text matching", () => {
  it("normalizes accents and punctuation", () => {
    expect(normalizeText('Téléviseur QLED 55"')).toBe("televiseur qled 55");
  });
  it("matches phrases by word prefix", () => {
    expect(phraseMatches("Téléviseurs Samsung 4K", "téléviseur")).toBe(true);
    expect(phraseMatches("Smart TV 55 pouces", "smart tv")).toBe(true);
    expect(phraseMatches("Smartphone Xiaomi", "TV")).toBe(false);
    expect(phraseMatches("anything", "")).toBe(false);
  });
  it("cleans lists", () => {
    expect(cleanList([" TCL", "tcl", "", "LG "])).toEqual(["TCL", "LG"]);
  });
});

describe("spec extraction", () => {
  it("extracts TV facets from title and specs", () => {
    const s = extractSpecs("Téléviseur Samsung QLED 55 pouces – Modèle QA55Q6FAAUXMV", {
      "Résolution d'affichage": "3840 x 2160 pixels - (Ultra HD 4K)",
      "Classe de diagonale": '55"',
      "Nombre de ports HDMI": "3",
      "Type de téléviseur": "Smart TV",
    });
    expect(s).toMatchObject({ screen_size_in: 55, resolution: "4K", panel: "QLED", hdmi_ports: 3, smart_tv: true });
  });
  it("extracts laptop RAM / storage", () => {
    const s = extractSpecs('PC Portable Lenovo 14" Ryzen 7 16 Go RAM 512 Go SSD');
    expect(s).toMatchObject({ ram_gb: 16, storage_gb: 512, storage_type: "SSD", screen_size_in: 14 });
    expect(extractSpecs("Laptop HP 8GB DDR4 1 To HDD").storage_gb).toBe(1024);
  });
  it("does not confuse HDR/HDMI with HD", () => {
    expect(extractSpecs("Barre de son HDMI compatible HDR").resolution).toBeUndefined();
  });
  it("leaves unknown facets undefined", () => {
    expect(extractSpecs("Support téléphone voiture magnétique")).toEqual({});
  });
});

describe("criterion schema", () => {
  it("accepts the example criteria", () => {
    for (const c of EXAMPLE_CRITERIA) expect(criterionInputSchema.safeParse(c).success).toBe(true);
  });
  it("rejects inconsistent prices", () => {
    const r = criterionInputSchema.safeParse({ name: "x", filters: { keywords: ["tv"], minPrice: 5000, maxPrice: 4000 } });
    expect(r.success).toBe(false);
  });
  it("requires at least a keyword, a reference or a category", () => {
    expect(criterionInputSchema.safeParse({ name: "x", filters: {} }).success).toBe(false);
  });
  it("validates site paths (no SSRF via category paths)", () => {
    expect(sitePathSchema.parse("https://www.marjanemall.ma/tv-son-photo")).toBe("/tv-son-photo");
    expect(sitePathSchema.safeParse("https://evil.example/x").success).toBe(false);
    expect(sitePathSchema.safeParse("/../etc/passwd").success).toBe(false);
    expect(sitePathSchema.safeParse("//evil.example").success).toBe(false);
  });
});

describe("settings", () => {
  it("classifies scores with configurable thresholds", () => {
    expect(classifyScore(90, DEFAULT_SETTINGS.thresholds)).toBe("exceptional");
    expect(classifyScore(70, DEFAULT_SETTINGS.thresholds)).toBe("very_good");
    expect(classifyScore(55, DEFAULT_SETTINGS.thresholds)).toBe("interesting");
    expect(classifyScore(10, DEFAULT_SETTINGS.thresholds)).toBe("ordinary");
    expect(classifyScore(80, { exceptional: 80, veryGood: 60, interesting: 40 })).toBe("exceptional");
  });
});

describe("scheduler — Africa/Casablanca", () => {
  it("builds one croner pattern for 09:00 and 18:00", () => {
    expect(scheduleTimesToPatterns("09:00,18:00")).toEqual(["0 9,18 * * *"]);
    expect(scheduleTimesToPatterns("09:30,18:00")).toEqual(["30 9 * * *", "0 18 * * *"]);
    expect(() => scheduleTimesToPatterns("25:00")).toThrow();
  });

  it("runs at 09:00 and 18:00 local time during standard time (UTC+1)", () => {
    // 1 October 2026 — Morocco is on UTC+1.
    const runs = nextScheduledRuns("09:00,18:00", 2, new Date("2026-10-01T00:00:00Z"));
    expect(runs.map((d) => d.toISOString())).toEqual(["2026-10-01T08:00:00.000Z", "2026-10-01T17:00:00.000Z"]);
  });

  it("follows the Ramadan time change (UTC+0) from the tz database", () => {
    // Ramadan 2026: Morocco switches to UTC+0 (approx. 15 Feb – 22 Mar 2026).
    const runs = nextScheduledRuns("09:00,18:00", 2, new Date("2026-03-01T00:00:00Z"));
    expect(runs.map((d) => d.toISOString())).toEqual(["2026-03-01T09:00:00.000Z", "2026-03-01T18:00:00.000Z"]);
    expect(formatMoroccoTime(runs[0]!)).toMatch(/09:00/);
  });

  it("finds the previous scheduled slot for catch-up", () => {
    const prev = previousScheduledRun("09:00,18:00", new Date("2026-10-01T12:00:00Z"));
    expect(prev?.toISOString()).toBe("2026-10-01T08:00:00.000Z");
  });
});
