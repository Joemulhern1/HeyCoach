import { readStore, patchStore } from "../../../../lib/store.js";
import { buildSkeleton } from "../../../../lib/periodize.js";
import { applyAvailability } from "../../../../lib/coach.js";

function eventsOf(store) {
  let events = store.events || [];
  if (!events.length && store.profile?.eventDate) events = [{ id: "legacy", name: store.profile.eventName || "Goal event", date: store.profile.eventDate, priority: "A" }];
  return events;
}

export async function POST(req) {
  const { weekStart, hours } = await req.json();
  if (!weekStart) return Response.json({ error: "Missing week." }, { status: 400 });
  const store = await readStore();
  if (!store.profile) return Response.json({ error: "Set up your goal first." }, { status: 400 });
  const weekHours = { ...(store.weekHours || {}) };
  const h = Number(hours);
  if (h && h >= 1 && h <= 30) weekHours[weekStart] = Math.round(h * 10) / 10; else delete weekHours[weekStart];
  const block = buildSkeleton(store.profile, store.weights || [], eventsOf(store), store.availability || [], store.focuses || [], weekHours);
  applyAvailability(block, store.availability || []);
  const saved = await patchStore({ block, weekHours });
  return Response.json({ block: saved.block });
}
