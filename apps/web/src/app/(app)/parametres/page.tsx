import { getAppSettings, getDb, getNotificationSettings } from "@mdw/database";
import { DEFAULT_SCRAPE_TIMES, nextScheduledRuns } from "@mdw/shared";
import { Card, PageHeader } from "@/components/ui";
import { formatMoroccoTime } from "@/lib/format";
import { AppSettingsForm, NotificationSettingsForm, PasswordForm } from "./settings-forms";

export const metadata = { title: "Paramètres" };

export default async function SettingsPage() {
  const db = getDb();
  const [settings, ns] = await Promise.all([getAppSettings(db), getNotificationSettings(db)]);
  const times = process.env.SCRAPE_TIMES ?? DEFAULT_SCRAPE_TIMES;
  const next = nextScheduledRuns(times, 4);
  return (
    <>
      <PageHeader title="Paramètres" />
      <div className="space-y-6">
        <Card title="Planification">
          <p className="text-sm text-ink-soft">
            Collectes automatiques à <strong>{times.replace(",", " et ")}</strong>, fuseau <strong>Africa/Casablanca</strong> (changements d&apos;heure du Ramadan inclus).
            L&apos;horaire est défini par la variable <code>SCRAPE_TIMES</code> du worker.
          </p>
          <p className="mt-2 text-sm text-ink-mute">Prochaines exécutions : {next.map((d) => formatMoroccoTime(d)).join(" · ")}</p>
        </Card>
        <AppSettingsForm settings={settings} />
        <NotificationSettingsForm ns={ns} />
        <PasswordForm />
      </div>
    </>
  );
}
