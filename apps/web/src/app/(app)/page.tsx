import Link from "next/link";
import { Bell, CalendarClock, CheckCircle2, Package, Search, Sparkles, Target, TrendingDown } from "lucide-react";
import { getAppSettings, getDb } from "@mdw/database";
import { Badge, Card, EmptyState, PageHeader, ProductImage, ScoreBadge, StatCard, FreshnessBadge, btn } from "@/components/ui";
import { dashboardStats, listDeals } from "@/lib/queries";
import { formatMad, formatMoroccoTime, formatPct, NOTIF_STATUS_LABELS, relativeTime, RUN_STATUS_LABELS, RUN_TRIGGER_LABELS } from "@/lib/format";

export const metadata = { title: "Tableau de bord" };

const decodeHtml = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

export default async function DashboardPage() {
  const [s, top, settings] = await Promise.all([dashboardStats(), listDeals({ sort: "score", pageSize: 6 }), getAppSettings(getDb())]);
  const running = s.worker?.currentRunId ? true : s.lastRun?.status === "running";
  const ns = s.notifStats;

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        description="Vue d'ensemble de la surveillance des promotions Marjane Mall (heure du Maroc)."
        actions={
          <Link href="/criteres/nouveau" className={btn.primary}>
            <Search className="h-4 w-4" /> Nouveau critère
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Produits surveillés" value={s.offers} icon={Package} hint="Offres actives en base" />
        <StatCard label="Critères actifs" value={s.activeCriteria} icon={Search} tone="blue" />
        <StatCard label="Nouvelles offres (24 h)" value={s.newDeals24h} icon={Sparkles} tone="green" hint="Correspondances apparues" />
        <StatCard label="Prix cibles atteints" value={s.targetReached} icon={Target} tone="green" />
        <StatCard label="Baisses ≥ 5 % (24 h)" value={s.drops24h} icon={TrendingDown} tone="amber" hint="Calculées sur nos relevés" />
        <StatCard
          label="Dernière collecte réussie"
          value={s.lastSuccess ? relativeTime(s.lastSuccess.startedAt) : "jamais"}
          icon={CheckCircle2}
          tone={s.lastSuccess ? "green" : "red"}
          hint={s.lastSuccess ? formatMoroccoTime(s.lastSuccess.startedAt) : "Aucune collecte réussie"}
        />
        <StatCard
          label="Prochaine collecte"
          value={s.nextRun ? formatMoroccoTime(s.nextRun).split(", ")[1] ?? formatMoroccoTime(s.nextRun) : "—"}
          icon={CalendarClock}
          tone="blue"
          hint={s.nextRun ? formatMoroccoTime(s.nextRun) : "Planificateur inactif"}
        />
        <StatCard
          label="Telegram (7 jours)"
          value={`${ns.sent ?? 0} envoyée(s)`}
          icon={Bell}
          tone={(ns.dead ?? 0) > 0 ? "red" : (ns.failed ?? 0) + (ns.pending ?? 0) > 0 ? "amber" : "green"}
          hint={`${(ns.pending ?? 0) + (ns.failed ?? 0)} en attente · ${ns.dead ?? 0} abandonnée(s)`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="État du système" className="lg:col-span-1">
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500">Worker</dt>
              <dd>{s.workerAlive ? <Badge tone="green">Actif</Badge> : <Badge tone="red">Pas de signal</Badge>}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500">Collecte en cours</dt>
              <dd>{running ? <Badge tone="blue">En cours</Badge> : <Badge>Aucune</Badge>}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500">Dernière collecte</dt>
              <dd className="text-right">
                {s.lastRun ? (
                  <>
                    <Badge tone={s.lastRun.status === "success" ? "green" : s.lastRun.status === "failed" ? "red" : "amber"}>{RUN_STATUS_LABELS[s.lastRun.status]}</Badge>
                    <span className="ml-2 text-xs text-slate-500">{RUN_TRIGGER_LABELS[s.lastRun.trigger]}</span>
                  </>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            {s.lastRun?.errorSummary && <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">{s.lastRun.errorSummary}</p>}
          </dl>
          <Link href="/collectes" className={`${btn.secondary} mt-4 w-full`}>
            Historique des collectes
          </Link>
        </Card>

        <Card title="Notifications récentes" className="lg:col-span-2" actions={<Link href="/notifications" className={btn.ghost}>Tout voir</Link>}>
          {s.recentNotifs.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune notification pour le moment.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {s.recentNotifs.map((n) => (
                <li key={n.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="truncate text-slate-700">{decodeHtml(n.payload.html.replace(/<[^>]+>/g, "").split("\n")[1] ?? n.eventType)}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge tone={n.status === "sent" ? "green" : n.status === "dead" ? "red" : "amber"}>{NOTIF_STATUS_LABELS[n.status]}</Badge>
                    <span className="text-xs text-slate-500">{relativeTime(n.createdAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Meilleures offres actuelles</h2>
          <Link href="/promotions" className={btn.ghost}>
            Toutes les promotions
          </Link>
        </div>
        {top.rows.length === 0 ? (
          <EmptyState icon={Sparkles} title="Aucune offre correspondante pour l'instant">
            Créez un critère de recherche, activez-le, puis attendez la prochaine collecte (ou lancez-en une depuis « Historique des collectes »).
          </EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {top.rows.map((d) => (
              <Link key={d.offer_id} href={`/produits/${d.offer_id}`} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm hover:border-brand-500">
                <ProductImage src={d.image_url} alt={d.title} className="h-20 w-20 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium text-slate-900">{d.title}</p>
                  <p className="mt-1 text-sm font-semibold text-brand-700">
                    {formatMad(d.current_price_cents)}
                    {d.drop_pct !== null && d.drop_pct < 0 && <span className="ml-2 text-xs font-medium text-emerald-700">{formatPct(d.drop_pct)}</span>}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <ScoreBadge score={d.score} dealClass={d.matches[0]?.dealClass ?? "ordinary"} />
                    <FreshnessBadge at={d.last_success_at} staleAfterHours={settings.staleAfterHours} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
