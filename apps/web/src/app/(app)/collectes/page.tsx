import { desc, inArray } from "drizzle-orm";
import { History, Play } from "lucide-react";
import { getDb, runRequests } from "@mdw/database";
import { NoCriteriaBanner } from "@/components/no-criteria-banner";
import { Badge, Card, EmptyState, PageHeader, type Tone } from "@/components/ui";
import { SubmitButton } from "@/components/buttons";
import { listRuns } from "@/lib/queries";
import { durationLabel, formatMoroccoTime, RUN_STATUS_LABELS, RUN_TRIGGER_LABELS } from "@/lib/format";
import { requestRunAction } from "./actions";

export const metadata = { title: "Historique des collectes" };

const TONE: Record<string, Tone> = { success: "green", partial: "amber", failed: "red", running: "blue", skipped: "slate", interrupted: "amber" };

export default async function RunsPage() {
  const [runs, pending] = await Promise.all([
    listRuns(60),
    getDb().select().from(runRequests).where(inArray(runRequests.status, ["pending", "picked"])).orderBy(desc(runRequests.createdAt)).limit(1),
  ]);

  return (
    <>
      <PageHeader
        title="Historique des collectes"
        description="Collectes planifiées à 09:00 et 18:00 (heure du Maroc), manuelles et de rattrapage après une interruption."
        actions={
          <form action={requestRunAction}>
            <SubmitButton pendingLabel="Demande…">
              <Play className="h-4 w-4" /> Lancer une collecte maintenant
            </SubmitButton>
          </form>
        }
      />
      <NoCriteriaBanner />
      {pending[0] && (
        <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
          Collecte manuelle demandée à {formatMoroccoTime(pending[0].createdAt)} — {pending[0].status === "pending" ? "en attente de prise en charge par le worker (≈15 s)." : "en cours d'exécution."}
        </div>
      )}
      {runs.length === 0 ? (
        <EmptyState icon={History} title="Aucune collecte pour l'instant" />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Début</th>
                  <th>Type</th>
                  <th>Statut</th>
                  <th>Durée</th>
                  <th>Pages / fiches</th>
                  <th>Détails produits</th>
                  <th>Nouveautés</th>
                  <th>Baisses</th>
                  <th>Correspondances</th>
                  <th>Alertes</th>
                  <th>Erreurs</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{formatMoroccoTime(r.startedAt)}</td>
                    <td>{RUN_TRIGGER_LABELS[r.trigger]}</td>
                    <td>
                      <Badge tone={TONE[r.status] ?? "slate"}>{RUN_STATUS_LABELS[r.status]}</Badge>
                    </td>
                    <td className="whitespace-nowrap">{durationLabel(r.durationMs)}</td>
                    <td>
                      {r.stats.listingPagesFetched ?? 0} / {r.stats.cardsSeen ?? 0}
                    </td>
                    <td>
                      {r.stats.detailFetches ?? 0}
                      {(r.stats.detailFailures ?? 0) > 0 && <span className="text-rose-600"> ({r.stats.detailFailures} échecs)</span>}
                    </td>
                    <td>{r.stats.newOffers ?? 0}</td>
                    <td>{r.stats.priceDrops ?? 0}</td>
                    <td>{r.stats.matches ?? 0}</td>
                    <td>
                      {r.stats.notificationsQueued ?? 0} / {r.stats.notificationsSent ?? 0} env.
                    </td>
                    <td className="min-w-[16rem] text-xs">
                      {r.errorSummary && <p className={r.status === "failed" ? "text-rose-700" : "text-amber-800"}>{r.errorSummary}</p>}
                      {r.errors.length > 0 && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-slate-500">{r.errors.length} erreur(s)</summary>
                          <ul className="mt-1 space-y-1">
                            {r.errors.slice(0, 30).map((e) => (
                              <li key={e.id} className="break-words">
                                <span className="font-medium">{e.stage}</span>
                                {e.httpStatus ? ` · HTTP ${e.httpStatus}` : ""} — {e.message}
                                {e.url && <span className="block text-slate-400">{e.url}</span>}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
