import Link from "next/link";
import { ArrowUpRight, Play, Zap } from "lucide-react";
import { getAppSettings, getDb } from "@mdw/database";
import { SubmitButton } from "@/components/buttons";
import { Badge, btn, cx, EmptyState, input, PageHeader, ProductImage } from "@/components/ui";
import { flashOffers, flashPages, type FlashSort } from "@/lib/queries";
import { formatMad, formatMoroccoTime, formatPct, relativeTime } from "@/lib/format";
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
        description="Tous les produits affichés sur les pages promotionnelles de Marjane Mall lors de la dernière collecte réussie, qu'ils correspondent ou non à vos critères."
        actions={
          <form action={requestRunAction}>
            <SubmitButton pendingLabel="Demande…">
              <Play className="h-4 w-4" /> Lancer une collecte
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
            className={cx("rounded-full border px-3 py-1.5 text-sm", t === current ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")}
          >
            {label(t)}
          </Link>
        ))}
        <Link href="/parametres" className="px-2 py-1.5 text-sm text-slate-500 underline-offset-2 hover:underline">
          Gérer les pages suivies
        </Link>
      </div>

      {!crawl ? (
        <EmptyState icon={Zap} title={`« ${label(current)} » n'a pas encore été collectée`}>
          Lancez une collecte : la page est analysée même sans critère de recherche. Le résultat apparaît ici en 1 à 3 minutes.
        </EmptyState>
      ) : (
        <>
          <form method="get" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <input type="hidden" name="page" value={current} />
            <input name="q" defaultValue={sp.q} placeholder="Rechercher un produit ou une marque…" className={cx(input, "max-w-xs")} aria-label="Recherche" />
            <select name="sort" defaultValue={sort} className={cx(input, "max-w-xs")} aria-label="Tri">
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <button type="submit" className={btn.primary}>
              Appliquer
            </button>
            <span className="ml-auto text-xs text-slate-500" title={formatMoroccoTime(crawl.last_success_at)}>
              {rows.length} produit(s) · dernière collecte réussie {relativeTime(crawl.last_success_at)} ({formatMoroccoTime(crawl.last_success_at)})
            </span>
          </form>

          {rows.length === 0 ? (
            <EmptyState icon={Zap} title="Aucun produit pour cette recherche" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {rows.map((r) => {
                const change =
                  r.previous_price_cents && r.previous_price_cents > 0 ? ((r.current_price_cents - r.previous_price_cents) / r.previous_price_cents) * 100 : null;
                const atMin = r.min_price_cents !== null && r.current_price_cents <= r.min_price_cents && r.previous_price_cents !== null;
                return (
                  <article key={r.offer_id} className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="relative">
                      <ProductImage src={r.image_url} alt={r.title} className="h-40 w-full rounded-t-xl" />
                      {r.advertised_discount_pct !== null && (
                        <span className="absolute right-2 top-2 rounded-md bg-rose-600 px-2 py-0.5 text-xs font-semibold text-white" title="Remise annoncée par Marjane Mall">
                          -{r.advertised_discount_pct} %
                        </span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-3">
                      <p className="text-xs text-slate-500">{r.brand ?? "Marque non détectée"}</p>
                      <Link href={`/produits/${r.offer_id}`} className="mt-0.5 line-clamp-2 text-sm font-semibold text-slate-900 hover:text-brand-700">
                        {r.title}
                      </Link>
                      <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-lg font-bold text-brand-700">{formatMad(r.current_price_cents)}</span>
                        {r.original_price_cents && <span className="text-sm text-slate-400 line-through">{formatMad(r.original_price_cents)}</span>}
                      </div>
                      <p className="text-xs text-slate-500">
                        {change === null ? (
                          `Sur la page depuis ${relativeTime(r.first_seen_at)}`
                        ) : (
                          <span className={change < 0 ? "font-medium text-emerald-700" : change > 0 ? "text-rose-600" : ""}>
                            {formatPct(change)} vs relevé précédent
                          </span>
                        )}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {atMin && <Badge tone="green">Plus bas observé</Badge>}
                        {r.matches.map((m) => (
                          <Badge key={m.id} tone="blue" title={`${m.name} · score ${m.score}/100`}>
                            <span className="inline-block max-w-[11rem] truncate align-bottom">{m.name}</span>
                          </Badge>
                        ))}
                      </div>
                      <div className="mt-auto flex items-center justify-between pt-2">
                        <Link href={`/produits/${r.offer_id}`} className={btn.ghost}>
                          Historique
                        </Link>
                        <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" className={btn.ghost}>
                          Marjane Mall <ArrowUpRight className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}
