import { generateWorkout } from "../../../../lib/generate.js";
import { buildWorkoutFit, workoutFilename } from "../../../../lib/fit.js";
import { buildWorkoutZwo, workoutZwoFilename } from "../../../../lib/zwo.js";
import { readStore } from "../../../../lib/store.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  const type = sp.get("type");
  const seed = Number(sp.get("seed"));
  const fmt = (sp.get("fmt") || "fit").toLowerCase();
  const w = generateWorkout(type, { seed: Number.isFinite(seed) ? seed : undefined });
  const day = { day: "", title: w.name, steps: w.steps, description: w.description };
  try {
    if (fmt === "zwo") return new Response(buildWorkoutZwo(day), { headers: { "Content-Type": "application/xml", "Content-Disposition": `attachment; filename="${workoutZwoFilename(day)}"` } });
    const store = await readStore();
    const ftp = store.profile?.currentFTP || 240;
    return new Response(buildWorkoutFit(day, ftp), { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${workoutFilename(day)}"` } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
