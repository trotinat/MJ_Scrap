import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

export interface DbHandle {
  db: Db;
  pool: pg.Pool;
  close: () => Promise<void>;
}

export function createDb(connectionString = process.env.DATABASE_URL, max = Number(process.env.DB_POOL_MAX ?? 10)): DbHandle {
  if (!connectionString) throw new Error("DATABASE_URL n'est pas défini");
  const pool = new pg.Pool({
    connectionString,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: process.env.APP_NAME ?? "marjane-deals-watcher",
  });
  pool.on("error", (err) => {
    // Idle client errors (e.g. DB restart) must not crash the process.
    console.error(JSON.stringify({ level: "error", msg: "pg pool error", err: err.message }));
  });
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}

const globalForDb = globalThis as unknown as { __mdwDb?: DbHandle };

/** Process-wide singleton (survives Next.js hot reloads in development). */
export function getDb(): Db {
  if (!globalForDb.__mdwDb) globalForDb.__mdwDb = createDb();
  return globalForDb.__mdwDb.db;
}

export function getPool(): pg.Pool {
  if (!globalForDb.__mdwDb) globalForDb.__mdwDb = createDb();
  return globalForDb.__mdwDb.pool;
}

export { schema };
