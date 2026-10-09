#!/usr/bin/env node
/**
 * PostgreSQL embarqué pour tester sans installer PostgreSQL (Windows, macOS, Linux).
 * Les binaires viennent du paquet npm "embedded-postgres" ; les données restent
 * dans ./.localdb (ignoré par Git). Aucun droit administrateur n'est nécessaire.
 *
 *   pnpm db:local      (laisser cette fenêtre ouverte ; Ctrl+C pour arrêter)
 *
 * Connexion : postgres://mdw:mdw@localhost:54329/mdw
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, ".localdb");
const port = Number(process.env.LOCAL_DB_PORT ?? 54329);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "mdw",
  password: "mdw",
  port,
  persistent: true,
  onLog: () => {},
  onError: (e) => console.error(String(e).trim()),
});

if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
  console.log(`Initialisation de la base locale dans ${dataDir}…`);
  await pg.initialise();
}
await pg.start();
try {
  await pg.createDatabase("mdw");
  console.log("Base « mdw » créée.");
} catch {
  // already exists
}
console.log(`PostgreSQL local prêt : postgres://mdw:mdw@localhost:${port}/mdw`);
console.log("Laissez cette fenêtre ouverte. Ctrl+C pour arrêter.");

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  console.log("Arrêt de PostgreSQL…");
  await pg.stop().catch(() => undefined);
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
