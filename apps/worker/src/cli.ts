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
  seedRecommendedCriteria,
  seedFashionCriteria,
  seedDefaultProfile,
  upgradeRecommendedCriteria,
  upgradeDealPages,
  upgradeDestockagePages,
  setUserPassword,
} from "@mdw/database";
import { configureProxyFromEnv, MarjaneAdapter, parseListingHtml, parseProductPage } from "@mdw/scraper";
import { EXAMPLE_CRITERIA, formatMad } from "@mdw/shared";
import { formatTestMessage, telegramConfigFromEnv, TelegramClient } from "@mdw/notifications";
import { loadConfig } from "./config";
import { createLogger } from "./logger";
import { lazyDeps } from "./deps";
import { runScrape } from "./pipeline";
import { reevaluateSaved } from './reevaluate';

const USAGE = `Usage : node dist/cli.js <commande>

  migrate                 Applique les migrations, initialise les paramètres et crée
                          l'administrateur depuis ADMIN_EMAIL / ADMIN_PASSWORD s'il n'existe aucun compte.
  create-admin <email>    Crée un administrateur (mot de passe lu dans ADMIN_PASSWORD ou demandé).
  reset-password <email>  Change le mot de passe d'un administrateur.
  seed-examples           Ajoute les 3 critères d'exemple (désactivés).
  run-now                 Lance immédiatement une collecte complète.
  reevaluate              Revérifie les offres enregistrées, sans collecte ni envoi d'alertes.
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
        const added = await seedRecommendedCriteria(db, { once: true });
        if (added) logger.info({ added }, "critères recommandés ajoutés");
        if (await upgradeRecommendedCriteria(db)) logger.info("critère Adidas Homme : exclusions enfants complétées");
        if (await upgradeDealPages(db)) logger.info("pages de deals ajoutées (deals de l'automne, moins de 200 DH)");
        if (await upgradeDestockagePages(db)) logger.info("pages de déstockage ajoutées (mode-sport, high-tech, maison, beauté)");
        const fashion = await seedFashionCriteria(db);
        if (fashion) logger.info({ added: fashion }, "recherches mode homme ajoutées (hauts, pantalons, chaussures)");
        if (await seedDefaultProfile(db)) logger.info("profil de départ renseigné (Homme, pointure 42, taille M, pantalon 32/33)");
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
      case 'reevaluate': {
        const result = await reevaluateSaved(db, pool);
        if (!result.acquired) throw new Error('Une collecte est en cours. Réessayez après sa fin.');
        console.log(JSON.stringify(result.value));
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
    renderChannel: config.RENDER_BROWSER_CHANNEL,
  });
  let failures = 0;
  const productUrls: string[] = [];
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  try {
    for (const p of paths) {
      console.log(`\n=== Liste ${p}`);
      // File-safe slug: drop the query string and any character illegal on Windows.
      const slug = p.split("?")[0]!.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
      try {
        const raw = await adapter.fetchRaw(`https://www.marjanemall.ma${p}`);
        const file = path.join(outDir, `${stamp}_listing_${slug}.html`);
        await writeFile(file, raw.body);
        const result = await adapter.discover(p, 2);
        const items = result.items;
        console.log(`HTTP ${raw.status} — acquisition ${result.method}, ${result.pagesLoaded} lot(s), ${items.length} produits ; couverture ${result.complete ? 'complète' : 'limitée'} (${file})`);
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
