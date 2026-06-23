import { cookies } from "next/headers";
import { SESSION_COOKIE } from "../../../../lib/session.js";
export async function POST() { cookies().delete(SESSION_COOKIE); return Response.json({ ok: true }); }
