import { readStore, patchStore } from "../../../../lib/store.js";

export async function POST(req) {
  const b = await req.json();
  const session = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: b.name || "Manual ride",
    source: "MANUAL",
    addedAt: new Date().toISOString(),
    date: b.date ? new Date(b.date).toISOString() : new Date().toISOString(),
    durationSec: b.durationMin ? Math.round(Number(b.durationMin) * 60) : null,
    distanceKm: b.distanceKm != null && b.distanceKm !== "" ? Number(b.distanceKm) : null,
    avgPower: b.avgPower != null && b.avgPower !== "" ? Number(b.avgPower) : null,
    avgHr: b.avgHr != null && b.avgHr !== "" ? Number(b.avgHr) : null,
  };
  const store = await readStore();
  return Response.json(await patchStore({ sessions: [session, ...(store.sessions || [])] }));
}
