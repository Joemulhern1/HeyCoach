import { readStore, patchStore } from "../../../lib/store.js";
import { generateBlock, fillWeekDetail, currentWeekIndex } from "../../../lib/coach.js";

export const maxDuration = 60;

export async function POST() {
  const store = await readStore();
  if (!store.profile) return Response.json({ error: "Set up your goal first." }, { status: 400 });
  try {
    const block = await generateBlock(store.profile, store.weights || [], store.progression);
    // Fill the current week's detail immediately so it's ready to ride / export.
    const idx = currentWeekIndex(block);
    try {
      block.weeks[idx].days = await fillWeekDetail(block.weeks[idx], store.profile, store.sessions || [], store.weights || [], store.progression);
      block.weeks[idx].detailed = true;
    } catch { /* skeleton still usable; detail can be prepared on demand */ }
    return Response.json(await patchStore({ block }));
  } catch (e) {
    return Response.json({ error: e.message || "Failed to build the plan." }, { status: 500 });
  }
}
