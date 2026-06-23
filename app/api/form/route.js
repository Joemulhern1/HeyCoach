import { readStore } from "../../../lib/store.js";
import { computePMC } from "../../../lib/analytics.js";
import { progressionSummary } from "../../../lib/progression.js";
import { ask } from "../../../lib/anthropic.js";

export const maxDuration = 60;

export async function POST() {
  const store = await readStore();
  if (!store.profile) return Response.json({ error: "Set up your goal first." }, { status: 400 });
  const pmc = computePMC(store.sessions || [], store.profile);
  if (pmc.empty) return Response.json({ read: "Log a few rides first and I'll read your form for you." });

  const c = pmc.current;
  const p = store.profile;
  const prompt = `You are HeyCoach. Read this athlete's training-load numbers and give a short, actionable performance read in 2-4 sentences: what state they're in and the single most important thing to do next to get faster for their goal. Be specific and direct, no lists.

GOAL: ${p.eventName} on ${p.eventDate}${pmc.daysToEvent != null ? ` (${pmc.daysToEvent} days away)` : ""}.
FITNESS (CTL): ${c.ctl}. FATIGUE (ATL): ${c.atl}. FORM (TSB): ${c.tsb}. Ramp: ${pmc.rampPerWeek}/week.
PROGRESSION: ${progressionSummary(store.progression)}.
${pmc.projection ? `If load holds, projected event-day fitness ${pmc.projection.eventCtl}, form ${pmc.projection.eventTsb}.` : ""}`;

  try {
    const read = await ask(prompt, 350); // Haiku
    return Response.json({ read });
  } catch (e) {
    return Response.json({ error: e.message || "Couldn't read your form." }, { status: 500 });
  }
}
