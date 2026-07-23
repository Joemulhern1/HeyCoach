// Deterministic periodization — builds the whole season instantly in code (no LLM, no timeout).
// Base -> Build -> Peak -> Taper around A/B events, recovery weeks every ~4th week, and a
// rolling transition block past the last event. The AI is used only later, to detail a week's
// intervals on demand. This is standard rule-based coaching: predictable and reliable.
import { planWorkout } from "./generate.js";

const DAY = 86400000;
const NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function mondayOf(d) { const x = new Date(d); const off = (x.getDay() + 6) % 7; x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - off); return x; }
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

function weekDates(events, fallbackEventDate) {
  const start = mondayOf(new Date()).getTime();
  const future = (events || []).map((e) => mondayOf(e.date).getTime()).filter((d) => d >= start).sort((a, b) => a - b);
  let end;
  if (future.length) end = future[future.length - 1] + 14 * DAY;
  else if (fallbackEventDate) end = mondayOf(fallbackEventDate).getTime();
  else end = start + 13 * 7 * DAY;
  let n = Math.round((end - start) / (7 * DAY)) + 1;
  n = Math.max(4, Math.min(26, n));
  return Array.from({ length: n }, (_, i) => start + i * 7 * DAY);
}

// session templates -> { intensity (a progression zone), title, mins }
const S = {
  end: { intensity: "endurance", title: "Endurance", mins: 90 },
  long: { intensity: "endurance", title: "Long ride", mins: 150 },
  tempo: { intensity: "tempo", title: "Tempo", mins: 75 },
  ss: { intensity: "tempo", title: "Sweet Spot", mins: 65 },
  thr: { intensity: "threshold", title: "Threshold", mins: 60 },
  vo2: { intensity: "vo2", title: "VO2 intervals", mins: 60 },
  rec: { intensity: "recovery", title: "Recovery spin", mins: 45 },
  open: { intensity: "vo2", title: "Openers", mins: 45 },
  crit: { intensity: "vo2", title: "Zwift crit", mins: 50 },
  anaerobic: { intensity: "vo2", title: "Anaerobic 30/15s", mins: 50 },
  race: { intensity: "vo2", title: "Race day", mins: 0 },
};
// ride-day session order per phase (cycled; the week's final ride becomes a long ride except in taper/race weeks)
// Rider archetypes — training is oriented around the type of rider you want to become. Each
// reshapes the Base/Build/Peak session mix toward the demands of that discipline. Events (A/B/C)
// still drive the periodisation; the archetype drives *what kind* of work you build and sharpen.
export const ARCHETYPES = {
  allrounder: { label: "All-rounder", base: ["end", "tempo", "ss", "long"], build: ["ss", "thr", "vo2", "long"], peak: ["thr", "vo2", "thr", "end"], note: "balanced threshold, endurance and punch — strong across all terrain" },
  climber: { label: "Climber", base: ["end", "ss", "tempo", "long"], build: ["ss", "thr", "vo2", "long"], peak: ["thr", "vo2", "thr", "long"], note: "sustained climbing power and watts-per-kilo" },
  sprinter: { label: "Sprinter", base: ["end", "tempo", "sprint", "long"], build: ["sprint", "anaerobic", "vo2", "tempo"], peak: ["sprint", "anaerobic", "vo2", "crit"], note: "top-end sprint and anaerobic power" },
  tt: { label: "Time-trialist", base: ["end", "ss", "tempo", "long"], build: ["ss", "thr", "thr", "long"], peak: ["thr", "thr", "ss", "end"], note: "sustained threshold power and pacing against the clock" },
  ultra: { label: "Ultra / endurance", base: ["end", "tempo", "end", "long"], build: ["end", "ss", "tempo", "long"], peak: ["ss", "end", "tempo", "long"], note: "deep aerobic base and fatigue resistance for very long days" },
};
export const ARCHETYPE_KEYS = ["allrounder", "climber", "sprinter", "tt", "ultra"];

// The A-event you're peaking FOR — shapes the sharpening (Peak) and race-week work, on top of
// whatever kind of rider you are. Rider profile = who you are; event type = what you're peaking for.
export const EVENT_TYPES = {
  roadrace: { label: "Road race", peak: ["vo2", "anaerobic", "thr", "crit"], note: "repeated attacks, surges and a finish" },
  criterium: { label: "Criterium", peak: ["anaerobic", "crit", "sprint", "vo2"], note: "explosive repeatability and cornering surges" },
  cyclocross: { label: "Cyclocross", peak: ["anaerobic", "vo2", "crit", "sprint"], note: "repeated 30–60s max efforts, fast recovery" },
  tt10: { label: "10-mile TT", peak: ["thr", "vo2", "thr", "ss"], note: "20-minute maximal pacing" },
  tt25: { label: "25-mile / long TT", peak: ["thr", "thr", "ss", "end"], note: "sustained hour-plus threshold" },
  sportive: { label: "Sportive / gran fondo", peak: ["ss", "thr", "end", "long"], note: "all-day aerobic endurance with climbs" },
  hillclimb: { label: "Hill climb", peak: ["vo2", "thr", "anaerobic", "thr"], note: "short maximal climbing power" },
  stagerace: { label: "Stage race", peak: ["thr", "vo2", "ss", "long"], note: "back-to-back days and repeatability" },
  ultra: { label: "Ultra / audax", peak: ["end", "ss", "long", "tempo"], note: "very long steady endurance" },
  general: { label: "General fitness", peak: null, note: "no specific event demands" },
};
export const EVENT_TYPE_KEYS = Object.keys(EVENT_TYPES);

const PHASE = {
  Base: { rides: ["end", "tempo", "ss", "end"], focus: "Aerobic base + strength" },
  Build: { rides: ["ss", "thr", "vo2", "end"], focus: "Threshold & sweet-spot build" },
  Peak: { rides: ["vo2", "thr", "vo2", "end"], focus: "Sharpen race power" },
  Taper: { rides: ["open", "end", "rec", "open"], focus: "Freshen up for race day" },
  Recovery: { rides: ["rec", "end", "rec", "end"], focus: "Deload — absorb the work" },
  Transition: { rides: ["end", "tempo", "end", "rec"], focus: "Off-season aerobic maintenance" },
  Race: { rides: ["open", "rec", "end", "end"], focus: "Race week" },
};

// Fit a single day's ride to the athlete's per-day time budget (from profile.dayHours).
// Scales the easy/flexible portions; interval work stays intact — same philosophy as weekly fitting.
function fitDayToMinutes(steps, targetMin) {
  const isFlex = (s) => s.intensity === "active" && s.powerHighPct <= 78;
  const total = stepsMins(steps);
  const flex = steps.filter(isFlex).reduce((a, s) => a + s.durationSec / 60, 0);
  if (flex <= 0 || !targetMin) return steps;
  const fixed = total - flex;
  const scale = Math.max(0.15, Math.min(3.5, (Math.max(15, targetMin - 0) - fixed) / flex));
  return steps.map((s) => isFlex(s) ? { ...s, durationSec: Math.max(60, Math.round(s.durationSec * scale)) } : s);
}

function phaseForWeek(i, weekStartMs, events) {
  const wStart = iso(weekStartMs), wEnd = iso(weekStartMs + 6 * DAY);
  const evThis = (events || []).find((e) => e.date >= wStart && e.date <= wEnd);
  if (evThis) return (evThis.priority === "A") ? "Race" : (evThis.priority === "B") ? "Taper" : "Build";
  const nextA = (events || []).filter((e) => e.priority === "A" && e.date > wEnd).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (nextA) {
    const wks = Math.round((mondayOf(nextA.date).getTime() - weekStartMs) / (7 * DAY));
    if (wks === 1) return "Taper";
    if (wks <= 3) return "Peak";
    if (wks <= 7) return "Build";
    return (i % 4 === 3) ? "Recovery" : "Base";
  }
  const last = (events || [])[(events || []).length - 1];
  if (last && wStart > last.date) return (i % 4 === 3) ? "Recovery" : "Transition";
  return (i % 4 === 3) ? "Recovery" : (i < 4 ? "Base" : "Build");
}

function fmtDur(mins) { if (!mins) return "—"; const h = Math.floor(mins / 60), m = mins % 60; return h ? `${h}h${m ? String(m).padStart(2, "0") : ""}` : `${m}min`; }

// ---- Deterministic interval templates ----------------------------------------------------
// Every ride gets real, viewable, exportable intervals up front (no AI needed). Steps use the
// same schema as the library/FIT/ZWO exporters: {name,durationSec,intensity,powerLowPct,powerHighPct}.
const _wu = (min) => ({ name: "Warm-up", durationSec: min * 60, intensity: "warmup", powerLowPct: 50, powerHighPct: 70 });
const _cd = (min) => ({ name: "Cool-down", durationSec: min * 60, intensity: "cooldown", powerLowPct: 60, powerHighPct: 45 });
const _w = (name, min, lo, hi) => ({ name, durationSec: Math.round(min * 60), intensity: "active", powerLowPct: lo, powerHighPct: hi });
const _r = (min) => ({ name: "Recover", durationSec: Math.round(min * 60), intensity: "rest", powerLowPct: 50, powerHighPct: 56 });
const _reps = (n, mk, rest) => { const out = []; for (let i = 0; i < n; i++) { out.push(mk(i + 1)); if (i < n - 1 && rest) out.push(rest); } return out; };

function stepsFor(key) {
  switch (key) {
    case "rec": return [_wu(5), _w("Recovery spin", 35, 45, 55), _cd(5)];
    case "end": return [_wu(10), _w("Endurance", 70, 65, 75), _cd(10)];
    case "long": return [_wu(10), _w("Endurance", 130, 65, 75), _cd(10)];
    case "tempo": return [_wu(12), ..._reps(3, (i) => _w(`Tempo ${i}`, 12, 80, 88), _r(5)), _cd(8)];
    case "ss": return [_wu(12), ..._reps(3, (i) => _w(`Sweet Spot ${i}`, 12, 88, 94), _r(5)), _cd(8)];
    case "thr": return [_wu(15), ..._reps(3, (i) => _w(`Threshold ${i}`, 12, 96, 102), _r(6)), _cd(10)];
    case "vo2": return [_wu(15), ..._reps(5, (i) => _w(`VO2 ${i}`, 3, 110, 118), _r(3)), _cd(10)];
    case "open": return [_wu(12), ..._reps(4, (i) => _w(`Opener ${i}`, 1, 105, 115), _r(3)), _cd(8)];
    case "crit": { const out = [_wu(12)]; for (let i = 1; i <= 6; i++) { out.push(_w(`Surge ${i}`, 0.5, 115, 130)); out.push(_w("Pack tempo", 2, 80, 88)); } out.push(_w("Final sprint", 0.33, 150, 170)); out.push(_cd(8)); return out; }
    case "anaerobic": { const out = [_wu(12)]; for (let set = 0; set < 3; set++) { for (let i = 0; i < 6; i++) { out.push(_w("30s ON", 0.5, 120, 130)); out.push(_r(0.25)); } if (set < 2) out.push(_r(5)); } out.push(_cd(8)); return out; }
    default: return null; // race day: no structured file
  }
}
const stepsMins = (steps) => Math.round(steps.reduce((a, s) => a + s.durationSec, 0) / 60);

function describe(key) {
  return {
    rec: "Easy spin to flush the legs — keep it gentle.",
    end: "Steady aerobic Zone 2 — conversational the whole way.",
    long: "Long aerobic ride to build endurance — stay in Zone 2.",
    tempo: "3×12 min tempo at 80–88% FTP with short recoveries.",
    ss: "3×12 min sweet spot at 88–94% FTP — big aerobic return.",
    thr: "3×12 min at threshold (96–102% FTP) — raises your FTP.",
    vo2: "5×3 min VO2 efforts at 110–118% FTP with equal recovery.",
    open: "Short openers — a few 1-min efforts to sharpen the legs.",
    crit: "Zwift crit sim — repeated 30s surges over a tempo base, sprint finish.",
    anaerobic: "30s hard / 15s easy repeats — the punch you need for indoor racing.",
    race: "Race day — go get it.",
  }[key] || "";
}

// A "focus" biases the ride mix from a given date (e.g. switch to Zwift racing in October).
const FOCUS_RIDES = {
  zwift_racing: { rides: ["vo2", "crit", "thr", "anaerobic"], noLong: true, label: "Zwift racing — short, high-intensity indoor sessions" },
  base: { rides: ["end", "tempo", "end", "long"], noLong: false, label: "Aerobic base — long steady miles" },
  climbing: { rides: ["thr", "ss", "thr", "long"], noLong: false, label: "Climbing block — sustained threshold & long climbs" },
  sprinting: { rides: ["sprint", "anaerobic", "sprint", "end"], noLong: true, label: "Sprint block — neuromuscular power & repeatability" },
  threshold: { rides: ["thr", "ss", "thr", "end"], noLong: false, label: "Threshold block — raising sustainable power" },
  vo2: { rides: ["vo2", "vo2", "thr", "end"], noLong: true, label: "VO2 block — raising your aerobic ceiling" },
  recovery: { rides: ["rec", "end", "rec", "end"], noLong: true, label: "Recovery — deliberate deload" },
};
export const FOCUS_LABELS = { zwift_racing: "Zwift racing", base: "aerobic base", climbing: "climbing", sprinting: "sprinting", threshold: "threshold", vo2: "VO2 max", recovery: "recovery", general: "your event" };
export const FOCUS_KEYS = ["climbing", "sprinting", "threshold", "vo2", "base", "zwift_racing", "recovery"];

function activeFocus(focuses, weekStartISO) {
  // A focus with a `to` date is a short training BLOCK (e.g. 4 weeks of sprint work) and only
  // applies inside its window; one without `to` applies from its start onward.
  const applic = (focuses || [])
    .filter((f) => f.from <= weekStartISO && (!f.to || weekStartISO <= f.to))
    .sort((a, b) => a.from.localeCompare(b.from));
  return applic.length ? applic[applic.length - 1].focus : "general";
}

// Fit a week's rides into an hours budget: scale the flexible (easy/recovery) portions to hit
// the target while leaving warm-ups, cool-downs and the hard intervals intact. When time is very
// tight the quality work is protected — you cut the filler, not the intervals.
// Session priority when time is limited — what a great coach protects depends on the phase
// (which is set by proximity to your next A-event). Base guards aerobic volume; build/peak guard
// the race-relevant intensity; taper guards freshness. Higher = protect, lower = cut first.
const PRI = {
  Base: { long: 10, endurance: 8, tempo: 8, threshold: 6, vo2: 5, recovery: 4 },
  Build: { long: 6, endurance: 5, tempo: 8, threshold: 10, vo2: 9, recovery: 3 },
  Peak: { long: 3, endurance: 4, tempo: 5, threshold: 9, vo2: 10, recovery: 2 },
  Taper: { long: 2, endurance: 4, tempo: 5, threshold: 6, vo2: 7, recovery: 6 },
  Race: { long: 2, endurance: 3, tempo: 4, threshold: 6, vo2: 8, recovery: 5 },
  Recovery: { long: 3, endurance: 6, tempo: 4, threshold: 3, vo2: 2, recovery: 10 },
  Transition: { long: 7, endurance: 8, tempo: 6, threshold: 4, vo2: 3, recovery: 5 },
};
function sessionPriority(phase, d) {
  const isLong = /long/i.test(d.title) || minsOf(d.duration) >= 120;
  const key = d.intensity === "endurance" ? (isLong ? "long" : "endurance") : d.intensity;
  return (PRI[phase] && PRI[phase][key]) != null ? PRI[phase][key] : 5;
}

// Fit a week's rides into an hours budget, prioritising by phase/event. When time is tight,
// drop the lowest-value sessions (never the top one) and protect the rest; then scale the easy
// aerobic volume to land on budget. Interval sessions barely shrink, so they're kept whole or cut.
function fitWeekToHours(days, targetMin, phase) {
  const rides = days.filter((d) => d.type === "ride" && d.steps?.length);
  if (!rides.length || !targetMin) return null;
  const gymMin = days.filter((d) => d.type === "gym").reduce((a, d) => a + minsOf(d.duration), 0);
  const budget = Math.max(30, targetMin - gymMin);
  const isFlex = (s) => s.intensity === "active" && s.powerHighPct <= 78; // pure easy aerobic volume
  const meta = rides.map((d) => {
    const full = stepsMins(d.steps);
    const flex = d.steps.filter(isFlex).reduce((a, s) => a + s.durationSec / 60, 0);
    return { d, full, flex, fixed: full - flex, pri: sessionPriority(phase, d), min: (full - flex) + Math.min(flex, 15) };
  });
  const byPri = [...meta].sort((a, b) => b.pri - a.pri);
  const keep = new Set(meta.map((m) => m.d));
  const minSum = () => meta.reduce((a, m) => a + (keep.has(m.d) ? m.min : 0), 0);
  const dropped = [];
  for (let i = byPri.length - 1; i >= 1 && minSum() > budget; i--) { keep.delete(byPri[i].d); dropped.push(byPri[i].d.title); }
  for (const m of meta) {
    if (!keep.has(m.d)) { const d = m.d; d.type = "rest"; d.intensity = "rest"; d.title = "Rest (time)"; d.duration = "—"; d.description = "Dropped to fit your hours — a lower-priority session for this phase."; delete d.steps; }
  }
  const kept = meta.filter((m) => keep.has(m.d));
  const keptFixed = kept.reduce((a, m) => a + m.fixed, 0);
  const keptFlex = kept.reduce((a, m) => a + m.flex, 0);
  let scaledDown = false;
  if (keptFlex > 0) {
    const scale = Math.max(0.15, Math.min(3, (budget - keptFixed) / keptFlex));
    scaledDown = scale < 0.95;
    for (const m of kept) { m.d.steps = m.d.steps.map((s) => isFlex(s) ? { ...s, durationSec: Math.max(60, Math.round(s.durationSec * scale)) } : s); m.d.duration = fmtDur(stepsMins(m.d.steps)); }
  }
  if (dropped.length) return `Protected your key ${phase.toLowerCase()}-phase sessions; dropped ${dropped.length === 1 ? dropped[0] : dropped.length + " lower-value rides"} to fit.`;
  if (scaledDown) return "Trimmed easy aerobic volume to fit — your quality sessions are kept whole.";
  return "Added aerobic volume to use the extra time.";
}

// Ranking used for feel-based shuffling.
export const HARD_RANK = { vo2: 5, anaerobic: 5, sprint: 4, threshold: 4, tempo: 3, endurance: 2, recovery: 1, strength: 1, rest: 0 };

// Given a week and today's index, pick the best session to swap today with based on feel.
export function feelSwap(week, todayDi, feel) {
  const today = week?.days?.[todayDi];
  if (!today || today.type !== "ride" || today.status) return null;
  const cands = week.days.map((d, i) => ({ d, i })).filter(({ d, i }) => i !== todayDi && d.type === "ride" && !d.status);
  if (!cands.length) return null;
  const rank = (d) => HARD_RANK[d.intensity] || 0;
  if (feel === "fresh") {
    const hardest = cands.reduce((a, b) => (rank(b.d) > rank(a.d) ? b : a));
    if (rank(hardest.d) > rank(today)) return { targetDi: hardest.i, from: today.title, to: hardest.d.title, targetDay: hardest.d.day };
  } else if (feel === "tired") {
    const easiest = cands.reduce((a, b) => (rank(b.d) < rank(a.d) ? b : a));
    if (rank(easiest.d) < rank(today)) return { targetDi: easiest.i, from: today.title, to: easiest.d.title, targetDay: easiest.d.day };
  }
  return null;
}

// Dates are positional on a Monday-start grid — a day's date is always startDate + its index.
// Re-deriving them after any edit guarantees the calendar can never scramble, and self-heals
// any block corrupted by earlier swap bugs the moment it's touched.
export function healDates(block) {
  if (!block?.weeks) return block;
  for (const wk of block.weeks) {
    const ws = new Date(wk.startDate + "T00:00:00Z").getTime();
    wk.days = (wk.days || []).map((d, i) => ({ ...d, day: NAMES[i], date: new Date(ws + i * DAY).toISOString().slice(0, 10) }));
  }
  return block;
}

export function buildSkeleton(profile, weights, events, availability, focuses, weekHours) {
  const sched = profile.schedule || { Mon: "gym", Tue: "ride", Wed: "ride", Thu: "ride", Fri: "gym", Sat: "rest", Sun: "ride" };
  const arch = ARCHETYPES[profile.riderType] || ARCHETYPES.allrounder;
  // Peak/race work is shaped by the A-event you're building toward (road race vs 10-mile TT etc).
  const aEv = (events || []).filter((e) => e.priority === "A" && e.type && EVENT_TYPES[e.type]).sort((a, b) => a.date.localeCompare(b.date))[0]
           || ((profile.eventType && EVENT_TYPES[profile.eventType]) ? { type: profile.eventType } : null);
  const evType = aEv ? EVENT_TYPES[aEv.type] : null;
  const starts = weekDates(events, profile.eventDate);
  const rideIdx = NAMES.map((n, i) => (sched[n] === "ride" ? i : -1)).filter((i) => i >= 0);
  const lastRide = rideIdx[rideIdx.length - 1];

  const weeks = starts.map((ms, wi) => {
    const phase = phaseForWeek(wi, ms, events);
    const plan = PHASE[phase];
    const focus = activeFocus(focuses, iso(ms));
    const fo = FOCUS_RIDES[focus];
    let archPool = arch[phase === "Base" ? "base" : phase === "Build" ? "build" : phase === "Peak" ? "peak" : null];
    // In Peak, blend the event's demands over the rider's own profile.
    if (phase === "Peak" && evType?.peak) archPool = evType.peak;
    const ridePool = fo ? fo.rides : (archPool || plan.rides);
    const noLong = fo ? fo.noLong : false;
    let r = 0;
    const days = NAMES.map((name, di) => {
      const date = iso(ms + di * DAY);
      const kind = sched[name] || "rest";
      if (kind === "rest") return { day: name, date, type: "rest", intensity: "rest", title: "Rest", duration: "—", description: "Rest and recover." };
      if (kind === "gym") return { day: name, date, type: "gym", intensity: "strength", title: "Strength", duration: "45min", description: "Gym session — strength work." };
      let key = ridePool[r % ridePool.length]; r++;
      if (di === lastRide && !noLong && phase !== "Taper" && phase !== "Race") key = "long";
      const pw = planWorkout(key, `${date}:${key}`);
      if (pw) {
        let st = pw.steps;
        const cap = profile.dayHours && Number(profile.dayHours[name]);
        if (cap && cap > 0) st = fitDayToMinutes(st, cap * 60);
        return { day: name, date, type: "ride", intensity: pw.intensity, title: pw.title, duration: fmtDur(stepsMins(st)), description: pw.description, steps: st };
      }
      const s = S[key];
      const steps = stepsFor(key);
      const dur = steps ? fmtDur(stepsMins(steps)) : fmtDur(s.mins);
      return { day: name, date, type: "ride", intensity: s.intensity, title: s.title, duration: dur, description: describe(key) || `${s.title} ride.`, ...(steps ? { steps } : {}) };
    });
    const mins0 = days.reduce((a, d) => a + (parseInt(d.duration) ? minsOf(d.duration) : 0), 0);
    const budget = weekHours && weekHours[iso(ms)];
    let hoursNote = null;
    if (budget) hoursNote = fitWeekToHours(days, budget * 60, phase);
    const mins = days.reduce((a, d) => a + (parseInt(d.duration) ? minsOf(d.duration) : 0), 0);
    const focusLabel = fo ? fo.label : plan.focus;
    return { weekNumber: wi + 1, startDate: iso(ms), phase, focus: focusLabel, targetHours: Math.round(mins / 60 * 10) / 10, hoursCap: budget || null, hoursNote, days };
  });

  // phase summary (group consecutive phases)
  const phases = [];
  weeks.forEach((w) => { const last = phases[phases.length - 1]; if (last && last.name === w.phase) last.end = w.weekNumber; else phases.push({ name: w.phase, start: w.weekNumber, end: w.weekNumber }); });

  const cw = latestWeight(weights, profile);
  const maint = Math.round(cw * 32);
  const nextEv = (events || []).filter((e) => e.date >= iso(Date.now())).sort((a, b) => a.date.localeCompare(b.date))[0];
  return {
    summary: `${weeks.length}-week rolling plan${nextEv ? ` toward ${nextEv.name}` : ""}, built to make you a ${arch.label} — periodised ${phases.map((p) => p.name).filter((v, i, a) => a.indexOf(v) === i).join(" → ")}.`,
    riderType: profile.riderType || "allrounder",
    eventType: aEv?.type || profile.eventType || null,
    eventTypeLabel: evType ? evType.label : null,
    riderLabel: arch.label,
    phases: phases.map((p) => ({ name: p.name, weeks: p.start === p.end ? `${p.start}` : `${p.start}-${p.end}`, focus: PHASE[p.name]?.focus || "" })),
    weeks,
    nutrition: { trainingDayCalories: maint, restDayCalories: Math.max(1600, maint - 500), proteinG: Math.round(cw * 2), notes: "Fuel hard and long days near maintenance; hold the deficit on easy and rest days." },
    coachNote: `Periodised around your events with recovery weeks built in, then rolling on past the last race. Every ride comes with its intervals ready to view and send to your Garmin or Zwift.`,
    generatedAt: new Date().toISOString(),
  };
}

function minsOf(s) { const h = /(\d+)h/.exec(s); const m = /h(\d+)/.exec(s) || /(\d+)min/.exec(s); return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0); }
function latestWeight(weights, profile) { if (weights && weights.length) return weights[weights.length - 1].kg; return profile.currentWeightKg || 75; }
