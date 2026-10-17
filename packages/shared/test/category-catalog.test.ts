import { describe, expect, it } from "vitest";
import snapshot from "../src/category-catalog.generated.json";
import { CATEGORY_CATALOG } from "../src/category-catalog";

describe("Marjane category catalog", () => {
  it("keeps every official category reachable at its full depth", () => {
    const all = new Map<string, { selectable: boolean; depth: number }>();
    const visit = (nodes: typeof CATEGORY_CATALOG, depth: number) => {
      for (const node of nodes) {
        expect(all.has(node.path)).toBe(false);
        all.set(node.path, { selectable: node.selectable, depth });
        visit(node.children, depth + 1);
      }
    };
    visit(CATEGORY_CATALOG, 1);
    for (const path of snapshot.paths) expect(all.get(path)?.selectable, path).toBe(true);
    expect(all.get("/auto-moto/electronique/audio-de-voiture")?.depth).toBe(3);
    expect(all.get("/epicerie-fine")?.selectable).toBe(true);
  });
});
