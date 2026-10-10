import Link from "next/link";
import { Copy, Pencil, Plus, Search, Sparkles } from "lucide-react";
import { getDb, listCriteria } from "@mdw/database";
import { RECOMMENDED_CRITERIA } from "@mdw/shared";
import { formatMad, madToCents, NOTIFY_MODE_LABELS } from "@mdw/shared";
import { Badge, btn, EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/buttons";
import { criteriaSummaries } from "@/lib/queries";
import { relativeTime } from "@/lib/format";
import { duplicateCriterionAction, seedExamplesAction, seedRecommendedAction, toggleCriterionAction } from "./actions";
import { QuickAddFromUrl } from "./quick-add";

export const metadata = { title: "Mes recherches" };

export default async function CriteriaPage() {
  const [criteria, summaries] = await Promise.all([listCriteria(getDb()), criteriaSummaries()]);
  const names = new Set(criteria.map((c) => c.name.trim().toLowerCase()));
  const missingPresets = RECOMMENDED_CRITERIA.filter((c) => !names.has(c.name.trim().toLowerCase()));
  return (
    <>
      <PageHeader
        title="Mes recherches"
        description="Ce que vous voulez suivre. Chaque recherche est vérifiée à chaque passage, et vos modifications comptent dès le suivant."
        actions={
          <Link href="/criteres/nouveau" className={btn.primary}>
            <Plus className="h-4 w-4" /> Nouvelle recherche
          </Link>
        }
      />
      <div className="mb-6">
        <QuickAddFromUrl />
      </div>
      {missingPresets.length > 0 && (
        <div className="mb-6 rounded-xl border border-brand-100 bg-brand-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Sparkles className="h-4 w-4 text-ink" /> Critères recommandés
              </p>
              <p className="mt-1 text-sm text-ink-soft">{missingPresets.map((c) => c.name).join(" · ")}</p>
            </div>
            <form action={seedRecommendedAction}>
              <SubmitButton pendingLabel="Ajout…">Ajouter {missingPresets.length > 1 ? `les ${missingPresets.length} critères` : "ce critère"} et lancer une collecte</SubmitButton>
            </form>
          </div>
        </div>
      )}
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
              <div key={c.id} className="flex flex-col rounded-2xl border border-paper-line bg-paper-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/criteres/${c.id}`} className="text-base font-semibold text-ink hover:text-ink">
                      {c.name}
                    </Link>
                    {c.description && <p className="mt-1 line-clamp-2 text-sm text-ink-mute">{c.description}</p>}
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
                  <div className="rounded-lg bg-paper p-2">
                    <dt className="text-ink-mute">Offres trouvées</dt>
                    <dd className="text-lg font-semibold text-ink">{s?.matches ?? 0}</dd>
                  </div>
                  <div className="rounded-lg bg-paper p-2">
                    <dt className="text-ink-mute">Meilleure note</dt>
                    <dd className="text-lg font-semibold text-ink">{s?.best_score ?? "—"}</dd>
                  </div>
                  <div className="rounded-lg bg-paper p-2">
                    <dt className="text-ink-mute">Dernière alerte</dt>
                    <dd className="pt-1 text-sm font-medium text-ink">{s?.last_notified ? relativeTime(s.last_notified) : "—"}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-ink-mute">Notifications : {NOTIFY_MODE_LABELS[c.notifyMode]} · score ≥ {c.notifyMinScore}</p>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-paper-line pt-4">
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
