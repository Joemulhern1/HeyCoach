import { readStore, patchStore } from "../../../lib/store.js";

function rid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

export async function POST(req) {
  const b = await req.json();
  if (!b?.name?.trim() || !b?.date) return Response.json({ error: "Name and date are required." }, { status: 400 });
  const store = await readStore();
  const events = [...(store.events || []), { id: rid(), name: b.name.trim(), date: b.date, priority: ["A", "B", "C"].includes(b.priority) ? b.priority : "A", notes: b.notes || "" }];
  events.sort((a, c) => a.date.localeCompare(c.date));
  const next = await patchStore({ events });
  return Response.json({ events: next.events });
}

export async function PATCH(req) {
  const { id, rating, ratingNote } = await req.json();
  const store = await readStore();
  const events = (store.events || []).map((e) => (e.id === id ? { ...e, rating, ratingNote: ratingNote || "" } : e));
  const next = await patchStore({ events });
  return Response.json({ events: next.events });
}

export async function DELETE(req) {
  const { id } = await req.json();
  const store = await readStore();
  const next = await patchStore({ events: (store.events || []).filter((e) => e.id !== id) });
  return Response.json({ events: next.events });
}
