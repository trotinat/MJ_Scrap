import { sql } from "drizzle-orm";
import { describe } from "vitest";
import { createDb, runMigrations, type DbHandle } from "@mdw/database";

/**
 * Integration tests run against a real PostgreSQL database given by
 * TEST_DATABASE_URL (it is wiped!). Without it they are skipped, loudly.
 */
export const TEST_DB_URL = process.env.TEST_DATABASE_URL;
export const describeDb = TEST_DB_URL ? describe : describe.skip;
if (!TEST_DB_URL) {
  console.warn("[tests] TEST_DATABASE_URL absent : tests d'intégration PostgreSQL ignorés.");
}

export async function freshDb(): Promise<DbHandle> {
  const h = createDb(TEST_DB_URL, 8);
  await h.db.execute(sql`drop schema if exists public cascade`);
  await h.db.execute(sql`drop schema if exists drizzle cascade`);
  await h.db.execute(sql`create schema public`);
  await runMigrations(h.db);
  return h;
}

export async function truncateAll(h: DbHandle): Promise<void> {
  await h.db.execute(sql`
    truncate table notification_attempts, notifications, deal_matches, price_history, product_offers, products,
      scraping_errors, run_requests, scraping_runs, search_criteria, sessions, login_attempts, users,
      application_settings, notification_settings, worker_status restart identity cascade`);
}
