import Link from "next/link";
import { ArrowDownRight, LineChart, Package, TrendingDown, Trophy } from "lucide-react";
import { btn, Card, cx, EmptyState, input, PageHeader } from "@/components/ui";
import { Sparkline } from "@/components/sparkline";
import { priceHistorySummary, recentPriceChanges, trackedOffers, type TrackedSort } from "@/lib/queries";
import { formatMad, formatMoroccoTime, formatPct, relativeTime } from "@/lib/format";

export const metadata = { title: "Historique des prix" };

const SORTS: { value: TrackedSort; label: string }[] = [
  { value: "recent", label: "Dernier relevé" },
  { value: "drop", label: "Proche de son plus bas" },
  { value: "cheapest", label: "Prix le plus bas" },
  { value: "observed", label: "Le plus de relevés" },
];

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Package; label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-paper-line bg-paper-card p-4">
      <div className="flex items-center gap-2 text-ink-mute">
        <Icon className="h-4 w-4" aria-hidden />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="num mt-1 font-display text-2xl font-bold text-ink">{value}</p>
      {hint && <p className="text-xs text-ink-mute">{hint}</p>}
    </div>
  );
}

export default async function PriceHistoryPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string }> }) {
  const sp = await searchParams;
  const q = sp.q?.slice(0, 100) || undefined;
  const sort = (SORTS.some((s) => s.value === sp.sort) ? sp.sort : "recent") as TrackedSort;
  const [changes, offers, summary] = await Promise.all([recentPriceChanges(q), trackedOffers({ q, sort }), priceHistorySummary(q)]);

  return (
    <>
      <PageHeader title="Historique des prix" description="Variations calculées à partir des relevés de l'application uniquement (pas de prix antérieur au début du suivi)." />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Package} label="Offres suivies" value={summary.tracked} />
        <Stat icon={LineChart} label="Relevés enregistrés" value={summary.observations} />
        <Stat icon={TrendingDown} label="Baisses (7 derniers jours)" value={summary.drops7d} />
        <Stat icon={Trophy} label="À leur prix le plus bas" value={summary.atLowest} hint="prix actuel ≤ plus bas observé" />
      </div>

      <form method="get" className="mb-6 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Filtrer par nom de produit…" className={cx(input, "max-w-md flex-1 basis-48")} aria-label="Recherche" />
        <select name="sort" defaultValue={sort} className={cx(input, "!w-auto")} aria-label="Tri des offres suivies">
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              Trier : {s.label}
            </option>
          ))}
        </select>
        <button type="submit" className={btn.primary}>
          Filtrer
        </button>
      </form>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Dernières variations de prix observées">
          {changes.length === 0 ? (
            <EmptyState icon={LineChart} title="Aucune variation observée">
              Une variation apparaît dès que deux relevés successifs d&apos;une offre diffèrent.
            </EmptyState>
          ) : (
            <div className="max-h-[36rem] overflow-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Produit</th>
                    <th>Avant</th>
                    <th>Après</th>
                    <th>Variation</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((c, i) => {
                    const pct = ((c.price_cents - c.prev) / c.prev) * 100;
                    return (
                      <tr key={`${c.offer_id}-${i}`}>
                        <td className="whitespace-nowrap">{formatMoroccoTime(c.observed_at)}</td>
                        <td>
                          <Link href={`/produits/${c.offer_id}`} className="line-clamp-2 hover:text-ink">
                            {c.title}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap">{formatMad(c.prev)}</td>
                        <td className="whitespace-nowrap font-medium">{formatMad(c.price_cents)}</td>
                        <td className={`whitespace-nowrap font-medium ${pct < 0 ? "text-proof" : "text-promo"}`}>{formatPct(pct)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Offres suivies">
          {offers.length === 0 ? (
            <EmptyState icon={Package} title="Aucune offre suivie" />
          ) : (
            <div className="max-h-[36rem] overflow-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th>Évolution</th>
                    <th>Prix actuel</th>
                    <th>Plus bas</th>
                    <th>Relevés</th>
                  </tr>
                </thead>
                <tbody>
                  {offers.map((o) => {
                    const atLowest =
                      o.current_price_cents !== null && o.min_price_cents !== null && o.current_price_cents <= o.min_price_cents;
                    const abovePct =
                      o.current_price_cents !== null && o.min_price_cents && o.min_price_cents > 0
                        ? ((o.current_price_cents - o.min_price_cents) / o.min_price_cents) * 100
                        : null;
                    return (
                      <tr key={o.id}>
                        <td>
                          <Link href={`/produits/${o.id}`} className="line-clamp-2 hover:text-ink">
                            {o.title}
                          </Link>
                          {o.status !== "active" && <span className="text-xs text-promo">{o.status === "missing" ? " · plus listé" : " · indisponible"}</span>}
                          <span className="block text-xs text-ink-mute">Dernier relevé {relativeTime(o.last_success_at)}</span>
                        </td>
                        <td>
                          <Sparkline values={o.spark} />
                        </td>
                        <td className="whitespace-nowrap">
                          <span className="font-medium">{formatMad(o.current_price_cents)}</span>
                          {atLowest ? (
                            <span className="mt-0.5 flex w-fit items-center gap-1 rounded-full bg-proof px-1.5 py-0.5 text-[10px] font-semibold text-white">
                              <Trophy className="h-3 w-3" aria-hidden /> au plus bas
                            </span>
                          ) : abovePct && abovePct >= 1 ? (
                            <span className="mt-0.5 flex w-fit items-center gap-0.5 text-[11px] text-ink-mute">
                              <ArrowDownRight className="h-3 w-3" aria-hidden /> +{Math.round(abovePct)}% vs plus bas
                            </span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap">{formatMad(o.min_price_cents)}</td>
                        <td>{o.observations}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
