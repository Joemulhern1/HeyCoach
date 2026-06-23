import { readStore, patchStore } from "../../../../lib/store.js";
import { fillWeekDetail } from "../../../../lib/coach.js";

export const maxDuration = 60;

export async function POST(req) {
  const { weekIndex } = await req.json();
  const store = await readStore();
  const block = store.block;
  if (!block?.weeks?.[weekIndex]) return Response.json({ error: "No such week." }, { status: 404 });
  try {
    block.weeks[weekIndex].days = await fillWeekDetail(block.weeks[weekIndex], store.profile, store.sessions || [], store.weights || [], store.progression);
    block.weeks[weekIndex].detailed = true;
    return Response.json(await patchStore({ block }));
  } catch (e) {
    return Response.json({ error: e.message || "Couldn't prepare that week." }, { status: 500 });
  }
}
