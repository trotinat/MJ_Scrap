import { NextResponse, type NextRequest } from "next/server";

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
  if (process.env.AUTH_DISABLED === "true" && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(req.headers.get("host") ?? "")) {
    return NextResponse.next();
  }
  const hasSession = req.cookies.has("__Host-mdw_session") || req.cookies.has("mdw_session");
  if (!hasSession) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
