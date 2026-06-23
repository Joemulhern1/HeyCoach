import { readStore } from "../../../lib/store.js";
import { answerQuestion, currentWeekIndex } from "../../../lib/coach.js";

export const maxDuration = 60;

export async function POST(req) {
  const { question } = await req.json();
  if (!question?.trim()) return Response.json({ error: "Ask a question." }, { status: 400 });
  const store = await readStore();
  if (!store.profile) return Response.json({ error: "Set up your goal first." }, { status: 400 });
  const block = store.block;
  const wk = block?.weeks?.[currentWeekIndex(block)];
  const ctx = wk ? { weekFocus: `${wk.phase} — ${wk.focus}` } : null;
  try {
    const answer = await answerQuestion(question, store.profile, ctx, store.sessions || [], store.weights || [], store.progression);
    return Response.json({ answer });
  } catch (e) {
    return Response.json({ error: e.message || "Coach is unavailable." }, { status: 500 });
  }
}
