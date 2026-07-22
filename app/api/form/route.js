import { readStore } from "../../../lib/store.js";
import { computePMC } from "../../../lib/analytics.js";
import { progressionSummary } from "../../../lib/progression.js";
import { ask } from "../../../lib/anthropic.js";

export const maxDuration = 60;

export async function POST() {
  const store = await readStore();
  if (!store.profile) return Response.json({ error: "Set up your goal first." }, { status: 400 });
  const sessions = store.sessions || [];
  const pmc = computePMC(sessions, store.profile);
  if (pmc.empty) return Response.json({ read: "Log a few rides first and I'll read your form for you." });

  const c = pmc.current;
  const p = store.profile;
  const dated = sessions.filter((s) => s.date).map((s) => s.date).sort();
  const historyDays = dated.length >= 2 ? Math.round((new Date(dated[dated.length - 1]) - new Date(dated[0])) / 86400000) : 0;
  // The load model only becomes meaningful after ~4-6 weeks of consistent logging. Until then,
  // the numbers are noise — so give a deterministic, honest, encouraging read and never let the
  // AI catastrophize a meaningless CTL:ATL ratio into a "deep fatigue hole".
  const lowData = sessions.length < 12 || historyDays < 28 || c.ctl < 20;
  if (lowData) {
    const rideWord = `${sessions.length} ride${sessions.length === 1 ? "" : "s"}`;
    const span = historyDays ? ` over ${historyDays} days` : "";
    const timeLeft = pmc.daysToEvent != null ? `${pmc.daysToEvent} days` : "plenty of time";
    const read = `Early days yet — you've logged ${rideWord}${span}, so these fitness and fatigue numbers are still settling and aren't worth reading much into. A low fitness figure right now just means there isn't a lot of history in the system yet — it does not mean you're overcooked or behind. With ${timeLeft} until your event there's no rush at all: the best thing you can do is keep logging every ride and follow the plan, and the picture will sharpen quickly. You're building — trust it, and I'll give you a proper read once there's a few solid weeks in the bank.`;
    return Response.json({ read, lowData: true });
  }

  const guard = `These numbers are reasonably established, so give a proportionate read. Only suggest easing off if form (TSB) is genuinely deep-negative (below about -25) AND fatigue has been climbing for a couple of weeks. A mildly negative TSB during a build is normal, healthy and productive — frame it that way.`;

  const prompt = `You are HeyCoach — a calm, encouraging, evidence-based cycling coach. Give the athlete a short, warm, realistic read on their form in 2-4 sentences. Speak directly to them ("you"). No lists, no bold, no jargon dumps, and never catastrophize — match the confidence of your advice to how much data exists.

${guard}

GOAL: ${p.eventName} on ${p.eventDate}${pmc.daysToEvent != null ? ` — ${pmc.daysToEvent} days away, so there is plenty of time` : ""}.
NUMBERS (may be unreliable if data is thin): fitness ${Math.round(c.ctl)}, fatigue ${Math.round(c.atl)}, form ${c.tsb > 0 ? "+" : ""}${Math.round(c.tsb)}, building at ${pmc.rampPerWeek}/week.
ZONE PROGRESSION: ${progressionSummary(store.progression)}.
${!lowData && pmc.projection ? `If they hold this, projected race-day fitness ${Math.round(pmc.projection.eventCtl)}, form ${pmc.projection.eventTsb > 0 ? "+" : ""}${Math.round(pmc.projection.eventTsb)}.` : ""}

End on an encouraging note.`;

  try {
    const read = await ask(prompt, 320);
    return Response.json({ read, lowData });
  } catch (e) {
    return Response.json({ error: e.message || "Couldn't read your form." }, { status: 500 });
  }
}
