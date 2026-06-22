import { NextResponse } from "next/server";

// Single-user access lock. If APP_PASSWORD is set, every page AND every /api route
// requires it (HTTP Basic Auth). If it's unset, the app is open (e.g. local dev).
// This is what protects your Anthropic key from anyone who finds the URL.

export const config = {
  // Run on everything except Next's static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export function middleware(req) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return NextResponse.next(); // lock disabled until you set the password

  const header = req.headers.get("authorization") || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    let decoded = "";
    try { decoded = atob(encoded); } catch {}
    const pass = decoded.slice(decoded.indexOf(":") + 1); // username ignored
    if (safeEqual(pass, expected)) return NextResponse.next();
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="HeyCoach", charset="UTF-8"' },
  });
}
