import { readStore, patchStore } from "../../../lib/store.js";
const rid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export async function POST(req) {
  const b = await req.json();
  const type = b.type === "illness" ? "illness" : "holiday";
  if (!b.start || !b.end || b.end < b.start) return Response.json({ error: "Valid start and end dates required." }, { status: 400 });
  const store = await readStore();
  const availability = [...(store.availability || []), { id: rid(), type, start: b.start, end: b.end, notes: b.notes || "" }].sort((a, c) => a.start.localeCompare(c.start));
  const next = await patchStore({ availability });
  return Response.json({ availability: next.availability });
}

export async function DELETE(req) {
  const { id } = await req.json();
  const store = await readStore();
  const next = await patchStore({ availability: (store.availability || []).filter((a) => a.id !== id) });
  return Response.json({ availability: next.availability });
}
