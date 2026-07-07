import { readStore, patchStore } from "../../../lib/store.js";
import { buildSkeleton } from "../../../lib/periodize.js";
import { applyAvailability } from "../../../lib/coach.js";

export async function POST() {
  try {
    const store = await readStore();
    if (!store.profile) return Response.json({ error: "Set up your goal first." }, { status: 400 });
    let events = store.events || [];
    if (!events.length && store.profile?.eventDate) {
      events = [{ id: "legacy", name: store.profile.eventName || "Goal event", date: store.profile.eventDate, priority: "A" }];
    }
    // Instant, deterministic periodization (no model call = no timeout).
    const block = buildSkeleton(store.profile, store.weights || [], events, store.availability || [], store.focuses || []);
    applyAvailability(block, store.availability || []);
    const next = await patchStore({ block, events });
    return Response.json({ block: next.block, events: next.events });
  } catch (e) {
    return Response.json({ error: e.message || "Failed to build the plan." }, { status: 500 });
  }
}
