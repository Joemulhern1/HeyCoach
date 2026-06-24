import { readStore, patchStore } from "../../../../lib/store.js";
import { fillWeekDetail, applyAvailability } from "../../../../lib/coach.js";

export const maxDuration = 60;

export async function POST(req) {
  try {
    const { weekIndex } = await req.json();
    const store = await readStore();
    const block = store.block;
    if (!block?.weeks?.[weekIndex]) return Response.json({ error: "No such week." }, { status: 404 });
    block.weeks[weekIndex].days = await fillWeekDetail(block.weeks[weekIndex], store.profile, store.sessions || [], store.weights || [], store.progression);
    block.weeks[weekIndex].detailed = true;
    applyAvailability(block, store.availability || []); // re-assert time off after regenerating
    const next = await patchStore({ block });
    return Response.json({ block: next.block });
  } catch (e) {
    return Response.json({ error: e.message || "Couldn't prepare that week." }, { status: 500 });
  }
}
