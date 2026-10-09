import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Db } from "./client";

/**
 * Locates the generated SQL migrations. In Docker images MIGRATIONS_DIR is set
 * explicitly; in development the folder sits next to this package.
 */
export function migrationsFolder(): string {
  if (process.env.MIGRATIONS_DIR) return process.env.MIGRATIONS_DIR;
  const candidates = [
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../drizzle"),
    path.resolve(process.cwd(), "packages/database/drizzle"),
    path.resolve(process.cwd(), "../../packages/database/drizzle"),
    path.resolve(process.cwd(), "drizzle"),
  ];
  const found = candidates.find((c) => existsSync(path.join(c, "meta/_journal.json")));
  if (!found) throw new Error(`Dossier de migrations introuvable (essayé : ${candidates.join(", ")})`);
  return found;
}

/**
 * Applies pending migrations. Migrations are additive and run inside a
 * transaction by drizzle; a PostgreSQL advisory lock prevents two containers
 * from migrating at the same time.
 */
export async function runMigrations(db: Db): Promise<void> {
  const folder = migrationsFolder();
  await db.execute("select pg_advisory_lock(727274001)");
  try {
    await migrate(db, { migrationsFolder: folder });
  } finally {
    await db.execute("select pg_advisory_unlock(727274001)");
  }
}
