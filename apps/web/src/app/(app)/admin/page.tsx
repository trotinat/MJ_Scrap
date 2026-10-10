import { telegramConfigFromEnv } from "@mdw/notifications";
import { Badge, Card, PageHeader } from "@/components/ui";
import { systemHealth } from "@/lib/queries";
import { formatMoroccoTime, relativeTime } from "@/lib/format";

export const metadata = { title: "Administration et santé du système" };

const COUNT_LABELS: Record<string, string> = {
  products: "Produits",
  offers: "Offres",
  observations: "Relevés de prix",
  matches: "Correspondances",
  notifications: "Notifications",
  pending_notifications: "Notifications en attente",
  dead_notifications: "Notifications abandonnées",
  runs: "Collectes",
};

export default async function AdminPage() {
  const h = await systemHealth();
  const telegram = telegramConfigFromEnv() !== null;
  return (
    <>
      <PageHeader title="Administration et santé du système" description="État des composants. Aucun secret n'est affiché." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Base de données">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-mute">État</dt>
              <dd>{h.dbOk ? <Badge tone="green">Disponible</Badge> : <Badge tone="red">Injoignable</Badge>}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-mute">Latence</dt>
              <dd>{h.latencyMs} ms</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-mute">Taille</dt>
              <dd>{h.size || "—"}</dd>
            </div>
            <p className="pt-2 text-xs text-ink-mute">{h.version.split(" on ")[0]}</p>
          </dl>
        </Card>

        <Card title="Worker de collecte">
          {h.workers.length === 0 ? (
            <p className="text-sm text-promo">Aucun worker n&apos;a encore signalé sa présence.</p>
          ) : (
            h.workers.map((w) => {
              const alive = Date.now() - w.heartbeatAt.getTime() < 2 * 60_000;
              return (
                <dl key={w.id} className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-ink-mute">{w.id}</dt>
                    <dd>{alive ? <Badge tone="green">Actif</Badge> : <Badge tone="red">Silencieux</Badge>}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-mute">Dernier signal</dt>
                    <dd>{relativeTime(w.heartbeatAt)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-mute">Démarré</dt>
                    <dd>{formatMoroccoTime(w.startedAt)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-mute">Horaires</dt>
                    <dd>{w.scheduleTimes ?? "—"} (Africa/Casablanca)</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-mute">Prochaine collecte</dt>
                    <dd>{formatMoroccoTime(w.nextRunAt)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-mute">Collecte en cours</dt>
                    <dd>{w.currentRunId ? <Badge tone="blue">Oui</Badge> : "Non"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-mute">Version</dt>
                    <dd>{w.version ?? "—"}</dd>
                  </div>
                </dl>
              );
            })
          )}
        </Card>

        <Card title="Intégrations">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-mute">Telegram</dt>
              <dd>{telegram ? <Badge tone="green">Configuré</Badge> : <Badge tone="amber">Non configuré</Badge>}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-mute">Alertes</dt>
              <dd>{h.settings?.notificationsEnabled ? "Activées" : "Désactivées"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-mute">Délai entre requêtes</dt>
              <dd>{h.settings ? `${h.settings.requestDelayMs / 1000} s` : "—"}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Volumes">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {Object.entries(h.counts).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-paper p-3">
                <dt className="text-xs text-ink-mute">{COUNT_LABELS[k] ?? k}</dt>
                <dd className="text-lg font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card title="Dernières erreurs de collecte" className="lg:col-span-2">
          {h.recentErrors.length === 0 ? (
            <p className="text-sm text-ink-mute">Aucune erreur enregistrée.</p>
          ) : (
            <div className="max-h-96 overflow-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Étape</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {h.recentErrors.map((e) => (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap">{formatMoroccoTime(e.createdAt)}</td>
                      <td>
                        {e.stage}
                        {e.httpStatus ? ` (HTTP ${e.httpStatus})` : ""}
                      </td>
                      <td className="break-words text-xs">
                        {e.message}
                        {e.url && <span className="block text-ink-mute">{e.url}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card title="Commandes d'exploitation" className="mt-6">
        <pre className="overflow-x-auto rounded-lg bg-ink p-4 text-xs leading-relaxed text-paper">{`docker compose ps                                   # état des services
docker compose logs -f worker                       # journaux du worker
docker compose run --rm migrate node dist/cli.js run-now   # collecte immédiate
docker compose run --rm migrate node dist/cli.js probe     # validation en direct du scraper
./scripts/backup.sh                                 # sauvegarde manuelle
./scripts/restore.sh backups/<fichier>.dump         # restauration`}</pre>
      </Card>
    </>
  );
}
