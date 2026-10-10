import Link from "next/link";
import { BellRing, Plus, RefreshCw, Search, Zap } from "lucide-react";
import { getDb, listCriteria } from "@mdw/database";
import { telegramConfigFromEnv } from "@mdw/notifications";
import { SubmitButton } from "@/components/buttons";
import { DealCard, dealGrid, type DealCardData } from "@/components/deal-card";
import { btn, EmptyState } from "@/components/ui";
import { criteriaSummaries, dashboardStats, flashOffers, listDeals, type DealRow, type FlashRow } from "@/lib/queries";
import { formatMoroccoTime, relativeTime } from "@/lib/format";
import { requestRunAction } from "./collectes/actions";

export const metadata = { title: "Bons plans" };

const fromDeal = (d: DealRow): DealCardData => ({
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
});

const fromFlash = (r: FlashRow): DealCardData => ({
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
});

/** Time only ("18:00") for today, full date otherwise. */
function when(d: Date): string {
  const full = formatMoroccoTime(d);
  const today = formatMoroccoTime(new Date()).split(",")[0];
  return full.startsWith(today ?? "\u0000") ? (full.split(", ")[1] ?? full) : full;
}

export default async function HomePage() {
  const [s, deals, criteria, summaries, flash] = await Promise.all([
    dashboardStats(),
    listDeals({ sort: "score", pageSize: 13 }),
    listCriteria(getDb()),
    criteriaSummaries(),
    flashOffers("/ventes-flash", { sort: "discount" }).catch(() => []),
  ]);
  const telegramReady = telegramConfigFromEnv() !== null;
  const waiting = (s.notifStats.pending ?? 0) + (s.notifStats.failed ?? 0);
  const running = Boolean(s.worker?.currentRunId);
  const [hero, ...rest] = deals.rows;
  const active = criteria.filter((c) => c.enabled);

  return (
    <>
      {/* Freshness first: can I trust what I see? */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-mute">
        <p>
          {running ? (
            <span className="font-medium text-ink">Vérification des prix en cours…</span>
          ) : s.lastSuccess ? (
            <>
              Prix vérifiés <span className="font-medium text-ink">{relativeTime(s.lastSuccess.startedAt)}</span>.
              {s.nextRun && <> Prochaine vérification à {when(new Date(s.nextRun))}.</>}
            </>
          ) : (
            "Aucune vérification des prix pour l'instant."
          )}
        </p>
        <form action={requestRunAction}>
          <SubmitButton variant="secondary" pendingLabel="Demandé…">
            <RefreshCw className="h-4 w-4" aria-hidden /> Vérifier maintenant
          </SubmitButton>
        </form>
      </div>

      {!telegramReady && (
        <Link
          href="/notifications"
          className="mb-6 flex items-center gap-3 rounded-2xl bg-ink p-4 text-white hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-tag-deep"
        >
          <BellRing className="h-6 w-6 shrink-0 text-tag" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block font-display font-semibold">Recevez les bons plans sur votre téléphone</span>
            <span className="block text-sm text-white/75">
              {waiting > 1 ? `${waiting} alertes attendent d'être envoyées. ` : waiting === 1 ? "Une alerte attend d'être envoyée. " : ""}Activez Telegram en 3 minutes.
            </span>
          </span>
          <span className="hidden rounded-full bg-tag px-3 py-1.5 text-sm font-semibold text-ink sm:inline">Activer</span>
        </Link>
      )}

      {active.length === 0 ? (
        <EmptyState icon={Search} title="Dites-nous ce que vous cherchez">
          <p>Collez un lien Marjane Mall ou partez d'une recherche recommandée : les bons plans apparaîtront ici.</p>
          <Link href="/criteres" className={`${btn.primary} mt-4`}>
            <Plus className="h-4 w-4" /> Créer ma première recherche
          </Link>
        </EmptyState>
      ) : (
        <>
          {/* The memorable moment: today's best deal, large */}
          {hero ? (
            <section className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-stretch">
              <div>
                <h1 className="mb-3 font-display text-[2rem] font-extrabold leading-none tracking-tight sm:text-[2.6rem]">Le bon plan du moment</h1>
                <DealCard d={fromDeal(hero)} size="lg" />
              </div>
              <div className="flex flex-col gap-3 lg:pt-[3.4rem]">
                <div className="grid grid-cols-3 gap-3">
                  <Fact value={deals.total} label="bons plans pour vos recherches" />
                  <Fact value={s.newDeals24h} label="nouveaux en 24 h" />
                  <Fact value={s.drops24h} label="baisses vérifiées en 24 h" />
                </div>
                <div className="rounded-2xl border border-paper-line bg-paper-card p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="font-display text-lg font-bold">Mes recherches</h2>
                    <Link href="/criteres" className={btn.ghost}>
                      Gérer
                    </Link>
                  </div>
                  <ul className="flex flex-col divide-y divide-paper-line">
                    {active.slice(0, 6).map((c) => {
                      const n = summaries.get(c.id)?.matches ?? 0;
                      return (
                        <li key={c.id}>
                          <Link href={`/promotions?criterionId=${c.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-ink">
                            <span className="truncate text-sm text-ink-soft">{c.name}</span>
                            <span className={`num shrink-0 rounded-full px-2.5 py-0.5 text-sm font-semibold ${n > 0 ? "bg-tag text-ink" : "bg-paper text-ink-mute"}`}>{n}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                  <Link href="/criteres" className={`${btn.secondary} mt-3 w-full`}>
                    <Plus className="h-4 w-4" /> Nouvelle recherche
                  </Link>
                </div>
              </div>
            </section>
          ) : (
            <EmptyState icon={Search} title="Pas encore de bon plan pour vos recherches">
              Les prix sont vérifiés à 09:00 et 18:00. Vous pouvez aussi lancer une vérification maintenant.
            </EmptyState>
          )}

          {rest.length > 0 && (
            <section className="mb-10">
              <div className="mb-3 flex items-end justify-between gap-3">
                <h2 className="font-display text-2xl font-bold tracking-tight">Pour vous</h2>
                <Link href="/promotions" className={btn.ghost}>
                  Voir les {deals.total}
                </Link>
              </div>
              <div className={dealGrid}>
                {rest.map((d) => (
                  <DealCard key={d.offer_id} d={fromDeal(d)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {flash.length > 0 && (
        <section className="mb-6">
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
              <Zap className="h-6 w-6 fill-tag text-ink" aria-hidden /> Ventes flash
            </h2>
            <Link href="/ventes-flash" className={btn.ghost}>
              Voir les {flash.length}
            </Link>
          </div>
          <div className={dealGrid}>
            {flash.slice(0, 8).map((r) => (
              <DealCard key={r.offer_id} d={fromFlash(r)} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function Fact({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl border border-paper-line bg-paper-card p-3">
      <p className="num font-display text-3xl font-extrabold leading-none">{value}</p>
      <p className="mt-1 text-xs leading-snug text-ink-mute">{label}</p>
    </div>
  );
}
