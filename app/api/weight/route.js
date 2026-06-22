import { readStore, patchStore } from "../../../lib/store.js";

export async function POST(req) {
  const { kg, date } = await req.json();
  const w = Number(kg);
  if (!w || w < 30 || w > 250) return Response.json({ error: "Enter a valid weight in kg." }, { status: 400 });
  const store = await readStore();
  const entry = { id: `${Date.now()}`, kg: Number(w.toFixed(1)), date: date || new Date().toISOString() };
  return Response.json(await patchStore({ weights: [...(store.weights || []), entry] }));
}

export async function DELETE(req) {
  const { id } = await req.json();
  const store = await readStore();
  return Response.json(await patchStore({ weights: (store.weights || []).filter((w) => w.id !== id) }));
}
