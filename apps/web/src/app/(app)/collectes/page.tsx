import { desc, inArray } from "drizzle-orm";
import { History, RefreshCw } from "lucide-react";
import { getDb, runRequests } from "@mdw/database";
import { NoCriteriaBanner } from "@/components/no-criteria-banner";
import { Badge, EmptyState, PageHeader, type Tone } from "@/components/ui";
import { SubmitButton } from "@/components/buttons";
import { listRuns } from "@/lib/queries";
import { durationLabel, formatMoroccoTime, RUN_TRIGGER_LABELS } from "@/lib/format";
import { requestRunAction } from "./actions";

export const metadata = { title: "Collectes" };

const TONE: Record<string, Tone> = { success: "green", partial: "amber", failed: "red", running: "amber", skipped: "slate", interrupted: "slate" };
const STATUS: Record<string, string> = {
  running: "En cours",
  success: "Réussie",
  partial: "Réussie avec erreurs",
  failed: "Échec",
  skipped: "Ignorée",
  interrupted: "Interrompue",
};
/** Notes are known limitations, not failures. */
const NOTE_STAGES = new Set(["page-non-lisible"]);

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

export default async function RunsPage() {
  const [runs, pending] = await Promise.all([
    listRuns(60),
    getDb().select().from(runRequests).where(inArray(runRequests.status, ["pending", "picked"])).orderBy(desc(runRequests.createdAt)).limit(1),
  ]);

  return (
    <>
      <PageHeader
        title="Collectes"
        description="Les prix sont vérifiés à 09:00 et 18:00 (heure du Maroc), et rattrapés après une coupure."
        actions={
          <form action={requestRunAction}>
            <SubmitButton pendingLabel="Demandé…">
              <RefreshCw className="h-4 w-4" /> Vérifier maintenant
            </SubmitButton>
          </form>
        }
      />
      <NoCriteriaBanner />
      {pending[0] && (
        <div className="mb-4 rounded-2xl bg-tag-soft p-3 text-sm text-ink">
          {pending[0].status === "pending" ? "Vérification demandée : elle démarre dans quelques secondes." : "Vérification en cours…"}
        </div>
      )}
      {runs.length === 0 ? (
        <EmptyState icon={History} title="Aucune vérification pour l'instant">
          La première a lieu à la prochaine heure prévue, ou maintenant si vous cliquez sur « Vérifier maintenant ».
        </EmptyState>
      ) : (
        <ol className="flex flex-col gap-2">
          {runs.map((r) => {
            const errors = r.errors.filter((e) => !NOTE_STAGES.has(e.stage));
            const notes = r.errors.filter((e) => NOTE_STAGES.has(e.stage));
            const st = r.stats;
            return (
              <li key={r.id} className="rounded-2xl border border-paper-line bg-paper-card p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="num font-display font-semibold">{formatMoroccoTime(r.startedAt)}</span>
                  <Badge tone={TONE[r.status] ?? "slate"}>{STATUS[r.status] ?? r.status}</Badge>
                  <span className="text-xs text-ink-mute">
                    {RUN_TRIGGER_LABELS[r.trigger]}
                    {r.durationMs !== null && <>, {durationLabel(r.durationMs)}</>}
                  </span>
                </div>
                {r.status !== "skipped" && r.status !== "running" && (
                  <p className="num mt-1.5 text-sm text-ink-soft">
                    {plural(st.cardsSeen ?? 0, "produit lu", "produits lus")}, {plural(st.matches ?? 0, "bon plan", "bons plans")},{" "}
                    {plural(st.newOffers ?? 0, "nouveauté", "nouveautés")}, {plural(st.priceDrops ?? 0, "baisse de prix", "baisses de prix")}
                    {(st.notificationsQueued ?? 0) > 0 && <>, {plural(st.notificationsQueued ?? 0, "alerte", "alertes")}</>}
                  </p>
                )}
                {r.errorSummary && (r.status === "failed" || r.status === "skipped" || r.status === "interrupted") && (
                  <p className={`mt-1.5 text-sm ${r.status === "failed" ? "text-promo" : "text-ink-mute"}`}>{r.errorSummary.split(" | ")[0]}</p>
                )}
                {(errors.length > 0 || notes.length > 0) && (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-ink-mute">
                      {errors.length > 0 ? plural(errors.length, "erreur", "erreurs") : ""}
                      {errors.length > 0 && notes.length > 0 ? ", " : ""}
                      {notes.length > 0 ? plural(notes.length, "page non lisible", "pages non lisibles") : ""}
                    </summary>
                    <ul className="mt-2 space-y-1.5">
                      {[...errors, ...notes].slice(0, 30).map((e) => (
                        <li key={e.id} className="break-words text-ink-soft">
                          {e.url && <span className="block font-medium text-ink">{e.url}</span>}
                          {e.message}
                          {e.httpStatus ? ` (HTTP ${e.httpStatus})` : ""}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
