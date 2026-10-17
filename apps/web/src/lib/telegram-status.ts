import 'server-only';
import { eq } from 'drizzle-orm';
import { applicationSettings, countActiveSubscribers, getDb } from '@mdw/database';

export async function telegramStatus() {
  const configured = Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
  const [row] = await getDb().select().from(applicationSettings).where(eq(applicationSettings.key, 'telegram_health')).limit(1);
  const health = row?.value as {state?: string; at?: string; username?: string} | undefined;
  const alive = Boolean(health?.at && Date.now() - new Date(health.at).getTime() < 90_000);
  const subscribers = await countActiveSubscribers(getDb());
  return {configured, subscribers, username: health?.username, ready: configured && alive && health?.state === 'ready' && subscribers > 0,
    label: !configured ? 'À configurer' : !alive ? 'Connexion à vérifier' : health?.state !== 'ready' ? 'Reconnexion en cours' : subscribers === 0 ? 'Ouvrez le bot et envoyez /start' : 'Alertes connectées'};
}
