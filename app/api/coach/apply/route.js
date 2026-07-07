import { readStore, patchStore } from "../../../../lib/store.js";
import { currentWeekIndex, applyAvailability } from "../../../../lib/coach.js";
import { buildSkeleton, FOCUS_LABELS } from "../../../../lib/periodize.js";

const HARD = ["vo2", "threshold", "anaerobic", "sprint"];
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

function eventsOf(store) {
  let events = store.events || [];
  if (!events.length && store.profile?.eventDate) events = [{ id: "legacy", name: store.profile.eventName || "Goal event", date: store.profile.eventDate, priority: "A" }];
  return events;
}

export async function POST(req) {
  const p = await req.json();
  const action = p.action || p.type;
  const store = await readStore();
  const block = store.block;

  let note = "", patch = {};

  if (action === "set_focus") {
    if (!store.profile) return Response.json({ error: "Set up your goal first." }, { status: 400 });
    const focus = p.focus, from = p.from;
    if (!FOCUS_LABELS[focus] || !/^\d{4}-\d{2}-\d{2}$/.test(from || "")) return Response.json({ error: "That change wasn't specific enough to apply." }, { status: 400 });
    const focuses = [...(store.focuses || []).filter((f) => f.from !== from), ...(focus === "general" ? [] : [{ from, focus }])].sort((a, b) => a.from.localeCompare(b.from));
    const nb = buildSkeleton(store.profile, store.weights || [], eventsOf(store), store.availability || [], focuses);
    applyAvailability(nb, store.availability || []);
    patch = { block: nb, focuses };
    note = `Done — from ${from}, your plan now focuses on ${FOCUS_LABELS[focus]}. Open the calendar to see the new sessions.`;
  } else if (!block?.weeks?.length) {
    return Response.json({ error: "No plan to adjust yet." }, { status: 400 });
  } else if (action === "ease_week") {
    const wi = currentWeekIndex(block);
    const wk = block.weeks[wi];
    wk.days = wk.days.map((d) => (d.type === "ride" && HARD.includes(d.intensity))
      ? { ...d, intensity: "endurance", title: "Easy endurance", duration: "1h", description: "Eased by your coach — keep it conversational Zone 2.", steps: undefined } : d);
    patch = { block };
    note = `Done — I've eased week ${wk.weekNumber}. The hard sessions this week are now endurance rides; we'll bring the intensity back when you're fresh.`;
  } else if (action === "rest_today") {
    const today = iso(Date.now());
    let found = false;
    for (const wk of block.weeks) {
      const ws = new Date(wk.startDate + "T00:00:00Z").getTime();
      wk.days = wk.days.map((d, di) => {
        const date = d.date || iso(ws + di * 86400000);
        if (date === today && d.type !== "rest") { found = true; return { ...d, type: "rest", intensity: "rest", title: "Rest day", duration: "—", description: "Coach gave you today off — recover.", steps: undefined }; }
        return d;
      });
    }
    patch = { block };
    note = found ? "Done — today's now a rest day. Put the feet up and let the work absorb." : "There's no session scheduled today, so nothing to change — enjoy the rest.";
  } else {
    return Response.json({ error: "Unknown action." }, { status: 400 });
  }

  const chat = [...(store.coachChat || []), { role: "assistant", content: note, ts: Date.now() }].slice(-60);
  const saved = await patchStore({ ...patch, coachChat: chat });
  return Response.json({ block: saved.block, chat: saved.coachChat });
}
