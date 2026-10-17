import Link from "next/link";
import { ArrowUpRight, BellRing, CheckCheck, Search, ShieldCheck, TrendingDown, Zap, Radar } from "lucide-react";
import { getDb, getUserSettings, listCriteria } from "@mdw/database";
import { requireUser } from "@/lib/session";
import { profileHighlights, type DealClass, type ShopperProfile } from "@mdw/shared";
import { telegramStatus } from "@/lib/telegram-status";
import { CheckNowButton } from "@/components/check-now-button";
import { DealCard, dealGrid, type DealCardData } from "@/components/deal-card";
import { btn, EmptyState } from "@/components/ui";
import { criteriaSummaries, dashboardStats, flashOffers, weeklyOffers, listDeals, type DealRow, type FlashRow } from "@/lib/queries";
import { formatMoroccoTime, relativeTime } from "@/lib/format";
import { pickVaried } from "@/lib/varied-selection";

export const metadata = { title: "Bons plans" };

const fromDeal = (d: DealRow, profile: ShopperProfile): DealCardData => ({
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
  highlights: profileHighlights({ brand: d.brand, title: d.title, seller: d.seller, priceCents: d.current_price_cents, discountPct: d.advertised_discount_pct }, profile),
});

const fromFlash = (r: FlashRow, profile: ShopperProfile): DealCardData => ({
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
  observedAt: r.last_seen_at,
  matches: r.matches,
  highlights: profileHighlights({ rawSpecs: r.raw_specs, categoryPath: r.category_path, brand: r.brand, title: r.title, seller: r.seller, priceCents: r.current_price_cents, discountPct: r.advertised_discount_pct }, profile),
});

/** Time only ("18:00") for today, full date otherwise. */
function when(d: Date): string {
  const full = formatMoroccoTime(d);
  const today = formatMoroccoTime(new Date()).split(",")[0];
  return full.startsWith(today ?? "\u0000") ? (full.split(", ")[1] ?? full) : full;
}


export default async function HomePage() {
  const user = await requireUser();
  const settings = await getUserSettings(getDb(), user.id);
  const [s, deals, criteria, summaries, telegram, flash, week] = await Promise.all([
    dashboardStats(), listDeals({ sort: "score", pageSize: 160 }), listCriteria(getDb(), { userId: user.id }), criteriaSummaries(), telegramStatus(),
    flashOffers("/ventes-flash", { sort: "discount" }).catch(() => []),
    weeklyOffers(settings.dealPagePaths,{includeCampaigns:true}).catch(() => []),
  ]);
  const running = s.lastRun?.status === 'running' || (s.workerAlive && Boolean(s.worker?.currentRunId));
  const active = criteria.filter(c => c.enabled);
  const personal = pickVaried(deals.rows, 12, {
    id: d => d.offer_id,
    group: d => d.matches[0]?.id ?? d.category_path ?? "autres",
    brand: d => d.brand,
  });
  const [hero, ...rest] = personal;
  const shown = new Set(personal.map(d => d.offer_id));
  const discoveries = pickVaried([...new Map([...week, ...flash].map(r => [r.offer_id, r])).values()]
    .filter(r => !shown.has(r.offer_id))
    .filter(r => r.advertised_discount_pct !== null && Number(r.advertised_discount_pct) >= 20)
    .sort((a,b) => {
      const drop = (r: FlashRow) => r.previous_price_cents && r.current_price_cents < r.previous_price_cents ? (r.previous_price_cents-r.current_price_cents)/r.previous_price_cents : 0;
      return drop(b)-drop(a) || Number(b.advertised_discount_pct)-Number(a.advertised_discount_pct);
    }), 8, {
      id: r => r.offer_id,
      group: r => r.category_path?.split("?")[0]?.split("/").filter(Boolean).slice(0, 2).join("/") || "autres",
      brand: r => r.brand,
    }, 2);
  const drops = personal.filter(d => d.drop_pct !== null && d.drop_pct < 0).length;
  return (
    <>
      <section className="deal-hero relative mb-5 overflow-hidden rounded-[1.75rem] p-5 text-white sm:p-8">
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.18em] text-tag sm:mb-3"><Radar className="h-4 w-4" /> Votre radar de prix</p>
            <h1 className="font-display text-[1.7rem] font-extrabold leading-[1.08] sm:text-5xl">Les bons plans.<br /><span className="text-tag">Pour vous.</span></h1>
            <p className="mt-3 hidden max-w-lg text-sm text-white/80 sm:block">Vos critères d’abord. Des prix observés, des remises expliquées.</p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:pt-1">
            <Link href="/criteres" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-tag px-2 text-xs font-bold text-ink hover:bg-white sm:px-4 sm:text-sm"><Search className="hidden h-4 w-4 shrink-0 sm:block" /> Mes recherches</Link>
            <Link href="/profil" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/40 px-2 text-xs font-semibold text-white hover:bg-white/10 sm:px-4 sm:text-sm">Profil & tailles</Link>
          </div>
        </div>
        <div className="relative z-10 mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/25 pt-3 text-xs text-white/90 sm:mt-5">
          <span className="flex items-center gap-2"><span className={running ? "h-2 w-2 shrink-0 animate-pulse rounded-full bg-tag" : "h-2 w-2 shrink-0 rounded-full bg-tag"} /><span className="sm:hidden">{running ? "Collecte en cours" : !s.workerAlive ? "Veille hors ligne" : s.lastSuccess ? "Vu " + relativeTime(s.lastSuccess.finishedAt ?? s.lastSuccess.startedAt) : "Première collecte à venir"}</span><span className="hidden sm:inline">{running ? "Collecte en cours · les offres arrivent progressivement" : !s.workerAlive ? "Veille hors ligne · démarrez le worker pour actualiser" : s.lastSuccess ? "Dernière collecte " + relativeTime(s.lastSuccess.finishedAt ?? s.lastSuccess.startedAt) : "Prêt pour votre première collecte"}</span></span>
          <CheckNowButton label="Actualiser" />
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><p className="section-eyebrow">SÉLECTION PERSONNELLE</p><h2 className="mt-1 font-display text-2xl font-extrabold sm:text-3xl">Repérés pour vous</h2><p className="mt-2 text-sm text-ink-mute">{active.length} recherche{active.length > 1 ? "s" : ""} active{active.length > 1 ? "s" : ""} · produits variés · prix récents</p></div>
          <Link href="/promotions" className={`${btn.secondary} hidden sm:inline-flex`}>Tous mes résultats <ArrowUpRight className="h-4 w-4" /></Link>
        </div>
        <nav aria-label="Résultats par recherche" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {active.filter(c => (summaries.get(c.id)?.matches ?? 0) > 0).map(c => (
            <Link key={c.id} href={`/promotions?criterionId=${c.id}`} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-paper-line bg-paper-card px-4 text-sm font-semibold text-ink-soft hover:border-brand-500 hover:text-brand-700">
              {c.name.replace(/^Mode Homme\s*–\s*/, "").split(/[–·(]/)[0]?.trim()} <span className="num text-xs text-brand-600">{summaries.get(c.id)?.matches}</span>
            </Link>
          ))}
        </nav>
        {hero ? <>
          <div className="mb-4"><DealCard d={fromDeal(hero, settings.shopperProfile)} size="lg" /></div>
          <div className={dealGrid}>{rest.map(d => <DealCard key={d.offer_id} d={fromDeal(d, settings.shopperProfile)} />)}</div>
        </> : <div className="grid overflow-hidden rounded-3xl border border-paper-line bg-paper-card md:grid-cols-[1.2fr_1fr]">
          <div className="p-6 sm:p-8"><span className="mb-4 inline-flex rounded-2xl bg-proof-soft p-3 text-proof"><ShieldCheck className="h-7 w-7" /></span>
            <h3 className="font-display text-2xl font-bold">Le bon plan mérite d’être le bon produit.</h3>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-soft">Aucune offre récente ne vérifie tous vos critères pour le moment. Une taille ou un genre absent de la fiche ne suffit pas pour vous recommander un produit.</p>
            <Link href="/criteres" className={btn.primary + " mt-5"}>Voir mes critères <ArrowUpRight className="h-4 w-4" /></Link>
          </div>
          <div className="flex flex-col justify-center gap-4 border-t border-paper-line bg-paper/60 p-6 sm:p-8 md:border-l md:border-t-0">
            {[['01','Vos envies','Marques, budget, pointure : vos critères passent avant la remise.'],['02','Des faits','Une baisse mesurée est distinguée du prix barré annoncé.'],['03','Le bon moment','Une nouvelle correspondance peut déclencher une alerte.']].map(([n,title,text]) => <div key={n} className="flex gap-3"><span className="num mt-1 text-xs font-bold text-ink-mute">{n}</span><div><p className="text-sm font-bold">{title}</p><p className="mt-1 text-xs leading-relaxed text-ink-mute">{text}</p></div></div>)}
          </div>
        </div>}
      </section>

      <div className="home-facts mb-8 grid gap-3 sm:grid-cols-3">
        <Fact value={deals.total} label="offres récentes conformes" icon={<CheckCheck className="h-4 w-4" />} />
        <Fact value={drops} label="baisses mesurées dans cette sélection" icon={<TrendingDown className="h-4 w-4" />} />
        <Link href="/notifications" className="flex items-center gap-3 rounded-2xl border border-paper-line bg-paper-card p-5 transition hover:border-brand-500">
          <span className="rounded-xl bg-tag-soft p-3 text-ink"><BellRing className="h-5 w-5" /></span>
          <div><p className="text-sm font-bold">{telegram.label}</p><p className="mt-1 text-xs text-ink-mute">{telegram.ready ? "Vos recherches, directement sur Telegram" : "Voir la connexion et mes alertes"}</p></div><ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-ink-mute" />
        </Link>
      </div>

      {discoveries.length > 0 && <section className="mb-9">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="section-eyebrow">À EXPLORER</p><h2 className="mt-1 flex items-center gap-2 font-display text-2xl font-bold sm:text-3xl"><Zap className="h-6 w-6 text-tag-deep" /> Les promos du moment</h2><p className="mt-2 text-sm text-ink-mute">Des promotions filtrées selon votre profil, avec les produits du quotidien.</p></div><Link href="/ventes-flash" className={btn.ghost}>Explorer les promos <ArrowUpRight className="h-4 w-4" /></Link></div>
        <div className={dealGrid}>{discoveries.map(r => <DealCard key={r.offer_id} d={{...fromFlash(r,settings.shopperProfile), highlights:[]}} />)}</div>
      </section>}
      <div className="mb-6 flex flex-wrap gap-x-6 gap-y-2 rounded-2xl border border-paper-line bg-paper-card px-5 py-4 text-xs text-ink-mute"><span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-proof" /> Aucune taille devinée</span><span>Prix barrés : déclarations du vendeur</span><span>Historique : nos propres relevés</span><Link className="ml-auto font-semibold text-ink hover:underline" href="/collectes">Voir la qualité des collectes →</Link></div>
    </>
  );
}

function Fact({ value, label, icon }: { value: number; label: string; icon: React.ReactNode }) {
  return <div className="flex items-center gap-4 rounded-2xl border border-paper-line bg-paper-card p-5"><span className="rounded-xl bg-proof-soft p-3 text-proof">{icon}</span><div><p className="num font-display text-3xl font-bold leading-none">{value}</p><p className="mt-1.5 text-xs text-ink-mute">{label}</p></div></div>;
}
