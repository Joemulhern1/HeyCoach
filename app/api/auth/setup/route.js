import { cookies } from "next/headers";
import { userCount, createUser } from "../../../../lib/users.js";
import { signSession, SESSION_COOKIE } from "../../../../lib/session.js";

export async function POST(req) {
  if ((await userCount()) > 0) return Response.json({ error: "Already set up — please log in." }, { status: 403 });
  const { username, password } = await req.json();
  try {
    const user = await createUser({ username, password, role: "admin" });
    const token = await signSession({ uid: user.id, role: user.role });
    cookies().set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 30 * 86400 });
    return Response.json({ user });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

export async function GET() {
  return Response.json({ needsSetup: (await userCount()) === 0 });
}
