import { readStore } from "../../../../lib/store.js";
import { findWorkout } from "../../../../lib/library.js";
import { buildWorkoutFit, workoutFilename } from "../../../../lib/fit.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const id = new URL(req.url).searchParams.get("id");
  const w = findWorkout(id);
  if (!w) return Response.json({ error: "No such workout." }, { status: 404 });
  try {
    const store = await readStore();
    const ftp = store.profile?.currentFTP || 240;
    const day = { day: "", title: w.name, steps: w.steps };
    const fit = buildWorkoutFit(day, ftp);
    return new Response(fit, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${workoutFilename(day)}"`,
      },
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
