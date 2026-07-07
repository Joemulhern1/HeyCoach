import { ask } from "../../../../lib/anthropic.js";

export const dynamic = "force-dynamic";

// Pings the model with a tiny request so the user can see exactly whether the AI is reachable
// (and, if not, the precise error) — turns "the coach doesn't work" into a concrete diagnosis.
export async function GET() {
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
  try {
    const t0 = Date.now();
    const reply = await ask("Reply with exactly: OK", 10);
    return Response.json({ ok: true, model, ms: Date.now() - t0, sample: (reply || "").slice(0, 24) });
  } catch (e) {
    return Response.json({ ok: false, model, error: String(e?.message || e) });
  }
}
