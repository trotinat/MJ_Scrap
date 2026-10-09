import Link from "next/link";
import { Copy, Pencil, Plus, Search } from "lucide-react";
import { getDb, listCriteria } from "@mdw/database";
import { formatMad, madToCents, NOTIFY_MODE_LABELS } from "@mdw/shared";
import { Badge, btn, EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/buttons";
import { criteriaSummaries } from "@/lib/queries";
import { relativeTime } from "@/lib/format";
import { duplicateCriterionAction, seedExamplesAction, toggleCriterionAction } from "./actions";
import { QuickAddFromUrl } from "./quick-add";

export const metadata = { title: "Mes critères de recherche" };

export default async function CriteriaPage() {
  const [criteria, summaries] = await Promise.all([listCriteria(getDb()), criteriaSummaries()]);
  return (
    <>
      <PageHeader
        title="Mes critères de recherche"
        description="Chaque critère est évalué indépendamment à chaque collecte. Les modifications sont prises en compte dès la collecte suivante, sans redémarrage."
        actions={
          <Link href="/criteres/nouveau" className={btn.primary}>
            <Plus className="h-4 w-4" /> Nouveau critère
          </Link>
        }
      />
      <div className="mb-6">
        <QuickAddFromUrl />
      </div>
      {criteria.length === 0 ? (
        <EmptyState icon={Search} title="Aucun critère de recherche">
          <p>Créez votre premier critère, ou ajoutez les trois exemples (Smart TV, ordinateur portable, accessoires auto) pour les adapter.</p>
          <form action={seedExamplesAction} className="mt-4">
            <SubmitButton variant="secondary">Ajouter les exemples (désactivés)</SubmitButton>
          </form>
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {criteria.map((c) => {
            const s = summaries.get(c.id);
            const f = c.filters;
            return (
              <div key={c.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/criteres/${c.id}`} className="text-base font-semibold text-slate-900 hover:text-brand-700">
                      {c.name}
                    </Link>
                    {c.description && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{c.description}</p>}
                  </div>
                  {c.enabled ? <Badge tone="green">Actif</Badge> : <Badge>Désactivé</Badge>}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                  {[...f.keywords, ...f.altKeywords].slice(0, 6).map((k) => (
                    <Badge key={k} tone="blue">
                      {k}
                    </Badge>
                  ))}
                  {(f.minPrice !== null || f.maxPrice !== null) && (
                    <Badge>
                      {f.minPrice !== null ? formatMad(madToCents(f.minPrice)) : "0"} – {f.maxPrice !== null ? formatMad(madToCents(f.maxPrice)) : "∞"}
                    </Badge>
                  )}
                  {f.targetPrice !== null && <Badge tone="green">Cible {formatMad(madToCents(f.targetPrice))}</Badge>}
                  {f.mandatorySpecs.length > 0 && <Badge tone="amber">{f.mandatorySpecs.length} exigence(s)</Badge>}
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-slate-50 p-2">
                    <dt className="text-slate-500">Correspondances</dt>
                    <dd className="text-lg font-semibold text-slate-900">{s?.matches ?? 0}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2">
                    <dt className="text-slate-500">Meilleur score</dt>
                    <dd className="text-lg font-semibold text-slate-900">{s?.best_score ?? "—"}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2">
                    <dt className="text-slate-500">Dernière alerte</dt>
                    <dd className="pt-1 text-sm font-medium text-slate-900">{s?.last_notified ? relativeTime(s.last_notified) : "—"}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-slate-500">Notifications : {NOTIFY_MODE_LABELS[c.notifyMode]} · score ≥ {c.notifyMinScore}</p>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  <Link href={`/criteres/${c.id}/modifier`} className={btn.secondary}>
                    <Pencil className="h-4 w-4" /> Modifier
                  </Link>
                  <form action={duplicateCriterionAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <SubmitButton variant="secondary">
                      <Copy className="h-4 w-4" /> Dupliquer
                    </SubmitButton>
                  </form>
                  <form action={toggleCriterionAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="enabled" value={String(!c.enabled)} />
                    <SubmitButton variant="secondary">{c.enabled ? "Désactiver" : "Activer"}</SubmitButton>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
