#!/usr/bin/env node
/**
 * Démarrage local en une commande (sans Docker, sans installer PostgreSQL) :
 *
 *   pnpm start:local
 *
 * 1. crée .env s'il n'existe pas (avec un mot de passe administrateur généré) ;
 * 2. démarre un PostgreSQL embarqué (données dans ./.localdb) ;
 * 3. applique les migrations et crée l'administrateur ;
 * 4. lance le tableau de bord (http://localhost:3000) et le worker :
 *    - mode développement par défaut ;
 *    - `--prod` (pnpm start:prod) : version compilée et optimisée, recompilée
 *      seulement quand le code change.
 * Ctrl+C arrête tout proprement.
 */
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env");
const port = Number(process.env.LOCAL_DB_PORT ?? 54329);
const localUrl = `postgres://mdw:mdw@localhost:${port}/mdw`;

if (!existsSync(envFile)) {
  const password = randomBytes(9).toString("base64url");
  writeFileSync(
    envFile,
    [
      `DATABASE_URL=${localUrl}`,
      "ADMIN_EMAIL=admin@local.test",
      `ADMIN_PASSWORD=${password}`,
      "TELEGRAM_BOT_TOKEN=",
      "TELEGRAM_CHAT_ID=",
      "SCRAPE_TIMES=09:00,18:00",
      "",
    ].join("\n"),
  );
  console.log("\n.env créé. Identifiants du tableau de bord :");
  console.log("  e-mail       : admin@local.test");
  console.log(`  mot de passe : ${password}\n`);
}
process.loadEnvFile(envFile);
const useLocalDb = process.env.DATABASE_URL === localUrl;

let pg = null;
if (useLocalDb) {
  const dataDir = path.join(root, ".localdb");
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: "mdw", password: "mdw", port, persistent: true, onLog: () => {} });
  if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
    console.log("Initialisation de PostgreSQL embarqué (première fois, ~30 s)…");
    await pg.initialise();
  }
  await pg.start();
  await pg.createDatabase("mdw").catch(() => undefined);
  console.log(`PostgreSQL local démarré sur le port ${port}.`);
} else {
  console.log("DATABASE_URL pointe vers une autre base : PostgreSQL embarqué non utilisé.");
}

const run = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn("pnpm", args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`pnpm ${args.join(" ")} : code ${code}`))));
  });

const PROD = process.argv.includes("--prod");
const children = [];
let shuttingDown = false;
const shutdown = async (code = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  const running = children.filter((c) => c.exitCode === null);
  for (const c of running) c.kill("SIGINT");
  // Let the web app and worker close their database connections before PostgreSQL stops.
  await Promise.race([
    Promise.all(running.map((c) => new Promise((r) => (c.exitCode !== null ? r() : c.once("exit", r))))),
    new Promise((r) => setTimeout(r, 15_000)),
  ]);
  if (pg) {
    console.log("Arrêt de PostgreSQL…");
    await pg.stop().catch(() => undefined);
  }
  process.exit(code);
};
process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));

try {
  await run(["db:migrate"]);
} catch (err) {
  console.error(String(err));
  await shutdown(1);
}

if (!PROD) {
  console.log("\nTableau de bord : http://localhost:3000   (Ctrl+C pour tout arrêter)\n");
  const dev = spawn("pnpm", ["dev"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  children.push(dev);
  dev.on("exit", (code) => void shutdown(code ?? 0));
} else {
  // Production build: compiled once, rebuilt only when the code changes (git commit).
  const stampFile = path.join(root, ".localbuild");
  let commit = "unknown";
  try {
    commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root }).toString().trim();
  } catch {
    // not a git checkout: rebuild every time
  }
  const webBuildId = path.join(root, "apps/web/.next/BUILD_ID");
  const nextBin = path.join(root, "apps/web/node_modules/next/dist/bin/next");
  const workerEntry = path.join(root, "apps/worker/dist/index.js");
  const upToDate =
    commit !== "unknown" && existsSync(stampFile) && readFileSync(stampFile, "utf8").trim() === commit && existsSync(webBuildId) && existsSync(workerEntry);
  if (!upToDate) {
    console.log("\nCompilation de la version optimisée (quelques minutes, uniquement après une mise à jour)…\n");
    try {
      await run(["build"]);
    } catch (err) {
      console.error(String(err));
      await shutdown(1);
    }
    if (!existsSync(webBuildId) || !existsSync(workerEntry)) {
      console.error("La compilation n'a pas produit les fichiers attendus (apps/web/.next, apps/worker/dist).");
      await shutdown(1);
    }
    if (commit !== "unknown") writeFileSync(stampFile, commit);
  } else {
    console.log("Version optimisée déjà compilée pour ce code : démarrage direct.");
  }

  // http://localhost: secure cookies are not required for a local test.
  const env = { ...process.env, NODE_ENV: "production", COOKIE_SECURE: "false", PORT: process.env.PORT ?? "3000", HOSTNAME: "localhost" };
  const web = spawn(process.execPath, [nextBin, "start", "-p", env.PORT, "-H", env.HOSTNAME], { cwd: path.join(root, "apps/web"), stdio: "inherit", env });
  const worker = spawn(process.execPath, [workerEntry], {
    cwd: path.join(root, "apps/worker"),
    stdio: "inherit",
    env: { ...env, MIGRATIONS_DIR: path.join(root, "packages/database/drizzle") },
  });
  children.push(web, worker);
  web.on("exit", (code) => void shutdown(code ?? 0));
  worker.on("exit", (code) => void shutdown(code ?? 0));
  console.log(`\nTableau de bord : http://localhost:${env.PORT}   (Ctrl+C pour tout arrêter)\n`);
  if (process.env.OPEN_BROWSER === "1") void openWhenReady(`http://localhost:${env.PORT}`);
}

/** Opens the dashboard in the default browser as soon as it answers. */
async function openWhenReady(url) {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) break;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  const [cmd, args] =
    process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
}
