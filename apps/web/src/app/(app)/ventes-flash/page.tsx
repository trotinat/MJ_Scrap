import Link from "next/link";
import { RefreshCw, Zap } from "lucide-react";
import { getAppSettings, getDb } from "@mdw/database";
import { profileHighlights } from "@mdw/shared";
import { SubmitButton } from "@/components/buttons";
import { btn, cx, EmptyState, input, PageHeader } from "@/components/ui";
import { DealCard, dealGrid } from "@/components/deal-card";
import { flashOffers, flashPages, weeklyOffers, type FlashSort } from "@/lib/queries";
import { formatMoroccoTime, relativeTime } from "@/lib/format";
import { requestRunAction } from "../collectes/actions";

export const metadata = { title: "Offres" };

const WEEK = "semaine";

const PAGE_LABELS: Record<string, string> = {
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
  const sp = await searchParams;
  const [crawled, settings] = await Promise.all([flashPages(), getAppSettings(getDb())]);
  // Configured promotion pages first, then any other crawled page (e.g. one used by a criterion).
  const tabs = [WEEK, ...new Set([...settings.dealPagePaths, ...crawled.filter((c) => PAGE_LABELS[c.path]).map((c) => c.path)])];
  const current = sp.page && tabs.includes(sp.page) ? sp.page : WEEK;
  const sort = (SORTS.some((s) => s.value === sp.sort) ? sp.sort : "discount") as FlashSort;
  const isWeek = current === WEEK;
  const crawl = isWeek ? (crawled.length ? crawled.reduce((a, b) => (a.last_success_at > b.last_success_at ? a : b)) : undefined) : crawled.find((c) => c.path === current);
  const rows = !crawl ? [] : isWeek ? await weeklyOffers(settings.dealPagePaths, { sort, q: sp.q }) : await flashOffers(current, { sort, q: sp.q });
  const href = (page: string) => `/ventes-flash?page=${encodeURIComponent(page)}${sort !== "discount" ? `&sort=${sort}` : ""}`;

  return (
    <>
      <PageHeader
        title="Offres du moment"
        description={isWeek ? "Les meilleures remises vues ces 7 derniers jours sur les pages promo de Marjane Mall." : "Tout ce qu'affiche cette page promo de Marjane Mall, même hors de vos recherches."}
        actions={
          <form action={requestRunAction}>
            <SubmitButton variant="secondary" pendingLabel="Demandé…">
              <RefreshCw className="h-4 w-4" /> Vérifier maintenant
            </SubmitButton>
          </form>
        }
      />

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
          Lancez une vérification : cette page est lue même sans recherche enregistrée. Les offres apparaissent ici en moins d'une minute.
        </EmptyState>
      ) : (
        <>
          <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
            <input type="hidden" name="page" value={current} />
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
            <div className={dealGrid}>
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
                    matches: r.matches,
                    highlights: profileHighlights(
                      { brand: r.brand, title: r.title, seller: r.seller, priceCents: r.current_price_cents, discountPct: r.advertised_discount_pct },
                      settings.shopperProfile,
                    ),
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
