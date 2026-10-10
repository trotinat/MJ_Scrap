import Link from "next/link";
import { Bell } from "lucide-react";
import { telegramConfigFromEnv, EVENT_LABELS } from "@mdw/notifications";
import { Badge, btn, Card, EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/buttons";
import { listNotifications } from "@/lib/queries";
import { formatMad, formatMoroccoTime, NOTIF_STATUS_LABELS } from "@/lib/format";
import { retryNotificationAction } from "./actions";
import { TestNotificationForm } from "./test-form";

export const metadata = { title: "Alertes" };

const STATUSES = ["pending", "sending", "sent", "failed", "dead"] as const;

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status: rawStatus } = await searchParams;
  const status = STATUSES.find((s) => s === rawStatus);
  const rows = await listNotifications(status);
  const configured = telegramConfigFromEnv() !== null;

  return (
    <>
      <PageHeader
        title="Alertes"
        description="Les bons plans de vos recherches, envoyés sur Telegram. Un même bon plan n'est jamais envoyé deux fois."
        actions={configured ? <TestNotificationForm /> : undefined}
      />

      {!configured && (
        <section className="mb-8 rounded-3xl bg-ink p-5 text-white sm:p-7">
          <h2 className="font-display text-2xl font-bold">Activez les alertes sur votre téléphone</h2>
          <p className="mt-1 max-w-xl text-sm text-white/75">
            Les alertes sont déjà prêtes : elles partiront dès que Telegram sera relié. Comptez 3 minutes.
          </p>
          <ol className="mt-5 grid gap-3 md:grid-cols-3">
            <Step n={1} title="Créez votre robot">
              Dans Telegram, ouvrez <b>@BotFather</b>, envoyez <code className="rounded bg-white/10 px-1">/newbot</code> et suivez les questions. Copiez le
              jeton qu&apos;il vous donne.
            </Step>
            <Step n={2} title="Trouvez votre identifiant">
              Envoyez « bonjour » à votre robot, puis ouvrez dans le navigateur{" "}
              <code className="break-all rounded bg-white/10 px-1">api.telegram.org/bot&lt;jeton&gt;/getUpdates</code> : votre identifiant est le
              nombre après <code className="rounded bg-white/10 px-1">&quot;chat&quot;:{"{"}&quot;id&quot;:</code>
            </Step>
            <Step n={3} title="Collez-les dans .env">
              Dans le dossier <b>MJ_Scrap</b>, ouvrez le fichier <code className="rounded bg-white/10 px-1">.env</code> et remplissez{" "}
              <code className="rounded bg-white/10 px-1">TELEGRAM_BOT_TOKEN=</code> et <code className="rounded bg-white/10 px-1">TELEGRAM_CHAT_ID=</code>, puis
              relancez l&apos;application.
            </Step>
          </ol>
        </section>
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
                        <Link href={`/produits/${offerId}`} className="line-clamp-2 hover:text-ink">
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
                      {n.status === "sent" && <span className="text-ink-mute">Envoyée {formatMoroccoTime(n.sentAt)} · message #{n.telegramMessageId}</span>}
                      {n.status === "failed" && <span className="text-ink">Prochain essai {formatMoroccoTime(n.nextAttemptAt)}</span>}
                      {n.lastError && n.status !== "sent" && <p className="mt-1 break-words text-promo">{n.lastError}</p>}
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

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-tag font-display font-bold text-ink">{n}</span>
      <p className="mt-3 font-display font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-white/75">{children}</p>
    </li>
  );
}
