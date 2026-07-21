import { ask, askWithImage, askWithImages, chat, PLAN_MODEL } from "./anthropic.js";
import { estimateTSS } from "./parse.js";
import { progressionSummary } from "./progression.js";

function weeksOut(eventDate) {
  const ms = new Date(eventDate).getTime() - Date.now();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24 * 7)));
}

// Pull a JSON object out of a model response: strip code fences, take the outermost {...},
// drop trailing commas, then parse. Tolerant of the small formatting slips models make.
export function extractJson(raw) {
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

// Build the model message array from stored history: keep the last 16 turns, ensure the first
// is a user turn (API requirement), and strip metadata like timestamps. Pure + testable.
export function coachMessages(history) {
  // The API requires messages to start with a user turn and strictly alternate user/assistant.
  // Apply-confirmations can leave two assistant turns in a row, so we merge consecutive
  // same-role turns and drop any leading assistant turns.
  const src = (history || []).slice(-16).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
  const out = [];
  for (const m of src) {
    if (!out.length && m.role !== "user") continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += "\n\n" + m.content;
    else out.push({ role: m.role, content: m.content });
  }
  return out;
}

// Conversational coach with memory of the running thread. `history` is [{role,content}].
export async function coachReply(history, profile, ctx, sessions, weights, progression) {
  const system = `You are HeyCoach — ${profile.displayName || "the athlete"}'s personal cycling coach and nutritionist. You are warm, direct and practical. Reply conversationally in 2-6 sentences; only use a short list when it genuinely helps. Build on earlier messages in this conversation and refer back to what they've told you. If you lack the data to answer well, say so and ask a brief follow-up.

ATHLETE SNAPSHOT
- FTP ${profile.currentFTP}W → target ${profile.targetFTP}W. ${weightText(weights, profile)}
- Goal: "${profile.eventName}" on ${profile.eventDate}.
- Progression levels: ${progressionSummary(progression)}.
- This week: ${ctx?.weekFocus || "no active plan week"}.
- Recent sessions:
${recentSessionsText(sessions, profile)}

CHANGING THE PLAN: When the athlete asks you to change their training plan or calendar (shift focus, prep for indoor/Zwift racing, switch to base or climbing, ease off, take a day, can't train on a certain day, move a session), don't silently agree — describe what you'll do in a sentence or two, then ASK them to confirm. Emit the change as a JSON proposal wrapped in [[PROPOSAL]] and [[/PROPOSAL]] at the very end. Never mention the tags or JSON in your prose. Allowed proposals (emit at most one):
[[PROPOSAL]]{"action":"set_focus","from":"YYYY-MM-DD","focus":"zwift_racing|base|climbing|recovery|general","summary":"one clear sentence describing the change"}[[/PROPOSAL]]
[[PROPOSAL]]{"action":"time_off","from":"YYYY-MM-DD","to":"YYYY-MM-DD","summary":"..."}[[/PROPOSAL]] — for "I can't train tomorrow / I'm away Thu–Sun / no riding next Tuesday". Use the same date for from and to for a single day; the plan re-shapes around it.
[[PROPOSAL]]{"action":"swap_days","a":"YYYY-MM-DD","b":"YYYY-MM-DD","summary":"..."}[[/PROPOSAL]] — for "move tomorrow's session to Saturday" — swaps what's planned on the two dates.
[[PROPOSAL]]{"action":"ease_week","summary":"..."}[[/PROPOSAL]]
[[PROPOSAL]]{"action":"rest_today","summary":"..."}[[/PROPOSAL]]
Today is ${new Date().toISOString().slice(0, 10)} (${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date().getDay()]}). Resolve natural language to ISO dates from that ("tomorrow", "next Tuesday", "this weekend"). "general" clears a focus back to normal event-based training. Only emit a proposal when they're genuinely asking to change the plan.`;

  return chat(coachMessages(history), system, 800);
}

export async function answerQuestion(question, profile, plan, sessions, weights, progression) {
  const prompt = `You are HeyCoach, the athlete's personal cycling coach and nutritionist. Answer directly and practically in 2-6 sentences. No lists unless essential.

ATHLETE: ${profile.currentFTP}W FTP -> ${profile.targetFTP}W target. ${weightText(weights, profile)} Goal "${profile.eventName}" on ${profile.eventDate}.
PROGRESSION LEVELS: ${progressionSummary(progression)}.
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

// Consolidate MULTIPLE screenshots of the SAME ride (summary, power, HR, laps, map…) into one
// session. The model sees every image together and merges the fields — different shots surface
// different numbers, and we take the most complete/authoritative value for each.
export async function extractSessionFromImages(images) {
  if (!images?.length) throw new Error("No images provided.");
  if (images.length === 1) return extractSessionFromImage(images[0].base64, images[0].mediaType);
  const prompt = `These ${images.length} screenshots are ALL from the SAME single cycling activity — different views (summary, power, heart rate, cadence, laps, elevation, map). Combine them into ONE set of stats. If a value appears in more than one screenshot, prefer the clearest/most specific; never invent numbers. Reply with JSON only — no prose, no code fences. Use null for anything not shown in any screenshot.
{"name": string|null, "date": "YYYY-MM-DD"|null, "durationSec": number|null, "distanceKm": number|null, "avgPower": number|null, "maxPower": number|null, "normalizedPower": number|null, "avgHr": number|null, "maxHr": number|null, "elevationGainM": number|null, "avgCadence": number|null, "best20MinPower": number|null, "kilojoules": number|null}`;
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await askWithImages(prompt, images, 800);
    try { return extractJson(raw); } catch (e) { lastErr = e; }
  }
  throw new Error("Couldn't read those screenshots — try clearer crops of the activity data.");
}

/* ───────────────── Multi-week block (calendar) ───────────────── */

function mondayOf(d) {
  const x = new Date(d);
  const off = (x.getDay() + 6) % 7; // 0 = Monday
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - off);
  return x;
}
const isoDate = (d) => new Date(d).toISOString().slice(0, 10);

const DAY = 86400000;
// Monday-start dates from this week to a horizon: 2 weeks past the last upcoming event,
// or a rolling 13 weeks if there are none — so the calendar never dead-ends.
export function blockWeekDates(events, fallbackEventDate) {
  const start = mondayOf(new Date());
  const future = (events || []).map((e) => mondayOf(e.date)).filter((d) => d >= start).sort((a, b) => a - b);
  let end;
  if (future.length) end = new Date(future[future.length - 1].getTime() + 14 * DAY);
  else if (fallbackEventDate) end = mondayOf(fallbackEventDate);
  else end = new Date(start.getTime() + 13 * 7 * DAY);
  let n = Math.round((end - start) / (7 * DAY)) + 1;
  n = Math.max(4, Math.min(26, n));
  return Array.from({ length: n }, (_, i) => isoDate(new Date(start.getTime() + i * 7 * DAY)));
}

// Index of the week containing today.
export function currentWeekIndex(block) {
  if (!block?.weeks?.length) return 0;
  const today = isoDate(new Date());
  for (let i = block.weeks.length - 1; i >= 0; i--) {
    if (block.weeks[i].startDate <= today) return i;
  }
  return 0;
}

// Generate the whole periodised block (skeleton — no interval steps yet).
// Force any day that falls inside a holiday/illness range to "off" — applied after generation
// (and after a week is re-detailed) so unavailability is always honoured regardless of the model.
export function applyAvailability(block, availability) {
  if (!block?.weeks || !availability?.length) return block;
  const find = (date) => availability.find((a) => date >= a.start && date <= a.end);
  for (const wk of block.weeks) {
    const ws = new Date(wk.startDate + "T00:00:00Z").getTime();
    wk.days = (wk.days || []).map((d, di) => {
      const date = new Date(ws + di * DAY).toISOString().slice(0, 10);
      const a = find(date);
      if (!a) return d.status === "off" ? { ...d, status: undefined } : d;
      return { day: d.day, date: d.date || date, type: "rest", intensity: "rest", title: a.type === "illness" ? "Illness — off" : "Holiday — off", duration: "—", description: a.notes || "No training — recover.", status: "off" };
    });
  }
  return block;
}

export async function generateBlock(profile, weights, progression, events, availability) {
  const dates = blockWeekDates(events, profile.eventDate);
  const startMs = new Date(dates[0]).getTime();
  const cw = currentWeight(weights, profile);
  const evList = (events || [])
    .filter((e) => e.date >= dates[0])
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => { const wk = Math.floor((new Date(e.date).getTime() - startMs) / (7 * DAY)) + 1; return `"${e.name}" on ${e.date} (priority ${e.priority || "A"}, ~week ${wk})`; });
  const eventsText = evList.length ? evList.join("; ") : "No specific events yet — build general fitness toward the FTP and weight targets.";
  const availText = (availability || []).length
    ? availability.map((a) => `${a.type} ${a.start} to ${a.end}`).join("; ")
    : "none";
  const prompt = `You are HeyCoach, an expert cycling coach and sports nutritionist. Design a COMPLETE periodised training block across the whole horizon below. Return ONLY valid JSON — no markdown, no preamble.

ATHLETE
- Current FTP ${profile.currentFTP}W, Target FTP ${profile.targetFTP}W
- ${weightText(weights, profile)}
- Level: ${profile.experience}
- Progression levels (1-10 per zone; higher = stronger). Bias toward higher zones, keep lower ones conservative: ${progressionSummary(progression)}
- Fixed weekly structure (each week uses EXACTLY these day types): ${JSON.stringify(profile.schedule)}

EVENTS TO PERIODISE AROUND: ${eventsText}

TIME OFF — NO TRAINING in these ranges (deload into a holiday; ease back gently after illness): ${availText}

HORIZON: ${dates.length} weeks. Use these Monday start dates, one week object per date, in order:
${JSON.stringify(dates)}

RULES
- Periodise around EVERY event by priority: A events get a full taper so the athlete peaks fresh that week; B events get a short 2-3 day sharpen (no full taper); C events are trained straight through. Build toward each peak, recover after.
- The week that contains an A or B event should be lighter (taper) and name the event in its focus.
- After the LAST event, continue any remaining weeks as a transition/base block (recovery then aerobic rebuild) — never just stop. This is an ongoing, year-round plan.
- Insert a lighter Recovery week roughly every 3-4 weeks of building.
- For EACH week: weekNumber, startDate (from the list), phase (Base/Build/Peak/Taper/Recovery/Transition), focus (short phrase), targetHours (number), and 7 days Mon->Sun matching the fixed structure.
- Each day: {day, type (gym/ride/rest), intensity (recovery/endurance/tempo/threshold/vo2/strength/rest), title (short), duration (e.g. "1h"), description (ONE short sentence, watts as %FTP or sets x reps)}. Do NOT include interval steps here.
- Nutrition: overall training-day vs rest-day kcal + daily protein g for the ${cw}->${profile.targetWeightKg}kg cut — fuel hard/long days, deficit on easy/rest days, protein 1.8-2.2 g/kg, cap loss ~0.5kg/week.

JSON SHAPE
{
 "summary": "one or two sentences on the season strategy",
 "phases": [{"name":"Base","weeks":"1-4","focus":"..."}],
 "weeks": [
   {"weekNumber":1,"startDate":"YYYY-MM-DD","phase":"Base","focus":"...","targetHours":8,
    "days":[{"day":"Mon","type":"gym","intensity":"strength","title":"...","duration":"45min","description":"..."}]}
 ],
 "nutrition": {"trainingDayCalories": 2650, "restDayCalories": 2100, "proteinG": 165, "notes":"one sentence"},
 "coachNote": "1-2 sentences referencing the events, the phases and the weight target"
}`;

  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await ask(prompt, 8000, PLAN_MODEL);
    try {
      const block = extractJson(raw);
      if (!Array.isArray(block.weeks) || !block.weeks.length) throw new Error("Block came back empty.");
      block.generatedAt = new Date().toISOString();
      return block;
    } catch (e) { lastErr = e; }
  }
  throw new Error("The coach returned an unreadable plan — please try again.");
}

// Fill the detailed interval steps for ONE week (so its rides can export to Garmin).
export async function fillWeekDetail(week, profile, sessions, weights, progression) {
  const prompt = `You are HeyCoach. Add detailed structured intervals to this single training week so each ride can be exported to a Garmin device. Return ONLY valid JSON.

ATHLETE: FTP ${profile.currentFTP}W, ${profile.experience}.
PROGRESSION LEVELS (1-10 per zone; push higher zones, ease lower ones): ${progressionSummary(progression)}
WEEK: phase ${week.phase}, focus "${week.focus}".
RECENT SESSIONS (adapt intensity to these):
${recentSessionsText(sessions, profile)}
DAYS (keep each day's type and intensity; refine the description; add steps for ride days):
${JSON.stringify(week.days)}

RULES
- Return all 7 days in the same order, same type and intensity.
- For RIDE days add "steps": [{"name","durationSec","intensity":"warmup|active|rest|cooldown|recovery","powerLowPct","powerHighPct"}] including warmup + cooldown; power as %FTP (FTP is ${profile.currentFTP}W).
- gym/rest days: no steps. Keep descriptions to one concrete sentence.

JSON: {"days":[ ...7 day objects... ]}`;

  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await ask(prompt, 4000, PLAN_MODEL);
    try {
      const data = extractJson(raw);
      if (!Array.isArray(data.days) || data.days.length < 1) throw new Error("Week detail incomplete.");
      return data.days;
    } catch (e) { lastErr = e; }
  }
  throw new Error("Couldn't prepare that week — please try again.");
}
