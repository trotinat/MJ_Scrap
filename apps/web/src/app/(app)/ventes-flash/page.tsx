import Link from "next/link";
import { RefreshCw, Zap } from "lucide-react";
import { getAppSettings, getDb } from "@mdw/database";
import { SubmitButton } from "@/components/buttons";
import { btn, cx, EmptyState, input, PageHeader } from "@/components/ui";
import { DealCard, dealGrid } from "@/components/deal-card";
import { flashOffers, flashPages, type FlashSort } from "@/lib/queries";
import { formatMoroccoTime, relativeTime } from "@/lib/format";
import { requestRunAction } from "../collectes/actions";

export const metadata = { title: "Ventes flash" };

const PAGE_LABELS: Record<string, string> = { "/ventes-flash": "Ventes flash", "/destockage": "Déstockage" };
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
  const tabs = [...new Set([...settings.dealPagePaths, ...crawled.filter((c) => PAGE_LABELS[c.path]).map((c) => c.path)])];
  const current = sp.page && tabs.includes(sp.page) ? sp.page : (tabs[0] ?? "/ventes-flash");
  const sort = (SORTS.some((s) => s.value === sp.sort) ? sp.sort : "discount") as FlashSort;
  const crawl = crawled.find((c) => c.path === current);
  const rows = crawl ? await flashOffers(current, { sort, q: sp.q }) : [];
  const href = (page: string) => `/ventes-flash?page=${encodeURIComponent(page)}${sort !== "discount" ? `&sort=${sort}` : ""}`;

  return (
    <>
      <PageHeader
        title="Ventes flash"
        description="Toutes les offres affichées sur les pages promo de Marjane Mall, même hors de vos recherches."
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
            <input name="q" type="search" defaultValue={sp.q} placeholder="Rechercher…" className={cx(input, "min-w-0 flex-1 basis-40 sm:max-w-xs")} aria-label="Recherche" />
            <select name="sort" defaultValue={sort} className={cx(input, "w-auto min-w-0 flex-1 basis-40 sm:flex-none")} aria-label="Tri">
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <button type="submit" className={btn.primary}>
              OK
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
