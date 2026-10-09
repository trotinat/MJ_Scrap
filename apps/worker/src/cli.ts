import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import {
  countUsers,
  createCriterion,
  createDb,
  createUser,
  findUserByEmail,
  getAppSettings,
  getNotificationSettings,
  runMigrations,
  saveAppSettings,
  setUserPassword,
} from "@mdw/database";
import { configureProxyFromEnv, MarjaneAdapter, parseListingHtml, parseProductPage } from "@mdw/scraper";
import { EXAMPLE_CRITERIA, formatMad } from "@mdw/shared";
import { formatTestMessage, telegramConfigFromEnv, TelegramClient } from "@mdw/notifications";
import { loadConfig } from "./config";
import { createLogger } from "./logger";
import { lazyDeps } from "./deps";
import { runScrape } from "./pipeline";

const USAGE = `Usage : node dist/cli.js <commande>

  migrate                 Applique les migrations, initialise les paramètres et crée
                          l'administrateur depuis ADMIN_EMAIL / ADMIN_PASSWORD s'il n'existe aucun compte.
  create-admin <email>    Crée un administrateur (mot de passe lu dans ADMIN_PASSWORD ou demandé).
  reset-password <email>  Change le mot de passe d'un administrateur.
  seed-examples           Ajoute les 3 critères d'exemple (désactivés).
  run-now                 Lance immédiatement une collecte complète.
  probe [chemins…]        Validation en conditions réelles : extrait des pages de Marjane Mall,
                          affiche les résultats et enregistre le HTML brut (fixtures/live).
  test-telegram           Envoie un message de test sur Telegram.
`;

async function readPassword(prompt: string): Promise<string> {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const pw = await rl.question(prompt);
  rl.close();
  return pw.trim();
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd || cmd === "help" || cmd === "--help") {
    console.log(USAGE);
    return;
  }
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL);
  const handle = createDb(config.DATABASE_URL, 4);
  const { db, pool } = handle;

  try {
    switch (cmd) {
      case "migrate": {
        await runMigrations(db);
        await saveAppSettings(db, await getAppSettings(db));
        await getNotificationSettings(db);
        logger.info("migrations appliquées");
        if ((await countUsers(db)) === 0) {
          if (config.ADMIN_EMAIL && config.ADMIN_PASSWORD) {
            await createUser(db, config.ADMIN_EMAIL, config.ADMIN_PASSWORD);
            logger.info({ email: config.ADMIN_EMAIL }, "administrateur initial créé");
          } else {
            logger.warn("aucun administrateur : définissez ADMIN_EMAIL et ADMIN_PASSWORD ou utilisez create-admin");
          }
        }
        break;
      }
      case "create-admin": {
        const email = args[0] ?? config.ADMIN_EMAIL;
        if (!email) throw new Error("Adresse e-mail requise");
        if (await findUserByEmail(db, email)) throw new Error("Ce compte existe déjà (utilisez reset-password)");
        const pw = await readPassword("Mot de passe (10 caractères minimum) : ");
        await createUser(db, email, pw);
        console.log(`Administrateur ${email} créé.`);
        break;
      }
      case "reset-password": {
        const email = args[0];
        if (!email) throw new Error("Adresse e-mail requise");
        const user = await findUserByEmail(db, email);
        if (!user) throw new Error("Compte introuvable");
        await setUserPassword(db, user.id, await readPassword("Nouveau mot de passe : "));
        console.log("Mot de passe modifié ; toutes les sessions ont été fermées.");
        break;
      }
      case "seed-examples": {
        for (const c of EXAMPLE_CRITERIA) await createCriterion(db, c);
        console.log(`${EXAMPLE_CRITERIA.length} critères d'exemple ajoutés (désactivés).`);
        break;
      }
      case "run-now": {
        const outcome = await runScrape(lazyDeps(db, pool, config, logger), "manual");
        console.log(JSON.stringify(outcome, null, 2));
        if (outcome.status === "failed") process.exitCode = 2;
        break;
      }
      case "probe": {
        await probe(config, args);
        break;
      }
      case "test-telegram": {
        const cfg = telegramConfigFromEnv();
        if (!cfg) throw new Error("TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID sont requis");
        const r = await new TelegramClient(cfg).sendMessage(formatTestMessage());
        console.log(`Message envoyé (message_id ${r.messageId}).`);
        break;
      }
      default:
        console.log(USAGE);
        process.exitCode = 1;
    }
  } finally {
    await handle.close();
  }
}

/**
 * Live validation against the real site. Prints what was extracted and saves
 * the raw HTML so it can be turned into regression fixtures. Never fabricates
 * results: any failure is reported as such and the exit code is non-zero.
 */
async function probe(config: ReturnType<typeof loadConfig>, args: string[]) {
  configureProxyFromEnv();
  const outDir = path.resolve(process.env.PROBE_OUT_DIR ?? "packages/scraper/fixtures/live");
  await mkdir(outDir, { recursive: true });
  const paths = args.length ? args : ["/tv-son-photo", "/tv-son-photo/tv-home-cinema/televiseur"];
  const adapter = new MarjaneAdapter({
    userAgent: config.SCRAPER_USER_AGENT,
    minDelayMs: 3000,
    timeoutMs: config.REQUEST_TIMEOUT_MS,
    maxRetries: 1,
    respectRobots: config.RESPECT_ROBOTS ?? true,
    renderMode: config.RENDER_MODE,
    renderTimeoutMs: config.RENDER_TIMEOUT_MS,
  });
  let failures = 0;
  const productUrls: string[] = [];
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  try {
    for (const p of paths) {
      console.log(`\n=== Liste ${p}`);
      try {
        const raw = await adapter.fetchRaw(`https://www.marjanemall.ma${p}`);
        const file = path.join(outDir, `${stamp}_listing${p.replace(/\//g, "_")}.html`);
        await writeFile(file, raw.body);
        const httpItems = parseListingHtml(raw.body, p);
        console.log(`HTTP ${raw.status} — ${httpItems.length} produits extraits du HTML serveur (${file})`);
        let items = httpItems;
        if (httpItems.length === 0 && config.RENDER_MODE !== "never") {
          const html = await adapter.renderRaw(`https://www.marjanemall.ma${p}`, 2);
          const rfile = path.join(outDir, `${stamp}_rendered${p.replace(/\//g, "_")}.html`);
          await writeFile(rfile, html);
          items = parseListingHtml(html, p);
          console.log(`Rendu navigateur — ${items.length} produits extraits (${rfile})`);
        }
        if (items.length === 0) failures++;
        for (const it of items.slice(0, 5)) {
          console.log(
            `  • ${it.title.slice(0, 70)} | ${formatMad(it.priceCents)}${it.originalPriceCents ? ` (barré ${formatMad(it.originalPriceCents)})` : ""}${it.advertisedDiscountPct ? ` -${it.advertisedDiscountPct}%` : ""} | ${it.seller ?? "vendeur ?"} | ${it.url}`,
          );
        }
        productUrls.push(...items.slice(0, 2).map((i) => i.url));
      } catch (err) {
        failures++;
        console.log(`  ÉCHEC : ${(err as Error).message}`);
      }
    }
    for (const url of productUrls.slice(0, 3)) {
      console.log(`\n=== Produit ${url}`);
      try {
        const raw = await adapter.fetchRaw(url);
        const file = path.join(outDir, `${stamp}_product_${url.split("/").pop()}.html`);
        await writeFile(file, raw.body);
        const d = parseProductPage(raw.body, url);
        console.log(
          JSON.stringify(
            { ...d, price: formatMad(d.priceCents), original: formatMad(d.originalPriceCents), rawSpecs: Object.fromEntries(Object.entries(d.rawSpecs).slice(0, 10)) },
            null,
            2,
          ),
        );
        console.log(`HTML enregistré : ${file}`);
      } catch (err) {
        failures++;
        console.log(`  ÉCHEC : ${(err as Error).message}`);
      }
    }
  } finally {
    await adapter.close();
  }
  console.log(failures ? `\n${failures} échec(s) : l'extraction en direct n'est PAS validée.` : "\nExtraction en direct validée sur les pages testées.");
  if (failures) process.exitCode = 3;
}

main().catch((err) => {
  console.error(`Erreur : ${(err as Error).message}`);
  process.exit(1);
});
