import { getAppSettings, getDb, getUserProfile, requireUserShop, MARJANE_SHOP_ID } from "@mdw/database";
import { evaluate } from "@mdw/scoring";
import { configureProxyFromEnv, createCityFashionAdapter, CITY_FASHION_DEAL_PATHS, CITY_FASHION_SHOP_ID, createKiteaAdapter, createUrbanJungleAdapter, KITEA_DEAL_PATHS, KITEA_SHOP_ID, MarjaneAdapter, URBAN_JUNGLE, type SiteAdapter } from "@mdw/scraper";
import { anyPhraseMatches, criterionInputSchema, extractSpecs, fitsUrbanJungleProfile, normalizeRef, OUT_OF_PROFILE_REASON, withProfileConstraints, type MatchableProduct, type PriceHistoryFacts } from "@mdw/shared";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noHistory: PriceHistoryFacts = {
  observationCount: 0, previousPriceCents: null, minPriceCents: null,
  previousMinPriceCents: null, firstSeenAt: null,
};
let running = false;

export async function POST(request: Request) {
  const user = await requireUser();
  const raw = await request.text();
  if (raw.length > 64_000) return Response.json({ message: "Recherche trop longue." }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return Response.json({ message: "Recherche invalide." }, { status: 400 }); }
  const parsed = criterionInputSchema.safeParse(body);
  if (!parsed.success) return Response.json({ message: parsed.error.issues[0]?.message ?? "Recherche invalide." }, { status: 400 });
  try { await requireUserShop(getDb(), user.id, parsed.data.shopId); }
  catch { return Response.json({ message: "Boutique indisponible pour ce compte." }, { status: 403 }); }
  const urbanJungle = parsed.data.shopId === URBAN_JUNGLE.shopId;
  const kitea = parsed.data.shopId === KITEA_SHOP_ID || parsed.data.shopId === "kitea";
  const cityFashion = parsed.data.shopId === CITY_FASHION_SHOP_ID;
  if (parsed.data.shopId !== MARJANE_SHOP_ID && !urbanJungle && !kitea && !cityFashion) return Response.json({ message: "Le test de cette boutique sera disponible avec son collecteur." }, { status: 409 });
  if (running) return Response.json({ message: "Un test est déjà en cours. Réessayez dans un instant." }, { status: 429 });
  running = true;

  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) => {
        if (!cancelled && !request.signal.aborted) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      let adapter: SiteAdapter | undefined;
      let checked = 0;
      let found = 0;
      let rejected = 0;
      let errors = 0;
      try {
        const settings = await getAppSettings(getDb());
        const profile = await getUserProfile(getDb(), user.id);
        const criterion = withProfileConstraints({ id: "preview", ...parsed.data }, profile);
        const defaultPaths = urbanJungle ? URBAN_JUNGLE.dealPagePaths : kitea ? KITEA_DEAL_PATHS : cityFashion ? CITY_FASHION_DEAL_PATHS : settings.dealPagePaths;
        const paths = (criterion.filters.categoryPaths.length ? criterion.filters.categoryPaths : defaultPaths).slice(0, 2);
        if (!paths.length) throw new Error("Choisissez au moins un rayon à parcourir.");
        configureProxyFromEnv();
        const http = {
          userAgent: process.env.SCRAPER_USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          minDelayMs: kitea ? Math.max(settings.requestDelayMs, 10_000) : cityFashion ? Math.max(settings.requestDelayMs, 5_000) : settings.requestDelayMs,
          timeoutMs: 25_000,
          maxRetries: 1,
          respectRobots: true,
        };
        if (kitea) http.userAgent = "HawtaPriceMonitor/1.0 (+https://github.com/trotinat/MJ_Scrap)";
        if (cityFashion) http.userAgent = "HawtaPriceMonitor/1.0 (+https://github.com/trotinat/MJ_Scrap)";
        adapter = urbanJungle ? createUrbanJungleAdapter(http) : kitea ? createKiteaAdapter(http) : cityFashion ? createCityFashionAdapter(http) : new MarjaneAdapter({
          ...http,
          renderMode: "auto",
          renderTimeoutMs: 40_000,
          renderChannel: "auto",
        });
        send({ type: "start", paths, limit: kitea || cityFashion ? 4 : 16 });
        const seen = new Set<string>();
        for (const path of paths) {
          if (cancelled || request.signal.aborted || checked >= 16) break;
          send({ type: "path", path });
          try {
            const listing = await adapter.discover(path, 1);
            send({ type: "listing", path, count: listing.items.length });
            let checkedInPath = 0;
            for (const item of listing.items) {
              if (cancelled || request.signal.aborted || checked >= (kitea || cityFashion ? 4 : 16) || checkedInPath >= (urbanJungle ? 16 : kitea || cityFashion ? 4 : 8)) break;
              if (seen.has(item.url)) continue;
              seen.add(item.url);
              // A title can disqualify a card before price/detail work.
              if (criterion.filters.keywords.length || criterion.filters.altKeywords.length) {
                const terms = [...criterion.filters.keywords, ...criterion.filters.altKeywords];
                if (!anyPhraseMatches(`${item.brand ?? ""} ${item.title}`, terms) &&
                    !(criterion.filters.modelRef && normalizeRef(item.title).includes(normalizeRef(criterion.filters.modelRef)))) continue;
              }
              checked++;
              checkedInPath++;
              try {
                // These listing cards include the fields needed for a preview; details are fetched during collection.
                const result = (urbanJungle || kitea || cityFashion) && item.priceCents !== null
                  ? { kind: "ok" as const, detail: { ...item, brand: item.brand ?? null, priceCents: item.priceCents, modelRef: null, stock: item.stock ?? "unknown" as const, rawSpecs: item.rawSpecs ?? {} } }
                  : await adapter.fetchProduct(item.url);
                if (result.kind === "error") { errors++; send({ type: "progress", checked, found, errors }); continue; }
                if (result.kind !== "ok") { send({ type: "progress", checked, found, errors }); continue; }
                const d = result.detail;
                const product: MatchableProduct = {
                  title: d.title, brand: d.brand, modelRef: d.modelRef,
                  categoryPath: null, listingPaths: [path], priceCents: d.priceCents,
                  originalPriceCents: d.originalPriceCents, advertisedDiscountPct: d.advertisedDiscountPct,
                  seller: d.seller, stock: d.stock, rating: d.rating, reviewCount: d.reviewCount,
                  rawSpecs: d.rawSpecs, specs: extractSpecs(d.title, d.rawSpecs),
                };
                const verdict = evaluate(criterion, product, noHistory, settings);
                if (verdict.isMatch && urbanJungle && !fitsUrbanJungleProfile({ title: d.title, brand: d.brand, rawSpecs: d.rawSpecs }, profile)) {
                  verdict.isMatch = false;
                  verdict.failedReasons = [OUT_OF_PROFILE_REASON];
                }
                if (verdict.isMatch) {
                  found++;
                  send({ type: "match", item: {
                    url: d.url, title: d.title, imageUrl: d.imageUrl,
                    priceCents: d.priceCents, originalPriceCents: d.originalPriceCents,
                    advertisedDiscountPct: d.advertisedDiscountPct, seller: d.seller,
                    score: verdict.score, dealClass: verdict.dealClass,
                  } });
                } else {
                  rejected++;
                  send({ type: "reject", title: d.title, reasons: verdict.failedReasons.slice(0, 2) });
                }
              } catch { errors++; }
              send({ type: "progress", checked, found, errors });
            }
          } catch (error) {
            errors++;
            send({ type: "warning", message: `Rayon indisponible : ${path}. ${error instanceof Error ? error.message : "Erreur de collecte."}` });
          }
        }
        send({ type: "done", checked, found, rejected, errors });
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : "Le test a échoué." });
      } finally {
        await adapter?.close().catch(() => undefined);
        running = false;
        if (!cancelled) controller.close();
      }
    },
    cancel() { cancelled = true; },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
