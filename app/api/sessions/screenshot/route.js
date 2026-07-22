import { readStore, patchStore } from "../../../../lib/store.js";
import { extractSessionFromImages } from "../../../../lib/coach.js";
import { estimateFtp } from "../../../../lib/ftp.js";
import { scoreForSession } from "../../../../lib/score.js";

export const maxDuration = 60;

export async function POST(req) {
  const form = await req.formData();
  // Accept one or many: form fields named "image" (repeatable) or "images".
  const files = [...form.getAll("image"), ...form.getAll("images")].filter(Boolean);
  if (!files.length) return Response.json({ error: "No image uploaded." }, { status: 400 });
  if (files.length > 6) return Response.json({ error: "Up to 6 screenshots per workout, please." }, { status: 400 });
  try {
    const images = [];
    for (const file of files) {
      const buf = Buffer.from(await file.arrayBuffer());
      images.push({ base64: buf.toString("base64"), mediaType: file.type || "image/png" });
    }
    const data = await extractSessionFromImages(images);
    const b20 = data.best20MinPower ?? null;
    const session = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: data.name || "Screenshot ride",
      source: files.length > 1 ? `SCREENSHOTS ×${files.length}` : "SCREENSHOT",
      addedAt: new Date().toISOString(),
      date: data.date ? new Date(data.date).toISOString() : null,
      durationSec: data.durationSec ?? null,
      distanceKm: data.distanceKm ?? null,
      avgPower: data.avgPower ?? null,
      maxPower: data.maxPower ?? null,
      normalizedPower: data.normalizedPower ?? null,
      avgHr: data.avgHr ?? null,
      maxHr: data.maxHr ?? null,
      elevationGainM: data.elevationGainM ?? null,
      avgCadence: data.avgCadence ?? null,
      kilojoules: data.kilojoules ?? null,
      ...(b20 ? { best20: b20 } : {}),
    };
    const store = await readStore();
    const score = scoreForSession(session, store);
    const saved = await patchStore({ sessions: [session, ...(store.sessions || [])] });
    const ftpRec = estimateFtp(saved.sessions, store.profile);
    return Response.json({ ...saved, session, score, ftpRec: ftpRec?.suggestion ? ftpRec : null });
  } catch (e) {
    return Response.json({ error: e.message || "Couldn't read the screenshot." }, { status: 500 });
  }
}
