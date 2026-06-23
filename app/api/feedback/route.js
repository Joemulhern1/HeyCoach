import { readStore, patchStore } from "../../../lib/store.js";
import { zoneFromSession, nudgeProgression } from "../../../lib/progression.js";

export async function POST(req) {
  const { sessionId, outcome } = await req.json();
  if (!["nailed", "ok", "hard", "missed"].includes(outcome)) {
    return Response.json({ error: "Bad outcome." }, { status: 400 });
  }
  const store = await readStore();
  const sessions = store.sessions || [];
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) return Response.json({ error: "No such session." }, { status: 404 });

  const zone = zoneFromSession(session, store.profile?.currentFTP);
  const progression = nudgeProgression(store.progression, zone, outcome);
  session.feedback = outcome;
  session.feedbackZone = zone;

  const next = await patchStore({ sessions, progression });
  return Response.json({ sessions: next.sessions, progression: next.progression });
}
