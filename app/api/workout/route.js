import { readStore } from "../../../lib/store.js";
import { buildWorkoutFit, workoutFilename } from "../../../lib/fit.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const idx = Number(new URL(req.url).searchParams.get("day"));
  const store = await readStore();
  const day = store.plan?.days?.[idx];
  if (!day) return Response.json({ error: "No such day in the current plan." }, { status: 404 });
  try {
    const ftp = store.profile?.currentFTP || 240;
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
