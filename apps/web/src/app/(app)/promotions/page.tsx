import Link from "next/link";
import { ArrowUpRight, Download, GitCompare, Tag } from "lucide-react";
import { getAppSettings, getDb } from "@mdw/database";
import { Badge, btn, EmptyState, FreshnessBadge, input, PageHeader, ProductImage, ScoreBadge, StockBadge } from "@/components/ui";
import { dealFacets, listDeals } from "@/lib/queries";
import { filtersToQuery, parseDealFilters } from "@/lib/deal-filters";
import { formatMad, formatPct } from "@/lib/format";

export const metadata = { title: "Promotions détectées" };

export default async function PromotionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = parseDealFilters(await searchParams);
  const [deals, facets, settings] = await Promise.all([listDeals({ ...filters, pageSize: 24 }), dealFacets(), getAppSettings(getDb())]);
  const pages = Math.max(1, Math.ceil(deals.total / 24));
  const page = filters.page ?? 1;
  const qs = filtersToQuery({ ...filters, page: undefined });

  return (
    <>
      <PageHeader
        title="Promotions détectées"
        description={`${deals.total} offre(s) respectant au moins un critère actif. Les remises « annoncées » proviennent du site ; les évolutions de prix proviennent de nos propres relevés.`}
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

      <form method="get" className="mb-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
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
          <option value="score">Meilleur score</option>
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

      {deals.rows.length === 0 ? (
        <EmptyState icon={Tag} title="Aucune promotion ne correspond à ces filtres" />
      ) : (
        <>
          <form id="compare-form" method="get" action="/promotions/comparer" className="mb-3 flex items-center justify-end gap-2">
            <span className="text-xs text-slate-500">Cochez 2 à 4 offres pour les comparer</span>
            <button type="submit" className={btn.secondary}>
              <GitCompare className="h-4 w-4" /> Comparer
            </button>
          </form>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {deals.rows.map((d) => (
              <article key={d.offer_id} className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="relative">
                  <ProductImage src={d.image_url} alt={d.title} className="h-44 w-full rounded-t-xl" />
                  <label className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-xs text-slate-700 shadow">
                    <input type="checkbox" name="ids" value={d.offer_id} form="compare-form" className="h-3.5 w-3.5 rounded border-slate-300" /> Comparer
                  </label>
                  {d.advertised_discount_pct !== null && (
                    <span className="absolute right-2 top-2 rounded-md bg-rose-600 px-2 py-0.5 text-xs font-semibold text-white" title="Remise annoncée par Marjane Mall">
                      -{d.advertised_discount_pct} %
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <p className="text-xs text-slate-500">
                    {d.brand ?? "Marque inconnue"}
                    {d.seller ? ` · Vendu par ${d.seller}` : ""}
                  </p>
                  <Link href={`/produits/${d.offer_id}`} className="mt-1 line-clamp-2 text-sm font-semibold text-slate-900 hover:text-brand-700">
                    {d.title}
                  </Link>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-lg font-bold text-brand-700">{formatMad(d.current_price_cents)}</span>
                    {d.original_price_cents && <span className="text-sm text-slate-400 line-through">{formatMad(d.original_price_cents)}</span>}
                  </div>
                  <p className="text-xs text-slate-500">
                    Évolution observée :{" "}
                    {d.drop_pct === null ? (
                      "pas encore d'historique"
                    ) : (
                      <span className={d.drop_pct < 0 ? "font-medium text-emerald-700" : d.drop_pct > 0 ? "text-rose-600" : ""}>
                        {formatPct(d.drop_pct)} vs relevé précédent
                      </span>
                    )}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <ScoreBadge score={d.score} dealClass={d.matches[0]?.dealClass ?? "ordinary"} />
                    <StockBadge stock={d.stock_status} />
                    <FreshnessBadge at={d.last_success_at} staleAfterHours={settings.staleAfterHours} />
                    {d.offer_status !== "active" && <Badge tone="red">{d.offer_status === "missing" ? "Plus listé" : "Indisponible"}</Badge>}
                  </div>
                  <p className="mt-2 line-clamp-3 text-xs text-slate-600">{d.matches[0]?.explanation}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {d.matches.map((m) => (
                      <Badge key={m.id} tone="blue">
                        {m.name}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-auto flex items-center justify-between pt-3">
                    <Link href={`/produits/${d.offer_id}`} className={btn.ghost}>
                      Détail & historique
                    </Link>
                    <a href={d.url} target="_blank" rel="noopener noreferrer nofollow" className={btn.ghost}>
                      Marjane Mall <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {pages > 1 && (
            <nav className="mt-6 flex items-center justify-center gap-2 text-sm" aria-label="Pagination">
              {page > 1 && (
                <Link className={btn.secondary} href={`/promotions?${filtersToQuery({ ...filters, page: page - 1 })}`}>
                  Précédent
                </Link>
              )}
              <span className="text-slate-500">
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
