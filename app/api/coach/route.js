import { readStore, patchStore } from "../../../lib/store.js";
import { coachReply, currentWeekIndex, extractJson } from "../../../lib/coach.js";

export const maxDuration = 60;

const SIMPLE = ["ease_week", "rest_today"];

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
    // Pull a structured [[PROPOSAL]]{...}[[/PROPOSAL]] change, else fall back to simple [[tag]]s.
    let proposal = null, content = raw;
    const pm = content.match(/\[\[PROPOSAL\]\]([\s\S]*?)\[\[\/PROPOSAL\]\]/);
    if (pm) { try { proposal = extractJson(pm[1]); } catch {} content = content.replace(pm[0], "").trim(); }
    if (!proposal) {
      for (const key of SIMPLE) { const tag = `[[${key}]]`; if (content.includes(tag)) { proposal = { action: key, summary: key === "ease_week" ? "Ease this week" : "Make today a rest day" }; content = content.split(tag).join(""); } }
    }
    content = content.trim();
    if (proposal && SIMPLE.includes(proposal.action) && !block) proposal = null;
    const msg = { role: "assistant", content, ts: Date.now() };
    if (proposal?.action) msg.proposal = proposal;
    const chat = [...history, msg].slice(-60);
    const saved = await patchStore({ coachChat: chat });
    return Response.json({ chat: saved.coachChat });
  } catch (e) {
    const m = String(e?.message || "");
    if (/api[_-]?key|authentication|401/i.test(m)) {
      return Response.json({ error: "The AI coach isn't configured: your Anthropic API key is missing or invalid. Add a valid ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables, then redeploy." }, { status: 500 });
    }
    return Response.json({ error: m || "Coach is unavailable." }, { status: 500 });
  }
}

export async function DELETE() {
  const saved = await patchStore({ coachChat: [] });
  return Response.json({ chat: saved.coachChat });
}
