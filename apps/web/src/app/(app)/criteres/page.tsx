import Link from "next/link";
import { ArrowUpRight, Copy, Pencil, Plus, Sparkles, Store } from "lucide-react";
import { getDb, getUserProfile, listCriteria, listUserShops } from "@mdw/database";
import { requireUser } from "@/lib/session";
import { profileIsEmpty, RECOMMENDED_CRITERIA } from "@mdw/shared";
import { formatMad, madToCents, NOTIFY_MODE_LABELS } from "@mdw/shared";
import { Badge, btn, EmptyState, PageHeader } from "@/components/ui";
import { DeleteButton } from "@/components/delete-button";
import { SubmitButton } from "@/components/buttons";
import { criteriaSummaries } from "@/lib/queries";
import { relativeTime } from "@/lib/format";
import { deleteCriterionAction, duplicateCriterionAction, seedRecommendedAction, toggleCriterionAction } from "./actions";
import { QuickAddFromUrl } from "./quick-add";

export const metadata = { title: "Mes recherches" };

type SearchParams = Promise<{ shop?: string | string[] }>;

export default async function CriteriaPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const [criteria, summaries, profile, shops, params] = await Promise.all([
    listCriteria(getDb(), { userId: user.id }), criteriaSummaries(), getUserProfile(getDb(), user.id),
    listUserShops(getDb(), user.id), searchParams,
  ]);
  const hasProfile = !profileIsEmpty(profile);
  const shopParam = Array.isArray(params.shop) ? params.shop[0] : params.shop;
  const selectedShop = shops.some((shop) => shop.id === shopParam) ? shopParam : undefined;
  const names = new Set(criteria.map((c) => c.name.trim().toLowerCase()));
  const missingPresets = RECOMMENDED_CRITERIA.filter((c) => !names.has(c.name.trim().toLowerCase()));
  const allowed = new Set(shops.map((shop) => shop.id));
  const unavailable = criteria.filter((c) => !allowed.has(c.shopId));
  const visibleCriteria = selectedShop ? criteria.filter((c) => c.shopId === selectedShop) : criteria;
  const hrefFor = (shopId?: string) => shopId ? `/criteres?${new URLSearchParams({ shop: shopId })}` : "/criteres";
  const newFor = (shopId?: string) => shopId ? `/criteres/nouveau?${new URLSearchParams({ shop: shopId })}` : "/criteres/nouveau";

  return (
    <>
      <PageHeader
        title="Mes recherches"
        description="Retrouvez vos alertes par boutique. Chaque recherche utilise les rayons et filtres propres au magasin choisi."
        actions={<Link href={newFor(selectedShop)} className={btn.primary}><Plus className="h-4 w-4" /> Nouvelle recherche</Link>}
      />

      <section className="mb-6 rounded-2xl border border-paper-line bg-paper-card p-4 card-soft sm:p-5" aria-label="Recherches par boutique">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-display text-base font-semibold text-ink">Vos boutiques</p>
            <p className="mt-0.5 text-sm text-ink-mute">Choisissez un magasin pour voir ses recherches et ses filtres.</p>
          </div>
          <span className="text-xs font-medium text-ink-mute">{criteria.length} recherche{criteria.length === 1 ? "" : "s"} · {shops.length} boutique{shops.length === 1 ? "" : "s"}</span>
        </div>
        <nav className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Filtrer par boutique">
          <Link href={hrefFor()} aria-current={!selectedShop ? "page" : undefined} className={`min-h-11 shrink-0 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tag ${!selectedShop ? "border-ink bg-ink text-white" : "border-paper-line bg-paper text-ink-soft hover:border-brand-300"}`}>
            Toutes <span className="ml-1 opacity-75">{criteria.length}</span>
          </Link>
          {shops.map((shop) => {
            const count = criteria.filter((c) => c.shopId === shop.id).length;
            const active = selectedShop === shop.id;
            return <Link key={shop.id} href={hrefFor(shop.id)} aria-current={active ? "page" : undefined} className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tag ${active ? "border-brand-600 bg-brand-50 text-brand-800" : "border-paper-line bg-paper text-ink-soft hover:border-brand-300"}`}>
              <Store className="h-4 w-4" aria-hidden /> {shop.name} <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs">{count}</span>
            </Link>;
          })}
        </nav>
      </section>

      {shops.some((shop) => shop.id === "marjane-mall") && (!selectedShop || selectedShop === "marjane-mall") && (
        <details className="group mb-6 overflow-hidden rounded-2xl border border-paper-line bg-paper-card card-soft">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-tag sm:px-5">
            <span className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-tag-soft text-tag-deep"><Sparkles className="h-4 w-4" aria-hidden /></span><span><span className="block text-sm font-semibold text-ink">Création rapide · Marjane Mall</span><span className="block text-xs text-ink-mute">Démarrer depuis un rayon ou un lien filtré</span></span></span>
            <span className="shrink-0 text-sm font-semibold text-brand-700 group-open:hidden">Ouvrir</span><span className="hidden shrink-0 text-sm font-semibold text-brand-700 group-open:inline">Fermer</span>
          </summary>
          <div className="border-t border-paper-line p-3 sm:p-4"><QuickAddFromUrl hasProfile={hasProfile} /></div>
        </details>
      )}

      {missingPresets.length > 0 && !selectedShop && (
        <div className="mb-6 rounded-xl border border-brand-100 bg-brand-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="flex items-center gap-2 text-sm font-semibold text-ink"><Sparkles className="h-4 w-4" /> Critères recommandés</p><p className="mt-1 text-sm text-ink-soft">{missingPresets.map((c) => c.name).join(" · ")}</p></div>
            <form action={seedRecommendedAction}><SubmitButton pendingLabel="Ajout…">Ajouter et lancer une collecte</SubmitButton></form>
          </div>
        </div>
      )}

      {shops.length === 0 ? <EmptyState icon={Store} title="Aucune boutique disponible"><p>Les boutiques activées pour votre compte apparaîtront ici.</p></EmptyState> : (
        <div className="space-y-8">
          {(selectedShop ? shops.filter((shop) => shop.id === selectedShop) : shops).map((shop) => {
            const group = visibleCriteria.filter((c) => c.shopId === shop.id);
            const matches = group.reduce((sum, c) => sum + (summaries.get(c.id)?.matches ?? 0), 0);
            const activeCount = group.filter((c) => c.enabled).length;
            return <section key={shop.id} aria-labelledby={`shop-${shop.id}`}>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div><h2 id={`shop-${shop.id}`} className="flex items-center gap-2 font-display text-xl font-bold text-ink"><Store className="h-5 w-5 text-brand-700" aria-hidden />{shop.name}</h2><p className="mt-1 text-sm text-ink-mute">{activeCount} active{activeCount === 1 ? "" : "s"} · {matches} offre{matches === 1 ? "" : "s"} correspondante{matches === 1 ? "" : "s"}</p></div>
                <Link href={newFor(shop.id)} className={`${btn.secondary} min-h-11`}><Plus className="h-4 w-4" /> Recherche pour {shop.name}</Link>
              </div>
              {group.length === 0 ? <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-dashed border-paper-line bg-paper-card p-5 sm:flex-row sm:items-center"><div><p className="font-semibold text-ink">Aucune recherche pour {shop.name}</p><p className="mt-1 text-sm text-ink-mute">Créez une recherche avec les critères et rayons disponibles dans cette boutique.</p></div><Link href={newFor(shop.id)} className={btn.primary}><Plus className="h-4 w-4" /> Créer ma première recherche</Link></div> : <div className="grid gap-3 xl:grid-cols-2">
                {group.map((c) => {
                  const s = summaries.get(c.id); const f = c.filters;
                  return <article key={c.id} className="flex min-w-0 flex-col rounded-2xl border border-paper-line bg-paper-card p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link href={`/criteres/${c.id}`} className="break-words text-base font-semibold text-ink hover:text-brand-700">{c.name}</Link>{c.description && <p className="mt-1 line-clamp-2 text-sm text-ink-mute">{c.description}</p>}</div>{c.enabled ? <Badge tone="green">Active</Badge> : <Badge>Désactivée</Badge>}</div>
                    <div className="mt-3 flex flex-wrap gap-1.5 text-xs">{[...f.keywords, ...f.altKeywords].slice(0, 5).map((k) => <Badge key={k} tone="blue">{k}</Badge>)}{(f.minPrice !== null || f.maxPrice !== null) && <Badge>{f.minPrice !== null ? formatMad(madToCents(f.minPrice)) : "0"} – {f.maxPrice !== null ? formatMad(madToCents(f.maxPrice)) : "∞"}</Badge>}{f.targetPrice !== null && <Badge tone="green">Cible {formatMad(madToCents(f.targetPrice))}</Badge>}{f.mandatorySpecs.length > 0 && <Badge tone="amber">{f.mandatorySpecs.length} exigence(s)</Badge>}</div>
                    <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-lg bg-paper p-2"><dt className="text-ink-mute">Offres</dt><dd className="text-lg font-semibold text-ink">{s?.matches ?? 0}</dd></div><div className="rounded-lg bg-paper p-2"><dt className="text-ink-mute">Meilleure note</dt><dd className="text-lg font-semibold text-ink">{s?.best_score ?? "—"}</dd></div><div className="rounded-lg bg-paper p-2"><dt className="text-ink-mute">Dernière alerte</dt><dd className="pt-1 text-sm font-medium text-ink">{s?.last_notified ? relativeTime(s.last_notified) : "—"}</dd></div></dl>
                    <p className="mt-3 text-xs text-ink-mute">Notifications : {NOTIFY_MODE_LABELS[c.notifyMode]} · score ≥ {c.notifyMinScore}</p>
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-paper-line pt-4"><Link href={`/criteres/${c.id}/modifier`} className={`${btn.secondary} min-h-11`}><Pencil className="h-4 w-4" /> Modifier</Link><form action={duplicateCriterionAction}><input type="hidden" name="id" value={c.id} /><SubmitButton variant="secondary"><Copy className="h-4 w-4" /> Dupliquer</SubmitButton></form><form action={toggleCriterionAction}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="enabled" value={String(!c.enabled)} /><SubmitButton variant="secondary">{c.enabled ? "Désactiver" : "Activer"}</SubmitButton></form><form action={deleteCriterionAction}><input type="hidden" name="id" value={c.id} /><DeleteButton message={`Supprimer définitivement la recherche « ${c.name} » et ses résultats personnels ?`} /></form><Link href={`/criteres/${c.id}`} className="ml-auto inline-flex min-h-11 items-center gap-1 px-2 text-sm font-semibold text-brand-700">Résultats <ArrowUpRight className="h-4 w-4" aria-hidden /></Link></div>
                  </article>;
                })}
              </div>}
            </section>;
          })}
        </div>
      )}

      {unavailable.length > 0 && !selectedShop && <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-4"><h2 className="font-semibold text-ink">Recherches d’une boutique indisponible</h2><p className="mt-1 text-sm text-ink-soft">Ces recherches restent visibles, mais leur boutique n’est pas activée pour ce compte.</p><div className="mt-3 flex flex-wrap gap-2">{unavailable.map((c) => <Link key={c.id} href={`/criteres/${c.id}`} className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-ink">{c.name}</Link>)}</div></section>}
    </>
  );
}
