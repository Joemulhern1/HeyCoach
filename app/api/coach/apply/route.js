import { readStore, patchStore } from "../../../../lib/store.js";
import { currentWeekIndex, applyAvailability } from "../../../../lib/coach.js";
import { buildSkeleton, FOCUS_LABELS } from "../../../../lib/periodize.js";
import { planWorkout } from "../../../../lib/generate.js";

const HARD = ["vo2", "threshold", "anaerobic", "sprint"];
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const TYPE_KEY = { endurance: "end", recovery: "rec", tempo: "tempo", sweetspot: "ss", threshold: "thr", vo2: "vo2", anaerobic: "anaerobic", sprint: "sprint" };
const LADDER = ["recovery", "endurance", "tempo", "sweetspot", "threshold", "vo2", "anaerobic"];
const durOf = (steps) => { const s = steps.reduce((a, x) => a + x.durationSec, 0) / 60; return s >= 60 ? `${Math.floor(s / 60)}h${s % 60 ? String(Math.round(s % 60)).padStart(2, "0") : ""}` : `${Math.round(s)}min`; };
function changeDay(day, to) {
  if (to === "rest") return { day: day.day, date: day.date, type: "rest", intensity: "rest", title: "Rest", duration: "—", description: "Rest and recover." };
  let key;
  if (to === "easier" || to === "harder") { const cur = LADDER.indexOf(day.intensity); const start = cur < 0 ? (to === "easier" ? LADDER.length - 1 : 0) : cur; key = TYPE_KEY[LADDER[Math.max(0, Math.min(LADDER.length - 1, start + (to === "easier" ? -1 : 1)))]]; }
  else key = TYPE_KEY[to];
  if (!key) return null;
  const pw = planWorkout(key, `${day.date}:${key}:${Date.now()}`);
  if (!pw) return null;
  return { day: day.day, date: day.date, type: "ride", intensity: pw.intensity, title: pw.title, duration: durOf(pw.steps), description: pw.description, steps: pw.steps };
}

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
    const nb = buildSkeleton(store.profile, store.weights || [], eventsOf(store), store.availability || [], focuses, store.weekHours || {});
    applyAvailability(nb, store.availability || []);
    patch = { block: nb, focuses };
    note = `Done — from ${from}, your plan now focuses on ${FOCUS_LABELS[focus]}. Open the calendar to see the new sessions.`;
  } else if (action === "time_off") {
    if (!store.profile) return Response.json({ error: "Set up your goal first." }, { status: 400 });
    const from = p.from, to = p.to || p.from;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from || "") || !/^\d{4}-\d{2}-\d{2}$/.test(to || "") || to < from) return Response.json({ error: "That change wasn't specific enough to apply." }, { status: 400 });
    const availability = [...(store.availability || []), { id: `${Date.now()}-c`, type: "holiday", start: from, end: to, notes: "via coach" }].sort((a, b) => a.start.localeCompare(b.start));
    const nb = buildSkeleton(store.profile, store.weights || [], eventsOf(store), availability, store.focuses || [], store.weekHours || {});
    applyAvailability(nb, availability);
    patch = { block: nb, availability };
    note = from === to ? `Done — ${from} is now clear, and I've re-shaped the plan around it.` : `Done — ${from} to ${to} is now clear, and I've re-shaped the plan around it.`;
  } else if (action === "set_day") {
    if (!block?.weeks?.length) return Response.json({ error: "No plan to adjust yet." }, { status: 400 });
    const date = p.date, to = p.to;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return Response.json({ error: "Which day did you mean?" }, { status: 400 });
    let done = false;
    for (const wk of block.weeks) {
      const di = wk.days.findIndex((d) => d.date === date);
      if (di >= 0) { const nd = changeDay(wk.days[di], to); if (nd) { wk.days[di] = nd; done = true; } break; }
    }
    if (!done) return Response.json({ error: "That day isn't in the plan, or that change isn't valid." }, { status: 400 });
    const nd = block.weeks.flatMap((w) => w.days).find((d) => d.date === date);
    patch = { block };
    note = `Done — ${date} is now ${nd.title}${nd.duration && nd.duration !== "—" ? ` (${nd.duration})` : ""}.`;
  } else if (action === "swap_days") {
    if (!block?.weeks?.length) return Response.json({ error: "No plan to adjust yet." }, { status: 400 });
    const A = p.a, B = p.b;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(A || "") || !/^\d{4}-\d{2}-\d{2}$/.test(B || "")) return Response.json({ error: "That change wasn't specific enough to apply." }, { status: 400 });
    let da = null, db = null;
    for (const wk of block.weeks) {
      const ws = new Date(wk.startDate + "T00:00:00Z").getTime();
      wk.days.forEach((d, di) => { const date = d.date || iso(ws + di * 86400000); if (date === A) da = { wk, di, d }; if (date === B) db = { wk, di, d }; });
    }
    if (!da || !db) return Response.json({ error: "One of those days isn't in the current plan." }, { status: 400 });
    const a0 = { ...da.d }, b0 = { ...db.d };
    da.wk.days[da.di] = { ...b0, day: a0.day, date: a0.date };
    db.wk.days[db.di] = { ...a0, day: b0.day, date: b0.date };
    patch = { block };
    note = `Done — swapped ${A} (now ${da.wk.days[da.di].title}) with ${B} (now ${db.wk.days[db.di].title}).`;
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
