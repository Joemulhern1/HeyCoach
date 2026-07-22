import { readStore, patchStore } from "../../../lib/store.js";
import { healDates } from "../../../lib/periodize.js";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = await readStore();
  // Self-heal: dates are positional on a Monday-start grid. If an earlier edit scrambled a day's
  // date relative to its slot, correct it on load (and persist the correction) — no rebuild needed.
  if (store.block?.weeks?.length) {
    const before = JSON.stringify(store.block.weeks.map((w) => w.days.map((d) => d.date)));
    healDates(store.block);
    const after = JSON.stringify(store.block.weeks.map((w) => w.days.map((d) => d.date)));
    if (before !== after) { try { await patchStore({ block: store.block }); } catch {} }
  }
  return Response.json(store);
}
