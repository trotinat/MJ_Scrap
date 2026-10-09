"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createSession,
  deleteSession,
  findUserByEmail,
  getDb,
  isLoginRateLimited,
  recordLoginAttempt,
  verifyPassword,
} from "@mdw/database";
import { clientIp, COOKIE_SECURE, SESSION_COOKIE } from "@/lib/session";

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

// Constant-time-ish behaviour for unknown accounts: always run one scrypt.
const DUMMY_HASH = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==";

export async function login(_prev: { error?: string; email?: string }, formData: FormData): Promise<{ error?: string; email?: string }> {
  const parsed = schema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  const typedEmail = String(formData.get("email") ?? "").slice(0, 200);
  if (!parsed.success) return { error: "Adresse e-mail ou mot de passe invalide.", email: typedEmail };
  const db = getDb();
  const ip = await clientIp();
  if (await isLoginRateLimited(db, ip, parsed.data.email)) {
    return { error: "Trop de tentatives. Réessayez dans 15 minutes.", email: typedEmail };
  }
  const user = await findUserByEmail(db, parsed.data.email);
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
  await recordLoginAttempt(db, ip, parsed.data.email, Boolean(user && ok));
  if (!user || !ok) return { error: "Adresse e-mail ou mot de passe incorrect.", email: typedEmail };

  const store = await cookies();
  const { token, expiresAt } = await createSession(db, user.id, { ip, userAgent: null });
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  redirect("/");
}

export async function logout(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(getDb(), token).catch(() => undefined);
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
