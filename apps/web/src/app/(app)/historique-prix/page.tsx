import Link from "next/link";
import { ArrowDownRight, LineChart, Package, TrendingDown, Trophy } from "lucide-react";
import { btn, Card, cx, EmptyState, input, PageHeader, StatCard, Badge } from "@/components/ui";
import { Sparkline } from "@/components/sparkline";
import { ProductGallery } from "@/components/product-gallery";
import { priceHistorySummary, recentPriceChanges, trackedOffers, type TrackedSort } from "@/lib/queries";
import { formatMad, formatMoroccoTime, formatPct, relativeTime } from "@/lib/format";

export const metadata = { title: "Historique des prix" };

const SORTS: { value: TrackedSort; label: string }[] = [
  { value: "recent", label: "Dernier relevé" },
  { value: "drop", label: "Proche de son plus bas" },
  { value: "cheapest", label: "Prix le plus bas" },
  { value: "observed", label: "Le plus de relevés" },
];

export default async function PriceHistoryPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string }> }) {
  const sp = await searchParams;
  const q = sp.q?.slice(0, 100) || undefined;
  const sort = (SORTS.some((s) => s.value === sp.sort) ? sp.sort : "recent") as TrackedSort;
  const [changes, offers, summary] = await Promise.all([recentPriceChanges(q), trackedOffers({ q, sort }), priceHistorySummary(q)]);
  const dropCount = changes.filter((c) => c.price_cents < c.prev).length;

  return (
    <>
      <PageHeader title="Historique des prix" description="Les baisses vérifiées d’abord, calculées à partir de nos propres relevés." />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={TrendingDown} label="Baisses · 7 jours" value={summary.drops7d} tone="green" />
        <StatCard icon={Trophy} label="Au prix le plus bas" value={summary.atLowest} tone="blue" hint="Prix actuel vs. plus bas observé" />
        <StatCard icon={Package} label="Offres suivies" value={summary.tracked} />
        <StatCard icon={LineChart} label="Relevés enregistrés" value={summary.observations.toLocaleString("fr-FR")} />
      </div>

      <form method="get" className="mb-6 grid gap-2 rounded-[1.35rem] border border-paper-line bg-paper-card p-3 card-soft sm:grid-cols-[minmax(0,1fr)_220px_auto]">
        <label className="sr-only" htmlFor="price-history-search">Chercher un produit</label>
        <input id="price-history-search" name="q" type="search" autoComplete="off" defaultValue={q} placeholder="Chercher un produit…" className={cx(input, "min-h-11 text-base")} />
        <label className="sr-only" htmlFor="tracked-sort">Trier les offres suivies</label>
        <select id="tracked-sort" name="sort" defaultValue={sort} className={cx(input, "min-h-11 text-base")}>
          {SORTS.map((s) => <option key={s.value} value={s.value}>Offres suivies · {s.label}</option>)}
        </select>
        <button type="submit" className={cx(btn.primary, "w-full sm:w-auto")}>Afficher</button>
      </form>

      <div className="grid gap-6">
        <Card title="Variations récentes" actions={<Badge tone="green">{dropCount} {dropCount === 1 ? "baisse" : "baisses"} en tête</Badge>}>
          <p className="-mt-2 mb-4 text-sm text-ink-mute">Une baisse apparaît après au moins deux relevés comparables. Les remises annoncées par la boutique ne sont pas utilisées ici.</p>
          {changes.length === 0 ? (
            <EmptyState icon={LineChart} title="Aucune variation observée">
              Une variation apparaîtra dès que deux relevés successifs d&apos;une offre différeront.
            </EmptyState>
          ) : <>
            <ul className="grid gap-3 md:hidden">
              {changes.map((c, i) => {
                const delta = c.price_cents - c.prev;
                const pct = (delta / c.prev) * 100;
                const down = delta < 0;
                const images = [...new Set([...(c.image_urls ?? []), c.image_url].filter((image): image is string => Boolean(image)))].slice(0, 6);
                return <li key={`${c.offer_id}-${i}`} className="rounded-2xl border border-paper-line bg-paper-card p-3 transition-colors hover:border-brand-300">
                    <div className="flex gap-3">
                      <ProductGallery images={images} className="h-24 w-24 shrink-0 rounded-xl" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={down ? "green" : "red"}>{down ? <><ArrowDownRight className="h-3.5 w-3.5" aria-hidden /> Baisse mesurée</> : "Hausse"}</Badge>
                          <span className="text-xs text-ink-mute">{relativeTime(c.observed_at)}</span>
                        </div>
                        <Link href={`/produits/${c.offer_id}`} translate="no" className="mt-2 line-clamp-2 block text-sm font-semibold leading-snug text-ink hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600">{c.title}</Link>
                      </div>
                    </div>
                    <div className="mt-3 flex items-end justify-between gap-2 border-t border-paper-line pt-3">
                      <div>
                        <p className="text-xs text-ink-mute">{formatMad(c.prev)} <span aria-hidden>→</span> <span className="font-semibold text-ink">{formatMad(c.price_cents)}</span></p>
                        <p className="mt-0.5 text-xs text-ink-mute">{formatMoroccoTime(c.observed_at)}</p>
                      </div>
                      <div className={`shrink-0 text-right font-display font-bold ${down ? "text-proof" : "text-promo"}`}>
                        <p className="text-base">{down ? "−" : "+"}{formatMad(Math.abs(delta))}</p>
                        <p className="text-xs">{formatPct(pct)}</p>
                      </div>
                    </div>
                </li>;
              })}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="data">
                <thead><tr><th>Évolution</th><th>Produit</th><th>Avant</th><th>Maintenant</th><th>Écart</th></tr></thead>
                <tbody>
                  {changes.map((c, i) => {
                    const pct = ((c.price_cents - c.prev) / c.prev) * 100;
                    const down = c.price_cents < c.prev;
                    return <tr key={`${c.offer_id}-${i}`}>
                      <td className="whitespace-nowrap text-xs text-ink-mute">{formatMoroccoTime(c.observed_at)}</td>
                      <td><Link href={`/produits/${c.offer_id}`} className="line-clamp-2 hover:text-ink">{c.title}</Link></td>
                      <td className="whitespace-nowrap">{formatMad(c.prev)}</td>
                      <td className="whitespace-nowrap font-medium">{formatMad(c.price_cents)}</td>
                      <td className={`whitespace-nowrap font-semibold ${down ? "text-proof" : "text-promo"}`}>{formatMad(Math.abs(c.price_cents - c.prev))} · {formatPct(pct)}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </>}
        </Card>

        <Card title="Offres suivies" actions={<Badge>{offers.length} affichées · filtrez pour affiner</Badge>}>
          {offers.length === 0 ? <EmptyState icon={Package} title="Aucune offre suivie" /> : <>
            <ul className="grid gap-3 md:hidden">
              {offers.map((o) => {
                const atLowest = o.current_price_cents !== null && o.min_price_cents !== null && o.current_price_cents <= o.min_price_cents;
                const abovePct = o.current_price_cents !== null && o.min_price_cents && o.min_price_cents > 0 ? ((o.current_price_cents - o.min_price_cents) / o.min_price_cents) * 100 : null;
                const images = [...new Set([...(o.image_urls ?? []), o.image_url].filter((image): image is string => Boolean(image)))].slice(0, 6);
                return <li key={o.id} className="rounded-2xl border border-paper-line bg-paper-card p-4">
                  <div className="flex gap-3">
                    <ProductGallery images={images} className="h-24 w-24 shrink-0 rounded-xl" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/produits/${o.id}`} translate="no" className="line-clamp-2 font-semibold text-ink hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600">{o.title}</Link>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div>
                          <p className="font-display text-lg font-bold text-ink">{formatMad(o.current_price_cents)}</p>
                          <p className="mt-0.5 text-xs text-ink-mute">Plus bas {formatMad(o.min_price_cents)}</p>
                        </div>
                        <div className="flex min-w-0 flex-col items-end gap-1">
                          <Sparkline values={o.spark} width={72} height={24} />
                          {atLowest ? <Badge tone="green"><Trophy className="h-3 w-3" aria-hidden /> Au plus bas</Badge> : abovePct !== null && abovePct >= 1 ? <span className="text-xs text-ink-mute">+{Math.round(abovePct)} % vs. plus bas</span> : null}
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 border-t border-paper-line pt-2 text-xs text-ink-mute">{o.observations.toLocaleString("fr-FR")} relevés · dernier {relativeTime(o.last_success_at)}{o.status !== "active" ? ` · ${o.status === "missing" ? "plus listé" : "indisponible"}` : ""}</p>
                </li>;
              })}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="data">
                <thead><tr><th>Produit</th><th>Évolution</th><th>Prix actuel</th><th>Plus bas</th><th>Relevés</th></tr></thead>
                <tbody>
                  {offers.map((o) => {
                    const atLowest = o.current_price_cents !== null && o.min_price_cents !== null && o.current_price_cents <= o.min_price_cents;
                    const abovePct = o.current_price_cents !== null && o.min_price_cents && o.min_price_cents > 0 ? ((o.current_price_cents - o.min_price_cents) / o.min_price_cents) * 100 : null;
                    return <tr key={o.id}>
                      <td><Link href={`/produits/${o.id}`} className="line-clamp-2 hover:text-ink">{o.title}</Link>{o.status !== "active" && <span className="text-xs text-promo">{o.status === "missing" ? " · plus listé" : " · indisponible"}</span>}<span className="block text-xs text-ink-mute">Dernier relevé {relativeTime(o.last_success_at)}</span></td>
                      <td><Sparkline values={o.spark} /></td>
                      <td className="whitespace-nowrap"><span className="font-medium">{formatMad(o.current_price_cents)}</span>{atLowest ? <span className="mt-0.5 flex w-fit items-center gap-1 rounded-full bg-proof px-1.5 py-0.5 text-[10px] font-semibold text-white"><Trophy className="h-3 w-3" aria-hidden /> au plus bas</span> : abovePct !== null && abovePct >= 1 ? <span className="mt-0.5 flex w-fit items-center gap-0.5 text-[11px] text-ink-mute"><ArrowDownRight className="h-3 w-3" aria-hidden /> +{Math.round(abovePct)}% vs plus bas</span> : null}</td>
                      <td className="whitespace-nowrap">{formatMad(o.min_price_cents)}</td><td>{o.observations.toLocaleString("fr-FR")}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </>}
        </Card>
      </div>
    </>
  );
}
