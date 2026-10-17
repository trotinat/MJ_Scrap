import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { CATEGORY_TREE } from "../packages/shared/src/site.ts";

const source = "https://www.marjanemall.ma/sitemaps/sitemap_category.xml";
const roots = new Set(CATEGORY_TREE.map(({ path }) => path.slice(1)));
const response = await fetch(source, { headers: { "User-Agent": "BON category audit (personal use)" } });
if (!response.ok) throw new Error(`Category sitemap: HTTP ${response.status}`);
const xml = await response.text();
const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map(([, href]) => {
    const url = new URL(href);
    return url.hostname === "www.marjanemall.ma" && roots.has(url.pathname.split("/")[1]) ? url.pathname.replace(/\/$/, "") : null;
  })
  .filter((path) => path && /^\/[a-z0-9/-]+$/.test(path));
const unique = [...new Set(paths)].sort();
if (unique.length < 450) throw new Error(`Unexpectedly small category sitemap: ${unique.length} paths`);
const output = { source, checkedAt: new Date().toISOString(), paths: unique };
const target = fileURLToPath(new URL("../packages/shared/src/category-catalog.generated.json", import.meta.url));
await writeFile(target, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Saved ${unique.length} category paths from ${source}`);
