import { readStore } from "../../../lib/store.js";
import { buildWorkoutFit, workoutFilename } from "../../../lib/fit.js";
import { buildWorkoutZwo, workoutZwoFilename } from "../../../lib/zwo.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  const w = Number(sp.get("week"));
  const d = Number(sp.get("day"));
  const fmt = (sp.get("fmt") || "fit").toLowerCase();
  const store = await readStore();
  const day = store.block?.weeks?.[w]?.days?.[d];
  if (!day) return Response.json({ error: "No such workout in the current plan." }, { status: 404 });
  try {
    if (fmt === "zwo") {
      const zwo = buildWorkoutZwo(day);
      return new Response(zwo, { headers: { "Content-Type": "application/xml", "Content-Disposition": `attachment; filename="${workoutZwoFilename(day)}"` } });
    }
    const ftp = store.profile?.currentFTP || 240;
    const fit = buildWorkoutFit(day, ftp);
    return new Response(fit, { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${workoutFilename(day)}"` } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
