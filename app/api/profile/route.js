import { patchStore } from "../../../lib/store.js";

export async function POST(req) {
  const profile = await req.json();
  if (!profile?.eventDate || !profile?.currentFTP) {
    return Response.json({ error: "Missing required profile fields." }, { status: 400 });
  }
  const store = await patchStore({ profile });
  return Response.json(store);
}
