import { readStore, patchStore } from "../../../../lib/store.js";
import { extractSessionFromImage } from "../../../../lib/coach.js";

export const maxDuration = 60;

export async function POST(req) {
  const form = await req.formData();
  const file = form.get("image");
  if (!file) return Response.json({ error: "No image uploaded." }, { status: 400 });
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const mediaType = file.type || "image/png";
    const data = await extractSessionFromImage(buf.toString("base64"), mediaType);
    const session = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: data.name || "Screenshot ride",
      source: "SCREENSHOT",
      addedAt: new Date().toISOString(),
      date: data.date ? new Date(data.date).toISOString() : null,
      durationSec: data.durationSec ?? null,
      distanceKm: data.distanceKm ?? null,
      avgPower: data.avgPower ?? null,
      maxPower: data.maxPower ?? null,
      avgHr: data.avgHr ?? null,
      maxHr: data.maxHr ?? null,
      elevationGainM: data.elevationGainM ?? null,
      avgCadence: data.avgCadence ?? null,
    };
    const store = await readStore();
    return Response.json(await patchStore({ sessions: [session, ...(store.sessions || [])] }));
  } catch (e) {
    return Response.json({ error: e.message || "Couldn't read the screenshot." }, { status: 500 });
  }
}
