import Link from "next/link";
import { Bell } from "lucide-react";
import { telegramConfigFromEnv, EVENT_LABELS } from "@mdw/notifications";
import { Badge, btn, Card, EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/buttons";
import { listNotifications } from "@/lib/queries";
import { formatMad, formatMoroccoTime, NOTIF_STATUS_LABELS } from "@/lib/format";
import { retryNotificationAction } from "./actions";
import { TestNotificationForm } from "./test-form";

export const metadata = { title: "Notifications Telegram" };

const STATUSES = ["pending", "sending", "sent", "failed", "dead"] as const;

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status: rawStatus } = await searchParams;
  const status = STATUSES.find((s) => s === rawStatus);
  const rows = await listNotifications(status);
  const configured = telegramConfigFromEnv() !== null;

  return (
    <>
      <PageHeader title="Notifications Telegram" description="Chaque alerte est enregistrée avant envoi ; un même événement n'est jamais envoyé deux fois." actions={<TestNotificationForm />} />

      {!configured && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Telegram n&apos;est pas configuré : renseignez <code>TELEGRAM_BOT_TOKEN</code> et <code>TELEGRAM_CHAT_ID</code> dans le fichier <code>.env</code> du serveur (voir docs/TELEGRAM.md). Les alertes restent en file d&apos;attente en attendant.
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href="/notifications" className={!status ? btn.primary : btn.secondary}>
          Toutes
        </Link>
        {STATUSES.map((s) => (
          <Link key={s} href={`/notifications?status=${s}`} className={status === s ? btn.primary : btn.secondary}>
            {NOTIF_STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Bell} title="Aucune notification" />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Créée</th>
                  <th>Événement</th>
                  <th>Produit</th>
                  <th>Critère</th>
                  <th>Prix</th>
                  <th>Statut</th>
                  <th>Essais</th>
                  <th>Détails</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ n, criterionName, offerTitle, offerId }) => (
                  <tr key={n.id}>
                    <td className="whitespace-nowrap">{formatMoroccoTime(n.createdAt)}</td>
                    <td className="whitespace-nowrap">{EVENT_LABELS[n.eventType]}</td>
                    <td className="max-w-xs">
                      {offerId ? (
                        <Link href={`/produits/${offerId}`} className="line-clamp-2 hover:text-brand-700">
                          {offerTitle}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{criterionName ?? "—"}</td>
                    <td className="whitespace-nowrap">{formatMad(n.priceCents)}</td>
                    <td>
                      <Badge tone={n.status === "sent" ? "green" : n.status === "dead" ? "red" : "amber"}>{NOTIF_STATUS_LABELS[n.status]}</Badge>
                    </td>
                    <td>{n.attempts}</td>
                    <td className="max-w-xs text-xs">
                      {n.status === "sent" && <span className="text-slate-500">Envoyée {formatMoroccoTime(n.sentAt)} · message #{n.telegramMessageId}</span>}
                      {n.status === "failed" && <span className="text-amber-700">Prochain essai {formatMoroccoTime(n.nextAttemptAt)}</span>}
                      {n.lastError && n.status !== "sent" && <p className="mt-1 break-words text-rose-600">{n.lastError}</p>}
                      {(n.status === "dead" || n.status === "failed") && (
                        <form action={retryNotificationAction} className="mt-1">
                          <input type="hidden" name="id" value={n.id} />
                          <SubmitButton variant="ghost">Réessayer</SubmitButton>
                        </form>
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
