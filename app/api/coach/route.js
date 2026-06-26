import { readStore, patchStore } from "../../../lib/store.js";
import { coachReply, currentWeekIndex } from "../../../lib/coach.js";

export const maxDuration = 60;

const SUGGESTIONS = ["ease_week", "rest_today"];

export async function POST(req) {
  const { message } = await req.json();
  if (!message?.trim()) return Response.json({ error: "Type a message." }, { status: 400 });
  const store = await readStore();
  if (!store.profile) return Response.json({ error: "Set up your goal first." }, { status: 400 });

  const history = [...(store.coachChat || []), { role: "user", content: message.trim(), ts: Date.now() }];
  const block = store.block;
  const wk = block?.weeks?.[currentWeekIndex(block)];
  const ctx = wk ? { weekFocus: `${wk.phase} — ${wk.focus}` } : null;
  try {
    const raw = await coachReply(history, store.profile, ctx, store.sessions || [], store.weights || [], store.progression);
    // Pull any action tag the coach appended, then strip it from the visible/stored text.
    let suggestion = null, content = raw;
    for (const key of SUGGESTIONS) {
      const tag = `[[${key}]]`;
      if (content.includes(tag)) { suggestion = key; content = content.split(tag).join(""); }
    }
    content = content.trim();
    // Only offer an action the plan can actually satisfy.
    if (suggestion && !block) suggestion = null;
    const msg = { role: "assistant", content, ts: Date.now() };
    if (suggestion) msg.suggestion = suggestion;
    const chat = [...history, msg].slice(-60);
    const saved = await patchStore({ coachChat: chat });
    return Response.json({ chat: saved.coachChat });
  } catch (e) {
    return Response.json({ error: e.message || "Coach is unavailable." }, { status: 500 });
  }
}

export async function DELETE() {
  const saved = await patchStore({ coachChat: [] });
  return Response.json({ chat: saved.coachChat });
}
