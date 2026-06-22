import { readStore } from "../../../lib/store.js";
import { answerQuestion } from "../../../lib/coach.js";

export const maxDuration = 60;

export async function POST(req) {
  const { question } = await req.json();
  if (!question?.trim()) return Response.json({ error: "Ask a question." }, { status: 400 });
  const store = await readStore();
  if (!store.profile) return Response.json({ error: "Set up your goal first." }, { status: 400 });
  try {
    const answer = await answerQuestion(question, store.profile, store.plan, store.sessions || [], store.weights || []);
    return Response.json({ answer });
  } catch (e) {
    return Response.json({ error: e.message || "Coach is unavailable." }, { status: 500 });
  }
}
