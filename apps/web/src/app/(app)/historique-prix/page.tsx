import Link from "next/link";
import { LineChart } from "lucide-react";
import { btn, Card, EmptyState, input, PageHeader } from "@/components/ui";
import { recentPriceChanges, trackedOffers } from "@/lib/queries";
import { formatMad, formatMoroccoTime, formatPct, relativeTime } from "@/lib/format";

export const metadata = { title: "Historique des prix" };

export default async function PriceHistoryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q: rawQ } = await searchParams;
  const q = rawQ?.slice(0, 100) || undefined;
  const [changes, offers] = await Promise.all([recentPriceChanges(q), trackedOffers(q)]);

  return (
    <>
      <PageHeader title="Historique des prix" description="Variations calculées à partir des relevés de l'application uniquement (pas de prix antérieur au début du suivi)." />
      <form method="get" className="mb-6 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Filtrer par nom de produit…" className={`${input} max-w-md`} aria-label="Recherche" />
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
                          <Link href={`/produits/${c.offer_id}`} className="line-clamp-2 hover:text-brand-700">
                            {c.title}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap">{formatMad(c.prev)}</td>
                        <td className="whitespace-nowrap font-medium">{formatMad(c.price_cents)}</td>
                        <td className={`whitespace-nowrap font-medium ${pct < 0 ? "text-emerald-700" : "text-rose-600"}`}>{formatPct(pct)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Offres suivies">
          <div className="max-h-[36rem] overflow-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>Prix actuel</th>
                  <th>Plus bas observé</th>
                  <th>Relevés</th>
                  <th>Dernier relevé</th>
                </tr>
              </thead>
              <tbody>
                {offers.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/produits/${o.id}`} className="line-clamp-2 hover:text-brand-700">
                        {o.title}
                      </Link>
                      {o.status !== "active" && <span className="text-xs text-rose-600">{o.status === "missing" ? "plus listé" : "indisponible"}</span>}
                    </td>
                    <td className="whitespace-nowrap">{formatMad(o.current_price_cents)}</td>
                    <td className="whitespace-nowrap">{formatMad(o.min_price_cents)}</td>
                    <td>{o.observations}</td>
                    <td className="whitespace-nowrap">{relativeTime(o.last_success_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
