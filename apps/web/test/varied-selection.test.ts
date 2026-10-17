import { describe, expect, it } from "vitest";
import { pickVaried } from "../src/lib/varied-selection";

const get = { id: (x: { id: string }) => x.id, group: (x: { group: string }) => x.group, brand: (x: { brand: string | null }) => x.brand };

describe("homepage variety", () => {
  it("spreads high-ranked products across searches and brands", () => {
    const rows = [
      ...Array.from({ length: 8 }, (_, i) => ({ id: `shoe${i}`, group: "shoes", brand: "Adidas" })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: `top${i}`, group: "tops", brand: i ? "Puma" : "Adidas" })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: `cap${i}`, group: "caps", brand: null })),
    ];
    const picked = pickVaried(rows, 9, get);
    expect(picked).toHaveLength(9);
    expect(new Set(picked.map((x) => x.group)).size).toBe(3);
    expect(picked.filter((x) => x.brand === "Adidas")).toHaveLength(3);
    expect(new Set(picked.map((x) => x.id)).size).toBe(9);
  });

  it("fills the feed when only one group exists", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: String(i), group: "caps", brand: null }));
    expect(pickVaried(rows, 4, get).map((x) => x.id)).toEqual(["0", "1", "2", "3"]);
  });
});
