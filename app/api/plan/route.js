import { readStore, patchStore } from "../../../lib/store.js";
import { generatePlan } from "../../../lib/coach.js";

export const maxDuration = 60;

export async function POST() {
  const store = await readStore();
  if (!store.profile) return Response.json({ error: "Set up your goal first." }, { status: 400 });
  try {
    const plan = await generatePlan(store.profile, store.sessions || [], store.weights || []);
    return Response.json(await patchStore({ plan }));
  } catch (e) {
    return Response.json({ error: e.message || "Failed to build the week." }, { status: 500 });
  }
}
