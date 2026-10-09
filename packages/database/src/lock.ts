import type pg from "pg";

/** Advisory lock id reserved for scraping runs. */
export const SCRAPE_LOCK_KEY = 727274002;

export type LockResult<T> = { acquired: true; value: T } | { acquired: false };

/**
 * Runs `fn` while holding a session-level PostgreSQL advisory lock on a
 * dedicated connection. If another process (or another call in this process)
 * holds the lock, returns `{ acquired: false }` immediately instead of waiting.
 * If the worker crashes, PostgreSQL releases the lock when the connection
 * drops, so a dead worker can never block future runs.
 */
export async function withAdvisoryLock<T>(pool: pg.Pool, key: number, fn: () => Promise<T>): Promise<LockResult<T>> {
  const client = await pool.connect();
  let locked = false;
  try {
    const res = await client.query<{ ok: boolean }>("select pg_try_advisory_lock($1) as ok", [key]);
    locked = res.rows[0]?.ok === true;
    if (!locked) return { acquired: false };
    const value = await fn();
    return { acquired: true, value };
  } finally {
    if (locked) {
      try {
        await client.query("select pg_advisory_unlock($1)", [key]);
      } catch {
        // Connection may be broken; releasing it below drops the lock anyway.
      }
    }
    client.release();
  }
}
