import { getAppSettings, getDb, getUserProfile, requireUserShop, MARJANE_SHOP_ID } from "@mdw/database";
import { evaluate } from "@mdw/scoring";
import { configureProxyFromEnv, MarjaneAdapter } from "@mdw/scraper";
import { anyPhraseMatches, criterionInputSchema, extractSpecs, normalizeRef, withProfileConstraints, type MatchableProduct, type PriceHistoryFacts } from "@mdw/shared";
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
  if (parsed.data.shopId !== MARJANE_SHOP_ID) return Response.json({ message: "Le test de cette boutique sera disponible avec son collecteur." }, { status: 409 });
  if (running) return Response.json({ message: "Un test est déjà en cours. Réessayez dans un instant." }, { status: 429 });
  running = true;

  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) => {
        if (!cancelled && !request.signal.aborted) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      let adapter: MarjaneAdapter | undefined;
      let checked = 0;
      let found = 0;
      let rejected = 0;
      let errors = 0;
      try {
        const settings = await getAppSettings(getDb());
        const criterion = withProfileConstraints({ id: "preview", ...parsed.data }, await getUserProfile(getDb(), user.id));
        const paths = (criterion.filters.categoryPaths.length ? criterion.filters.categoryPaths : settings.dealPagePaths).slice(0, 2);
        if (!paths.length) throw new Error("Choisissez au moins un rayon à parcourir.");
        configureProxyFromEnv();
        adapter = new MarjaneAdapter({
          userAgent: process.env.SCRAPER_USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          minDelayMs: settings.requestDelayMs,
          timeoutMs: 25_000,
          maxRetries: 1,
          respectRobots: true,
          renderMode: "auto",
          renderTimeoutMs: 40_000,
          renderChannel: "auto",
        });
        send({ type: "start", paths, limit: 16 });
        const seen = new Set<string>();
        for (const path of paths) {
          if (cancelled || request.signal.aborted || checked >= 16) break;
          send({ type: "path", path });
          try {
            const listing = await adapter.discover(path, 1);
            send({ type: "listing", path, count: listing.items.length });
            let checkedInPath = 0;
            for (const item of listing.items) {
              if (cancelled || request.signal.aborted || checked >= 16 || checkedInPath >= 8) break;
              if (seen.has(item.url)) continue;
              seen.add(item.url);
              // A title can disqualify a card; the detail page alone can confirm a match.
              if (criterion.filters.keywords.length || criterion.filters.altKeywords.length) {
                const terms = [...criterion.filters.keywords, ...criterion.filters.altKeywords];
                if (!anyPhraseMatches(`${item.brand ?? ""} ${item.title}`, terms) &&
                    !(criterion.filters.modelRef && normalizeRef(item.title).includes(normalizeRef(criterion.filters.modelRef)))) continue;
              }
              checked++;
              checkedInPath++;
              try {
                const result = await adapter.fetchProduct(item.url);
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
