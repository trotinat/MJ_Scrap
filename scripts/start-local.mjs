#!/usr/bin/env node
/**
 * Démarrage local en une commande (sans Docker, sans installer PostgreSQL) :
 *
 *   pnpm start:local
 *
 * 1. crée .env s'il n'existe pas (avec un mot de passe administrateur généré) ;
 * 2. démarre un PostgreSQL embarqué (données dans ./.localdb) ;
 * 3. applique les migrations et crée l'administrateur ;
 * 4. lance le tableau de bord (http://localhost:3000) et le worker.
 * Ctrl+C arrête tout proprement.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
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

let dev = null;
const shutdown = async (code = 0) => {
  if (dev && !dev.killed) dev.kill("SIGINT");
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

console.log("\nTableau de bord : http://localhost:3000   (Ctrl+C pour tout arrêter)\n");
dev = spawn("pnpm", ["dev"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
dev.on("exit", (code) => void shutdown(code ?? 0));
