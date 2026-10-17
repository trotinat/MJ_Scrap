import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { CATEGORY_TREE } from "../packages/shared/src/site.ts";
import { extractCategoryPaths } from "../packages/shared/src/category-catalog.ts";

// Default: the official 3-level category sitemap. `--deep` additionally visits
// each category page and harvests sub-rayon links the sitemap omits (level 4+).
// Deep mode only ADDS paths; it never drops a sitemap path. Run it from a host
// that can reach marjanemall.ma (the cloud dev container is blocked):
//   pnpm catalog            (sitemap only)
//   pnpm catalog -- --deep  (sitemap + per-page discovery, slower)
const DEEP = process.argv.includes("--deep");
const UA = "BON category audit (personal use)";
const source = "https://www.marjanemall.ma/sitemaps/sitemap_category.xml";
const roots = new Set(CATEGORY_TREE.map(({ path }) => path.slice(1)));

const response = await fetch(source, { headers: { "User-Agent": UA } });
if (!response.ok) throw new Error(`Category sitemap: HTTP ${response.status}`);
const xml = await response.text();
const sitemap = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map(([, href]) => {
    const url = new URL(href);
    return url.hostname === "www.marjanemall.ma" && roots.has(url.pathname.split("/")[1]) ? url.pathname.replace(/\/$/, "") : null;
  })
  .filter((path) => path && /^\/[a-z0-9/-]+$/.test(path));
if (new Set(sitemap).size < 450) throw new Error(`Unexpectedly small category sitemap: ${new Set(sitemap).size} paths`);

const all = new Set(sitemap);
let discovered = 0;

if (DEEP) {
  // Visit every known category page; new paths found feed back into the queue
  // so level 4, 5… are reached. Gentle: small concurrency, a delay per request,
  // a visit cap, and failures are skipped (never abort the whole run).
  const delayMs = 400;
  const concurrency = 4;
  const maxVisits = 2000;
  const queue = [...all];
  const visited = new Set();
  let visits = 0;

  const fetchPage = async (path) => {
    try {
      const res = await fetch(`https://www.marjanemall.ma${path}`, { headers: { "User-Agent": UA }, redirect: "follow" });
      if (!res.ok) return;
      const found = extractCategoryPaths(await res.text(), roots);
      for (const p of found) {
        if (!all.has(p)) {
          all.add(p);
          discovered++;
          queue.push(p); // explore deeper levels of a newly found rayon
        }
      }
    } catch {
      // network/parse failure on one page: skip it, keep crawling
    }
  };

  while (queue.length > 0 && visits < maxVisits) {
    const batch = [];
    while (batch.length < concurrency && queue.length > 0 && visits < maxVisits) {
      const path = queue.shift();
      if (visited.has(path)) continue;
      visited.add(path);
      visits++;
      batch.push(path);
    }
    await Promise.all(batch.map(fetchPage));
    if (queue.length > 0) await new Promise((r) => setTimeout(r, delayMs));
    if (visits % 100 === 0) console.log(`  …${visits} pages visited, ${all.size} paths so far`);
  }
  console.log(`Deep crawl: visited ${visits} pages, discovered ${discovered} paths beyond the sitemap.`);
}

const unique = [...all].filter((path) => /^\/[a-z0-9/-]+$/.test(path)).sort();
const depth = unique.map((p) => p.split("/").filter(Boolean).length);
const output = { source, checkedAt: new Date().toISOString(), deep: DEEP, maxDepth: Math.max(...depth), paths: unique };
const target = fileURLToPath(new URL("../packages/shared/src/category-catalog.generated.json", import.meta.url));
let previous;
try {
  previous = JSON.parse(await readFile(target, "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
if (previous?.source === source && Array.isArray(previous.paths)) {
  const missing = previous.paths.filter((path) => !all.has(path));
  if (missing.length > 0 && !process.argv.includes("--allow-shrink")) {
    throw new Error(`Category update would remove ${missing.length} existing paths. Run a full --deep crawl or review the removals, then pass --allow-shrink explicitly.`);
  }
}
await writeFile(target, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Saved ${unique.length} category paths (max depth ${output.maxDepth}) from ${source}${DEEP ? " + deep crawl" : ""}`);
