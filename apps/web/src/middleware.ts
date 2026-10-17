import { NextResponse, type NextRequest } from "next/server";
import { isDirectLocalRequest } from "./lib/local-access";

const PUBLIC = [/^\/login$/, /^\/api\/health$/, /^\/_next\//, /^\/favicon/];

/**
 * First line of defence: requests without a session cookie are redirected to
 * /login. The session itself is validated against the database by
 * requireUser() in every page, action and route handler.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();
  // Local launcher without login: only for requests addressed to this computer.
  // (The local launcher only listens on localhost, so other computers cannot reach it.)
  if (process.env.AUTH_DISABLED === "true" && isDirectLocalRequest(req.headers)) {
    return NextResponse.next();
  }
  const hasSession = req.cookies.has("__Host-mdw_session") || req.cookies.has("mdw_session");
  if (!hasSession) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    // Next normalizes the backend URL to localhost; retain the public Host and port.
    const host = req.headers.get("host");
    const authority = host && /^(?:[a-z0-9.-]+|\[[a-f0-9:]+\])(?::\d+)?$/i.test(host) ? host : req.nextUrl.host;
    return NextResponse.redirect(new URL("/login", `${req.nextUrl.protocol}//${authority}`));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
