import { readStore, patchStore } from "../../../../lib/store.js";
import { nudgeProgression } from "../../../../lib/progression.js";

export async function PATCH(req) {
  const { weekIndex, dayIndex, targetDayIndex, action } = await req.json();
  const store = await readStore();
  const block = store.block;
  const wk = block?.weeks?.[weekIndex];
  if (!wk?.days?.[dayIndex]) return Response.json({ error: "No such day." }, { status: 404 });

  let progression = store.progression;
  if (action === "swap") {
    const b = wk.days[targetDayIndex];
    if (!b) return Response.json({ error: "No target day." }, { status: 400 });
    const A = { ...wk.days[dayIndex] }, B = { ...b };
    wk.days[dayIndex] = { ...B, day: A.day };
    wk.days[targetDayIndex] = { ...A, day: B.day };
  } else if (action === "missed") {
    const d = wk.days[dayIndex];
    d.status = "missed";
    if (d.type !== "rest" && ["recovery", "endurance", "tempo", "threshold", "vo2", "strength"].includes(d.intensity)) {
      progression = nudgeProgression(store.progression, d.intensity, "missed");
    }
  } else if (action === "clear") {
    delete wk.days[dayIndex].status;
  } else {
    return Response.json({ error: "Unknown action." }, { status: 400 });
  }

  const next = await patchStore({ block, progression });
  return Response.json({ block: next.block, progression: next.progression });
}
