import { NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "./lib/session.js";

// Multi-user gate. Verifies the signed session cookie on every request.
// Unauthenticated: API -> 401, pages -> redirect to /login. Public: /login, /setup, auth endpoints.

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };

const PUBLIC_PAGES = ["/login", "/setup"];
const PUBLIC_API = ["/api/auth/login", "/api/auth/setup"];

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api");
  const isPublic = PUBLIC_PAGES.includes(pathname) || PUBLIC_API.some((p) => pathname.startsWith(p));

  const tok = req.cookies.get(SESSION_COOKIE)?.value;
  const session = tok ? await verifySession(tok) : null;

  if (session) {
    if (pathname === "/login" || pathname === "/setup") return NextResponse.redirect(new URL("/", req.url));
    return NextResponse.next();
  }
  if (isPublic) return NextResponse.next();
  if (isApi) return new NextResponse(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
  return NextResponse.redirect(new URL("/login", req.url));
}
