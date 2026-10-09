import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, validateSession } from "@mdw/database";

/** Secure cookies by default; set COOKIE_SECURE=false only for local HTTP development. */
export const COOKIE_SECURE = process.env.COOKIE_SECURE !== "false" && process.env.NODE_ENV === "production";
/** "__Host-" prefix forces Secure, Path=/ and no Domain in the browser. */
export const SESSION_COOKIE = COOKIE_SECURE ? "__Host-mdw_session" : "mdw_session";

export async function clientIp(): Promise<string> {
  const h = await headers();
  // The reverse proxy (Caddy) sets X-Forwarded-For; take the left-most address.
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (fwd || h.get("x-real-ip") || "unknown").slice(0, 64);
}

export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    return await validateSession(getDb(), token);
  } catch {
    return null;
  }
}

/** Use at the top of every protected page and server action. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
