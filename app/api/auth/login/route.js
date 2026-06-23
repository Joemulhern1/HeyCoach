import { cookies } from "next/headers";
import { verifyCredentials } from "../../../../lib/users.js";
import { signSession, SESSION_COOKIE } from "../../../../lib/session.js";

export async function POST(req) {
  const { username, password } = await req.json();
  const user = await verifyCredentials(username, password);
  if (!user) return Response.json({ error: "Wrong username or password." }, { status: 401 });
  const token = await signSession({ uid: user.id, role: user.role });
  cookies().set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 30 * 86400 });
  return Response.json({ user });
}
