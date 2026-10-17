import Link from "next/link";
import { Download, GitCompare, SlidersHorizontal, Tag } from "lucide-react";
import { getAppSettings, getDb } from "@mdw/database";
import { btn, EmptyState, input, PageHeader } from "@/components/ui";
import { DealCard, dealGrid } from "@/components/deal-card";
import { dealFacets, listDeals } from "@/lib/queries";
import { filtersToQuery, parseDealFilters } from "@/lib/deal-filters";
import type { DealClass } from "@mdw/shared";

export const metadata = { title: "Résultats · Bons plans" };

export default async function PromotionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = parseDealFilters(await searchParams);
  const [deals, facets, settings] = await Promise.all([listDeals({ ...filters, pageSize: 24 }), dealFacets(), getAppSettings(getDb())]);
  const pages = Math.max(1, Math.ceil(deals.total / 24));
  const page = filters.page ?? 1;
  const qs = filtersToQuery({ ...filters, page: undefined });

  return (
    <>
      <PageHeader
        title="Vos résultats"
        description={`${deals.total} offres correspondant à vos recherches, classées par score du bon plan. Les baisses en vert sont mesurées ; les remises en rouge sont annoncées par Marjane.`}
        actions={
          <>
            <a href={`/api/export?format=csv&${qs}`} className={btn.secondary}>
              <Download className="h-4 w-4" /> CSV
            </a>
            <a href={`/api/export?format=xlsx&${qs}`} className={btn.secondary}>
              <Download className="h-4 w-4" /> Excel
            </a>
          </>
        }
      />

      <nav aria-label="Qualité des offres" className="mb-4 flex gap-2 overflow-x-auto pb-1 text-xs sm:text-sm">
        {[
          { label: "Toutes", score: undefined },
          { label: "Intéressantes", score: settings.thresholds.interesting },
          { label: "Très bonnes", score: settings.thresholds.veryGood },
          { label: "Exceptionnelles", score: settings.thresholds.exceptional },
        ].map(({ label, score }) => {
          const active = filters.minScore === score;
          return <Link key={label} href={`/promotions?${filtersToQuery({ ...filters, minScore: score, page: 1 })}`}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-full border px-3 py-2.5 font-semibold ${active ? "border-brand-600 bg-brand-600 text-white" : "border-paper-line bg-paper-card text-ink-soft"}`}>{label}</Link>;
        })}
      </nav>

      <details className="group mb-6 rounded-2xl border border-paper-line bg-paper-card" open={Object.keys(filters).some((k) => k !== "page" && k !== "sort" && (filters as Record<string, unknown>)[k] !== undefined)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-ink">
        <SlidersHorizontal className="h-4 w-4" aria-hidden /> Filtrer et trier
      </summary>
      <form method="get" className="grid gap-3 border-t border-paper-line p-4 sm:grid-cols-2 lg:grid-cols-4">
        <input name="q" defaultValue={filters.q} placeholder="Rechercher…" className={input} aria-label="Recherche" />
        <select name="criterionId" defaultValue={filters.criterionId ?? ""} className={input} aria-label="Critère">
          <option value="">Tous les critères</option>
          {facets.criteria.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="category" defaultValue={filters.category ?? ""} className={input} aria-label="Catégorie">
          <option value="">Toutes catégories</option>
          {facets.categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select name="brand" defaultValue={filters.brand ?? ""} className={input} aria-label="Marque">
          <option value="">Toutes marques</option>
          {facets.brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <input name="minPrice" defaultValue={filters.minPrice} placeholder="Prix min" inputMode="decimal" className={input} aria-label="Prix minimum" />
          <input name="maxPrice" defaultValue={filters.maxPrice} placeholder="Prix max" inputMode="decimal" className={input} aria-label="Prix maximum" />
        </div>
        <select name="minScore" defaultValue={filters.minScore?.toString() ?? ""} className={input} aria-label="Score minimum">
          <option value="">Tout score</option>
          <option value={settings.thresholds.interesting}>≥ {settings.thresholds.interesting} (intéressante)</option>
          <option value={settings.thresholds.veryGood}>≥ {settings.thresholds.veryGood} (très bonne)</option>
          <option value={settings.thresholds.exceptional}>≥ {settings.thresholds.exceptional} (exceptionnelle)</option>
        </select>
        <select name="stock" defaultValue={filters.stock ?? ""} className={input} aria-label="Disponibilité">
          <option value="">Toute disponibilité</option>
          <option value="in_stock">En stock</option>
          <option value="out_of_stock">Rupture</option>
          <option value="unknown">Non indiqué</option>
        </select>
        <select name="sort" defaultValue={filters.sort ?? "score"} className={input} aria-label="Tri">
          <option value="score">Meilleurs bons plans</option>
          <option value="price">Prix le plus bas</option>
          <option value="drop">Plus forte baisse observée</option>
          <option value="recent">Plus récentes</option>
        </select>
        <div className="flex gap-2">
          <button type="submit" className={btn.primary}>
            Filtrer
          </button>
          <Link href="/promotions" className={btn.secondary}>
            Réinitialiser
          </Link>
        </div>
      </form>
      </details>

      {deals.rows.length === 0 ? (
        <EmptyState icon={Tag} title="Aucune promotion ne correspond à ces filtres" />
      ) : (
        <>
          <form id="compare-form" method="get" action="/promotions/comparer" className="mb-3 flex items-center justify-end gap-2">
            <span className="text-xs text-ink-mute">Cochez 2 à 4 offres pour les comparer</span>
            <button type="submit" className={btn.secondary}>
              <GitCompare className="h-4 w-4" /> Comparer
            </button>
          </form>
          <div className={dealGrid}>
            {deals.rows.map((d) => (
              <DealCard
                key={d.offer_id}
                compareForm="compare-form"
                d={{
                  offerId: d.offer_id,
                  title: d.title,
                  url: d.url,
                  imageUrl: d.image_url,
                  brand: d.brand,
                  priceCents: d.current_price_cents,
                  originalPriceCents: d.original_price_cents,
                  discountPct: d.advertised_discount_pct,
                  previousPriceCents: d.prev_price_cents,
                  minPriceCents: d.min_price_cents,
                  firstSeenAt: d.first_seen_at,
                  matches: d.matches,
                  status: d.offer_status,
                  score: d.score,
                  dealClass: d.matches[0]?.dealClass as DealClass | undefined,
                  observedAt: d.last_success_at,
                }}
              />
            ))}
          </div>
          {pages > 1 && (
            <nav className="mt-6 flex items-center justify-center gap-2 text-sm" aria-label="Pagination">
              {page > 1 && (
                <Link className={btn.secondary} href={`/promotions?${filtersToQuery({ ...filters, page: page - 1 })}`}>
                  Précédent
                </Link>
              )}
              <span className="text-ink-mute">
                Page {page} / {pages}
              </span>
              {page < pages && (
                <Link className={btn.secondary} href={`/promotions?${filtersToQuery({ ...filters, page: page + 1 })}`}>
                  Suivant
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}
