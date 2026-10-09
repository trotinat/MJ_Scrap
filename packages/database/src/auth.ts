import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, count, eq, gt, lt, sql } from "drizzle-orm";
import type { DbOrTx } from "./client";
import { loginAttempts, sessions, users } from "./schema";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number, opts: object) => Promise<Buffer>;

// scrypt parameters: N=2^15, r=8, p=1 (≈32 MiB, OWASP-recommended baseline).
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 10) throw new Error("Le mot de passe doit contenir au moins 10 caractères");
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEYLEN, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, keyB64] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(keyB64, "base64");
  const key = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export async function findUserByEmail(db: DbOrTx, email: string) {
  const rows = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`)
    .limit(1);
  return rows[0] ?? null;
}

export async function createUser(db: DbOrTx, email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("Adresse e-mail invalide");
  const passwordHash = await hashPassword(password);
  const [row] = await db.insert(users).values({ email: normalized, passwordHash }).returning();
  return row!;
}

export async function setUserPassword(db: DbOrTx, userId: string, password: string) {
  const passwordHash = await hashPassword(password);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  // Invalidate every other session after a password change.
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function countUsers(db: DbOrTx): Promise<number> {
  const [row] = await db.select({ n: count() }).from(users);
  return Number(row?.n ?? 0);
}

/* Sessions ------------------------------------------------------------------ */

export const SESSION_TTL_MS = 7 * 24 * 3600_000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(db: DbOrTx, userId: string, meta: { ip?: string | null; userAgent?: string | null } = {}) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
  });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  return { token, expiresAt };
}

/** Returns the session's user, extending the session when past half its life. */
export async function validateSession(db: DbOrTx, token: string | undefined | null) {
  if (!token || token.length < 20 || token.length > 200) return null;
  const id = hashToken(token);
  const rows = await db
    .select({ session: sessions, user: { id: users.id, email: users.email } })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.session.expiresAt.getTime() - Date.now() < SESSION_TTL_MS / 2) {
    await db.update(sessions).set({ expiresAt: new Date(Date.now() + SESSION_TTL_MS) }).where(eq(sessions.id, id));
  }
  return row.user;
}

export async function deleteSession(db: DbOrTx, token: string) {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export async function purgeExpiredSessions(db: DbOrTx) {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  await db.delete(loginAttempts).where(lt(loginAttempts.attemptedAt, new Date(Date.now() - 7 * 24 * 3600_000)));
}

/* Login rate limiting -------------------------------------------------------- */

export const LOGIN_WINDOW_MS = 15 * 60_000;
export const LOGIN_MAX_FAILURES = 5;

export async function recordLoginAttempt(db: DbOrTx, ip: string, email: string | null, success: boolean) {
  await db.insert(loginAttempts).values({ ip, email: email?.slice(0, 200) ?? null, success });
}

/** True when too many failed attempts came from this IP (or for this e-mail) recently. */
export async function isLoginRateLimited(db: DbOrTx, ip: string, email: string | null): Promise<boolean> {
  const since = new Date(Date.now() - LOGIN_WINDOW_MS);
  const [byIp] = await db
    .select({ n: count() })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.ip, ip), eq(loginAttempts.success, false), gt(loginAttempts.attemptedAt, since)));
  if (Number(byIp?.n ?? 0) >= LOGIN_MAX_FAILURES) return true;
  if (email) {
    const [byEmail] = await db
      .select({ n: count() })
      .from(loginAttempts)
      .where(
        and(
          sql`lower(${loginAttempts.email}) = ${email.trim().toLowerCase()}`,
          eq(loginAttempts.success, false),
          gt(loginAttempts.attemptedAt, since),
        ),
      );
    if (Number(byEmail?.n ?? 0) >= LOGIN_MAX_FAILURES * 2) return true;
  }
  return false;
}
