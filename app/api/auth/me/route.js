import { getCurrentUser } from "../../../../lib/users.js";
export const dynamic = "force-dynamic";
export async function GET() { return Response.json({ user: await getCurrentUser() }); }
