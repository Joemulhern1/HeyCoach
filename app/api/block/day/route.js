import { readStore, patchStore } from "../../../../lib/store.js";
import { nudgeProgression } from "../../../../lib/progression.js";
import { planWorkout } from "../../../../lib/generate.js";

const TYPE_KEY = { endurance: "end", recovery: "rec", tempo: "tempo", sweetspot: "ss", threshold: "thr", vo2: "vo2", anaerobic: "anaerobic", sprint: "sprint", long: "long" };
const LADDER = ["recovery", "endurance", "tempo", "sweetspot", "threshold", "vo2", "anaerobic"]; // easy → hard

function makeRide(day, key) {
  const pw = planWorkout(key, `${day.date}:${key}:${Date.now()}`);
  if (!pw) return day;
  return { day: day.day, date: day.date, type: "ride", intensity: pw.intensity, title: pw.title, duration: durOf(pw.steps), description: pw.description, steps: pw.steps };
}
function durOf(steps) { const s = steps.reduce((a, x) => a + x.durationSec, 0) / 60; return s >= 60 ? `${Math.floor(s / 60)}h${s % 60 ? String(Math.round(s % 60)).padStart(2, "0") : ""}` : `${Math.round(s)}min`; }

export async function PATCH(req) {
  const { weekIndex, dayIndex, targetDayIndex, action, replaceType } = await req.json();
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
  } else if (action === "replace") {
    const d = wk.days[dayIndex];
    if (replaceType === "rest") {
      wk.days[dayIndex] = { day: d.day, date: d.date, type: "rest", intensity: "rest", title: "Rest", duration: "—", description: "Rest and recover." };
    } else if (replaceType === "easier" || replaceType === "harder") {
      const cur = LADDER.indexOf(d.intensity === "endurance" && /long/i.test(d.title) ? "endurance" : d.intensity);
      const start = cur < 0 ? (replaceType === "easier" ? LADDER.length - 1 : 0) : cur;
      const idx = Math.max(0, Math.min(LADDER.length - 1, start + (replaceType === "easier" ? -1 : 1)));
      wk.days[dayIndex] = makeRide(d, TYPE_KEY[LADDER[idx]]);
    } else if (TYPE_KEY[replaceType]) {
      wk.days[dayIndex] = makeRide(d, TYPE_KEY[replaceType]);
    } else {
      return Response.json({ error: "Unknown replacement." }, { status: 400 });
    }
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
