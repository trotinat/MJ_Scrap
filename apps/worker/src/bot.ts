import {
  createDb,
  getBotUpdateOffset,
  getNotificationSettings,
  getSubscriber,
  listActiveSubscribers,
  listUserCriteria,
  registerSubscriber,
  setBotUpdateOffset,
  setSubscriberStatus,
  touchSubscriber,
  type Db,
} from "@mdw/database";
import { deliverToSubscribers, escapeHtml, formatTestMessage, TelegramBot, type TelegramMessage } from "@mdw/notifications";
import { formatMad, frNumber, type Criterion } from "@mdw/shared";
import { loadConfig } from "./config";
import { createLogger, type Logger } from "./logger";

const BOT_COMMANDS = [
  { command: "start", description: "Recevoir les alertes de vos recherches" },
  { command: "mes_recherches", description: "Voir vos recherches suivies" },
  { command: "statut", description: "État de votre abonnement" },
  { command: "pause", description: "Suspendre les alertes" },
  { command: "reprendre", description: "Reprendre les alertes" },
  { command: "test", description: "Envoyer un message de test" },
  { command: "aide", description: "Liste des commandes" },
];

const HELP = [
  "<b>Commandes disponibles</b>",
  "/start — activer les alertes sur ce chat",
  "/mes_recherches — vos recherches actuellement suivies",
  "/statut — état de votre abonnement",
  "/pause — suspendre les alertes (sans rien perdre)",
  "/reprendre — reprendre les alertes",
  "/test — recevoir un message de test",
  "/aide — afficher ce message",
].join("\n");

function chatProfile(msg: TelegramMessage) {
  return {
    chatId: String(msg.chat.id),
    type: msg.chat.type,
    username: msg.chat.username ?? msg.from?.username ?? null,
    firstName: msg.chat.first_name ?? msg.from?.first_name ?? msg.chat.title ?? null,
  };
}

/** One-line summary of a search's filters for /mes_recherches. */
function criterionSummary(c: Criterion): string {
  const f = c.filters;
  const parts: string[] = [];
  const kw = [...f.keywords, ...f.altKeywords].slice(0, 4);
  if (kw.length) parts.push(kw.join(", "));
  if (f.minPrice !== null && f.maxPrice !== null) parts.push(`${formatMad(f.minPrice * 100)} – ${formatMad(f.maxPrice * 100)}`);
  else if (f.maxPrice !== null) parts.push(`≤ ${formatMad(f.maxPrice * 100)}`);
  else if (f.minPrice !== null) parts.push(`≥ ${formatMad(f.minPrice * 100)}`);
  if (f.targetPrice !== null) parts.push(`cible ${formatMad(f.targetPrice * 100)}`);
  if (f.minDiscountPct !== null) parts.push(`remise ≥ ${frNumber(f.minDiscountPct)} %`);
  const line = `• <b>${escapeHtml(c.name)}</b>`;
  return parts.length ? `${line}\n   <i>${escapeHtml(parts.join(" · "))}</i>` : line;
}

async function welcomeText(db: Db): Promise<string> {
  const searches = await listUserCriteria(db);
  const count = searches.length;
  const lines = [
    "<b>C'est activé ✅</b>",
    "Vous recevrez une alerte dès qu'un produit de <b>vos recherches</b> correspond, ou quand <b>son prix change</b> (baisse ou prix cible atteint).",
  ];
  if (count === 0) {
    lines.push(
      "",
      "⚠️ Vous n'avez encore <b>aucune recherche</b> à vous. Créez-en depuis le tableau de bord (« Mes critères de recherche ») : seules vos propres recherches déclenchent des alertes ici.",
    );
  } else {
    lines.push("", `Recherches suivies : <b>${count}</b>. Tapez /mes_recherches pour les voir.`);
  }
  lines.push("", "Autres commandes : /pause, /reprendre, /statut, /aide.");
  return lines.join("\n");
}

async function handleCommand(db: Db, bot: TelegramBot, msg: TelegramMessage, log: Logger): Promise<void> {
  const text = (msg.text ?? "").trim();
  const { chatId } = chatProfile(msg);
  // "/cmd@BotName arg" → "cmd"
  const token = text.split(/\s+/)[0] ?? "";
  const cmd = token.replace(/^\//, "").split("@")[0]?.toLowerCase() ?? "";

  switch (cmd) {
    case "start": {
      await registerSubscriber(db, chatProfile(msg));
      await bot.sendMessage(chatId, await welcomeText(db));
      log.info({ chatId }, "nouvel abonné (/start)");
      return;
    }
    case "aide":
    case "help": {
      await bot.sendMessage(chatId, HELP);
      return;
    }
    case "pause":
    case "stop": {
      await setSubscriberStatus(db, chatId, "paused");
      await bot.sendMessage(chatId, "🔕 Alertes <b>suspendues</b>. Tapez /reprendre pour les réactiver.");
      return;
    }
    case "reprendre":
    case "resume": {
      await registerSubscriber(db, chatProfile(msg)); // re-activates paused/blocked
      await bot.sendMessage(chatId, "🔔 Alertes <b>réactivées</b>.");
      return;
    }
    case "test": {
      await touchSubscriber(db, chatId);
      await bot.sendMessage(chatId, formatTestMessage());
      return;
    }
    case "statut": {
      const sub = await getSubscriber(db, chatId);
      const searches = await listUserCriteria(db);
      const state = !sub ? "non abonné (tapez /start)" : sub.status === "active" ? "actives ✅" : sub.status === "paused" ? "en pause 🔕" : "bloqué (tapez /reprendre)";
      await bot.sendMessage(chatId, ["<b>Votre abonnement</b>", `Alertes : ${state}`, `Recherches suivies : <b>${searches.length}</b>`].join("\n"));
      return;
    }
    case "mes_recherches":
    case "recherches": {
      await touchSubscriber(db, chatId);
      const searches = await listUserCriteria(db);
      if (searches.length === 0) {
        await bot.sendMessage(
          chatId,
          "Vous n'avez aucune recherche à vous pour le moment. Créez-en depuis le tableau de bord : seules vos propres recherches déclenchent des alertes.",
        );
        return;
      }
      const body = ["<b>Vos recherches suivies</b>", ...searches.map(criterionSummary)].join("\n");
      await bot.sendMessage(chatId, body);
      return;
    }
    default: {
      if (text.startsWith("/")) {
        await bot.sendMessage(chatId, `Commande inconnue. ${HELP}`);
      } else {
        // Plain message: a friendly nudge (and register, since they messaged the bot).
        await registerSubscriber(db, chatProfile(msg));
        await bot.sendMessage(chatId, `Bonjour 👋 ${HELP}`);
      }
      return;
    }
  }
}

async function main() {
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL);
  if (!config.TELEGRAM_BOT_TOKEN) {
    logger.error("TELEGRAM_BOT_TOKEN absent : le bot ne peut pas démarrer");
    process.exit(1);
  }
  const { db, close } = createDb(config.DATABASE_URL, 4);
  const bot = new TelegramBot({ botToken: config.TELEGRAM_BOT_TOKEN });

  let me;
  try {
    me = await bot.getMe();
    await bot.setMyCommands(BOT_COMMANDS);
  } catch (err) {
    logger.error({ err: (err as Error).message }, "impossible de joindre l'API Telegram (jeton invalide ?)");
    await close();
    process.exit(1);
  }
  logger.info({ bot: me.username }, "bot Telegram prêt");

  let stopped = false;

  // Delivery loop: fan queued alerts out to active subscribers.
  const deliver = async () => {
    if (stopped) return;
    try {
      const subs = await listActiveSubscribers(db);
      if (subs.length === 0) return;
      const ns = await getNotificationSettings(db);
      if (!ns.enabled) return;
      const r = await deliverToSubscribers(db, subs, {
        botToken: config.TELEGRAM_BOT_TOKEN!,
        limit: ns.maxPerRun,
        maxAttempts: ns.maxAttempts,
        sendImages: ns.sendImages,
        logger,
      });
      if (r.sent || r.failed || r.dead || r.filtered) logger.info(r, "cycle de livraison");
    } catch (err) {
      logger.error({ err: (err as Error).message }, "boucle de livraison en échec");
    }
  };
  const deliverTimer = setInterval(() => void deliver(), 15_000);
  void deliver();

  // Long-poll loop: read commands.
  const poll = async () => {
    let offset = await getBotUpdateOffset(db);
    while (!stopped) {
      try {
        const updates = await bot.getUpdates(offset, 50);
        for (const u of updates) {
          offset = u.update_id + 1;
          const msg = u.message;
          if (msg?.text) {
            try {
              await handleCommand(db, bot, msg, logger);
            } catch (err) {
              logger.warn({ err: (err as Error).message, chatId: msg.chat.id }, "échec de traitement d'une commande");
            }
          }
        }
        if (updates.length) await setBotUpdateOffset(db, offset);
      } catch (err) {
        if (stopped) break;
        logger.warn({ err: (err as Error).message }, "getUpdates en échec, nouvelle tentative dans 5 s");
        await new Promise((r) => setTimeout(r, 5_000));
      }
    }
  };

  const shutdown = async (signal: string) => {
    if (stopped) return;
    stopped = true;
    logger.info({ signal }, "arrêt du bot");
    clearInterval(deliverTimer);
    await close().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("unhandledRejection", (err) => logger.error({ err: String(err) }, "promesse rejetée non gérée"));

  await poll();
}

main().catch((err) => {
  console.error(JSON.stringify({ level: "fatal", msg: "le bot n'a pas pu démarrer", err: (err as Error).message }));
  process.exit(1);
});
