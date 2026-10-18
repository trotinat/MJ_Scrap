import Link from "next/link";
import { PromotionScope } from "@/components/promotion-scope";
import { Zap } from "lucide-react";
import { getDb, getUserSettings } from "@mdw/database";
import { requireUser } from "@/lib/session";
import { profileHighlights } from "@mdw/shared";
import { CheckNowButton } from "@/components/check-now-button";
import { btn, cx, EmptyState, input, PageHeader } from "@/components/ui";
import { DealCard, dealGrid } from "@/components/deal-card";
import { DealResultsGrid } from "@/components/deal-results-grid";
import { flashOffers, flashPages, weeklyOffers, type FlashSort } from "@/lib/queries";
import { formatMoroccoTime, relativeTime } from "@/lib/format";

export const metadata = { title: "Offres" };

const WEEK = "semaine";

const PAGE_LABELS: Record<string, string> = {
  "/panier-malin": "Panier Malin",
  "/trouvailles-marjane-mall": "Trouvailles",
  [WEEK]: "Cette semaine",
  "/ventes-flash": "Ventes flash",
  "/destockage": "Déstockage",
  "/les-deals-de-l-automne": "Deals de l'automne",
  "/tout-a-moins-de-200-dh": "Moins de 200 DH",
};
const label = (p: string) => PAGE_LABELS[p] ?? p;
const SORTS: { value: FlashSort; label: string }[] = [
  { value: "discount", label: "Plus forte remise annoncée" },
  { value: "price", label: "Prix le plus bas" },
  { value: "drop", label: "Plus forte baisse observée" },
  { value: "new", label: "Nouveautés sur la page" },
];

export default async function VentesFlashPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [crawled, settings] = await Promise.all([flashPages(), getUserSettings(getDb(), user.id)]);
  // Configured promotion pages first, then any other crawled page (e.g. one used by a criterion).
  const tabs = [WEEK, ...new Set([...settings.dealPagePaths, ...crawled.filter((c) => PAGE_LABELS[c.path] || (+c.last_success_at>Date.now()-86400_000 && /^\/(panier-malin|trouvailles-marjane-mall|les-deals-|tout-a-moins-de-)/.test(c.path))).map((c) => c.path)])];
  const current = sp.page && tabs.includes(sp.page) ? sp.page : WEEK;
  const sort = (SORTS.some((s) => s.value === sp.sort) ? sp.sort : "discount") as FlashSort;
  const scope = sp.scope === "all" ? "all" : "profile";
  const isWeek = current === WEEK;
  const crawl = isWeek ? (crawled.length ? crawled.reduce((a, b) => (a.last_success_at > b.last_success_at ? a : b)) : undefined) : crawled.find((c) => c.path === current);
  const rows = !crawl ? [] : isWeek ? await weeklyOffers(settings.dealPagePaths, { sort, q: sp.q, scope, includeCampaigns:true }) : await flashOffers(current, { sort, q: sp.q, scope });
  const href = (page: string, mode = scope) => {
    const params = new URLSearchParams({ page });
    if (sort !== "discount") params.set("sort", sort);
    if (sp.q) params.set("q", sp.q);
    if (mode === "all") params.set("scope", "all");
    return `/ventes-flash?${params}`;
  };

  return (
    <>
      <PageHeader
        title="Offres du moment"
        description={isWeek ? "Les meilleures remises vues ces 7 derniers jours sur les pages promo de Marjane Mall." : "Tout ce qu'affiche cette page promo de Marjane Mall, même hors de vos recherches."}
        actions={
          <CheckNowButton />
        }
      />

      <PromotionScope all={scope === "all"} profileHref={href(current, "profile")} allHref={href(current, "all")} />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {tabs.map((t) => (
          <Link
            key={t}
            href={href(t)}
            role="tab"
            aria-selected={t === current}
            className={cx("rounded-full border px-3.5 py-1.5 text-sm font-medium", t === current ? "border-ink bg-ink text-white" : "border-paper-line bg-paper-card text-ink-soft hover:border-ink-mute")}
          >
            {label(t)}
          </Link>
        ))}

      </div>

      {!crawl ? (
        <EmptyState icon={Zap} title={`« ${label(current)} » n'a pas encore été lue`}>
          Lancez une vérification : cette page est lue même sans recherche enregistrée. Les offres apparaîtront après la collecte.
        </EmptyState>
      ) : (
        <>
          <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
            <input type="hidden" name="page" value={current} />
            {scope === "all" && <input type="hidden" name="scope" value="all" />}
            <input name="q" type="search" defaultValue={sp.q} placeholder="Rechercher…" className={cx(input, "!w-auto min-w-0 flex-1 basis-40 sm:max-w-xs")} aria-label="Recherche" />
            <select name="sort" defaultValue={sort} className={cx(input, "!w-auto min-w-0 flex-1 basis-40 sm:flex-none")} aria-label="Tri">
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <button type="submit" className={btn.primary}>
              Filtrer
            </button>
            <span className="w-full text-xs text-ink-mute sm:ml-auto sm:w-auto" title={formatMoroccoTime(crawl.last_success_at)}>
              {rows.length} offres, vérifiées {relativeTime(crawl.last_success_at)}
            </span>
          </form>

          {rows.length === 0 ? (
            <EmptyState icon={Zap} title="Aucun produit pour cette recherche" />
          ) : (
            <DealResultsGrid className={dealGrid}>
              {rows.map((r) => (
                <DealCard
                  key={r.offer_id}
                  d={{
                    offerId: r.offer_id,
                    title: r.title,
                    url: r.url,
                    imageUrl: r.image_url,
                    brand: r.brand,
                    priceCents: r.current_price_cents,
                    originalPriceCents: r.original_price_cents,
                    discountPct: r.advertised_discount_pct,
                    previousPriceCents: r.previous_price_cents,
                    minPriceCents: r.min_price_cents,
                    firstSeenAt: r.first_seen_at,
                    observedAt:r.last_seen_at,
                    matches: r.matches,
                    highlights: profileHighlights(
                      { rawSpecs: r.raw_specs, categoryPath: r.category_path, brand: r.brand, title: r.title, seller: r.seller, priceCents: r.current_price_cents, discountPct: r.advertised_discount_pct },
                      settings.shopperProfile,
                    ),
                  }}
                />
              ))}
            </DealResultsGrid>
          )}
        </>
      )}
    </>
  );
}
