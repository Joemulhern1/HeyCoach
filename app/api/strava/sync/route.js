import { readStore, patchStore } from "../../../../lib/store.js";
import { getValidToken, fetchActivities, mapActivity } from "../../../../lib/strava.js";

export const maxDuration = 60;

export async function POST() {
  const store = await readStore();
  if (!store.strava) return Response.json({ error: "Connect Strava first." }, { status: 400 });
  try {
    const token = await getValidToken(store.strava, (next) => patchStore({ strava: next }));
    const activities = await fetchActivities(token, 30);
    const rides = activities.map(mapActivity).filter((a) => a.isRide);
    const existing = new Set((store.sessions || []).map((s) => s.id));
    const fresh = rides.filter((r) => !existing.has(r.id));
    const sessions = [...fresh, ...(store.sessions || [])];
    return Response.json({ ...await patchStore({ sessions }), imported: fresh.length });
  } catch (e) {
    return Response.json({ error: e.message || "Strava sync failed." }, { status: 500 });
  }
}
