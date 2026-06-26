import { readStore } from "../../../../lib/store.js";
import { findWorkout } from "../../../../lib/library.js";
import { buildWorkoutFit, workoutFilename } from "../../../../lib/fit.js";
import { buildWorkoutZwo, workoutZwoFilename } from "../../../../lib/zwo.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id");
  const fmt = (sp.get("fmt") || "fit").toLowerCase();
  const w = findWorkout(id);
  if (!w) return Response.json({ error: "No such workout." }, { status: 404 });
  try {
    const day = { day: "", title: w.name, steps: w.steps, description: w.description };
    if (fmt === "zwo") {
      const zwo = buildWorkoutZwo(day);
      return new Response(zwo, { headers: { "Content-Type": "application/xml", "Content-Disposition": `attachment; filename="${workoutZwoFilename(day)}"` } });
    }
    const store = await readStore();
    const ftp = store.profile?.currentFTP || 240;
    const fit = buildWorkoutFit(day, ftp);
    return new Response(fit, { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${workoutFilename(day)}"` } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
