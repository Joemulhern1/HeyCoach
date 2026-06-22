import { ask, askWithImage, PLAN_MODEL } from "./anthropic.js";
import { estimateTSS } from "./parse.js";

function weeksOut(eventDate) {
  const ms = new Date(eventDate).getTime() - Date.now();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24 * 7)));
}

// Pull a JSON object out of a model response: strip code fences, take the outermost {...},
// drop trailing commas, then parse. Tolerant of the small formatting slips models make.
function extractJson(raw) {
  let s = (raw || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found.");
  s = s.slice(start, end + 1).replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(s);
}

// Sessions that are the athlete's own data are safe to feed the AI. Strava-API data is
// only included if the user has explicitly opted in (profile.useStravaForCoaching).
function coachableSessions(sessions, profile) {
  return (sessions || []).filter((s) => s.source !== "STRAVA" || profile.useStravaForCoaching);
}

function recentSessionsText(sessions, profile) {
  const recent = [...coachableSessions(sessions, profile)]
    .sort((a, b) => new Date(b.date || b.addedAt) - new Date(a.date || a.addedAt))
    .slice(0, 8);
  if (!recent.length) return "No completed sessions logged yet.";
  return recent
    .map((s) => {
      const tss = estimateTSS(s, profile.currentFTP);
      const mins = s.durationSec ? Math.round(s.durationSec / 60) : "?";
      const bits = [
        s.date ? s.date.slice(0, 10) : "recent",
        `${mins}min`,
        s.distanceKm ? `${s.distanceKm}km` : null,
        s.avgPower ? `${s.avgPower}W avg` : null,
        s.avgHr ? `${s.avgHr}bpm avg` : null,
        tss ? `~${tss} TSS` : null,
      ].filter(Boolean);
      return `- ${bits.join(", ")}`;
    })
    .join("\n");
}

function weightText(weights, profile) {
  const cur = currentWeight(weights, profile);
  const target = profile.targetWeightKg;
  if (!target) return `Current weight ${cur}kg (no weight goal set).`;
  const sorted = [...(weights || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
  let trend = "";
  if (sorted.length >= 2) {
    const delta = (sorted[sorted.length - 1].kg - sorted[0].kg).toFixed(1);
    trend = ` Trend over ${sorted.length} weigh-ins: ${delta > 0 ? "+" : ""}${delta}kg.`;
  }
  return `Current weight ${cur}kg, target ${target}kg (${(cur - target).toFixed(1)}kg to go).${trend}`;
}

export function currentWeight(weights, profile) {
  const sorted = [...(weights || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
  return sorted.length ? sorted[0].kg : profile.currentWeightKg || profile.weightKg || 75;
}

export async function generatePlan(profile, sessions, weights) {
  const wo = weeksOut(profile.eventDate);
  const cw = currentWeight(weights, profile);
  const prompt = `You are HeyCoach, an expert cycling coach and sports nutritionist. Design ONE upcoming week of training for this athlete. Return ONLY valid JSON — no markdown, no code fences, no preamble.

ATHLETE
- Goal event: ${profile.eventName} on ${profile.eventDate} (${wo} weeks out)
- Current FTP: ${profile.currentFTP}W, Target FTP: ${profile.targetFTP}W
- ${weightText(weights, profile)}
- Level: ${profile.experience}
- Fixed weekly structure (use EXACTLY these day types): ${JSON.stringify(profile.schedule)}

RECENT COMPLETED SESSIONS (adapt to these — high load -> add recovery; consistent -> progress):
${recentSessionsText(sessions, profile)}

RULES
- Return all 7 days Mon->Sun, matching the fixed structure exactly (gym/ride/rest).
- Periodise toward target FTP for ${wo} weeks out and react to recent sessions.
- "intensity" MUST be one of: recovery, endurance, tempo, threshold, vo2, strength, rest.
- Description: ONE short sentence with concrete numbers (watts as %FTP, FTP is ${profile.currentFTP}W; sets x reps for gym).
- For each RIDE day also include "steps": the structured intervals, so it can be exported to a Garmin device. Each step: {"name","durationSec","intensity":"warmup|active|rest|cooldown|recovery","powerLowPct","powerHighPct"} where power is %FTP. Include warmup + cooldown. Gym/rest days: omit steps.
- WEIGHT: athlete is in a deficit toward ${profile.targetWeightKg || cw}kg. Use "fuel the work, diet the rest": near-maintenance kcal on hard/long ride days to protect FTP gains, the deficit on easy/rest days. Cap the implied loss at ~0.5kg/week. Protein high (1.8-2.2 g/kg) to preserve lean mass.

JSON SHAPE
{
 "weekFocus": "one phrase",
 "days": [
   {"day":"Mon","type":"gym|ride|rest","title":"short name","duration":"e.g. 1h","intensity":"allowed value","description":"one sentence","steps":[{"name":"Warmup","durationSec":600,"intensity":"warmup","powerLowPct":50,"powerHighPct":65}]}
 ],
 "nutrition": {"trainingDayCalories": 2650, "restDayCalories": 2100, "proteinG": 165, "notes":"one sentence on fuelling the deficit"},
 "coachNote": "1-2 sentences, direct voice, referencing the goal, recent sessions and the weight target"
}`;

  // The plan is long structured JSON. Generate with headroom so it can't truncate, parse
  // defensively, and retry once if the model returns something unreadable.
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await ask(prompt, 8000, PLAN_MODEL);
    try {
      const plan = extractJson(raw);
      if (!Array.isArray(plan.days) || !plan.nutrition) throw new Error("Plan came back incomplete.");
      plan.generatedAt = new Date().toISOString();
      return plan;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error("The coach returned an unreadable plan — please try Build my week again.");
}

export async function answerQuestion(question, profile, plan, sessions, weights) {
  const prompt = `You are HeyCoach, the athlete's personal cycling coach and nutritionist. Answer directly and practically in 2-6 sentences. No lists unless essential.

ATHLETE: ${profile.currentFTP}W FTP -> ${profile.targetFTP}W target. ${weightText(weights, profile)} Goal "${profile.eventName}" on ${profile.eventDate}.
THIS WEEK'S FOCUS: ${plan?.weekFocus || "n/a"}.
RECENT SESSIONS:
${recentSessionsText(sessions, profile)}

QUESTION: ${question}`;
  return ask(prompt, 700);
}

// Read a Strava/Garmin screenshot and extract a session summary (the athlete's own image).
export async function extractSessionFromImage(base64, mediaType) {
  const prompt = `This is a screenshot of a cycling activity. Extract its stats as JSON only — no prose, no code fences. Use null for anything not visible.
{"name": string|null, "date": "YYYY-MM-DD"|null, "durationSec": number|null, "distanceKm": number|null, "avgPower": number|null, "maxPower": number|null, "avgHr": number|null, "maxHr": number|null, "elevationGainM": number|null, "avgCadence": number|null}`;
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await askWithImage(prompt, base64, mediaType, 600);
    try {
      return extractJson(raw);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error("Couldn't read the screenshot — try a clearer crop of the activity summary.");
}
