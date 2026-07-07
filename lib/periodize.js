// Deterministic periodization — builds the whole season instantly in code (no LLM, no timeout).
// Base -> Build -> Peak -> Taper around A/B events, recovery weeks every ~4th week, and a
// rolling transition block past the last event. The AI is used only later, to detail a week's
// intervals on demand. This is standard rule-based coaching: predictable and reliable.

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
const PHASE = {
  Base: { rides: ["end", "tempo", "ss", "end"], focus: "Aerobic base + strength" },
  Build: { rides: ["ss", "thr", "vo2", "end"], focus: "Threshold & sweet-spot build" },
  Peak: { rides: ["vo2", "thr", "vo2", "end"], focus: "Sharpen race power" },
  Taper: { rides: ["open", "end", "rec", "open"], focus: "Freshen up for race day" },
  Recovery: { rides: ["rec", "end", "rec", "end"], focus: "Deload — absorb the work" },
  Transition: { rides: ["end", "tempo", "end", "rec"], focus: "Off-season aerobic maintenance" },
  Race: { rides: ["open", "rec", "end", "end"], focus: "Race week" },
};

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
  climbing: { rides: ["thr", "ss", "end", "thr"], noLong: false, label: "Climbing — threshold & long efforts" },
  recovery: { rides: ["rec", "end", "rec", "end"], noLong: true, label: "Recovery — deliberate deload" },
};
export const FOCUS_LABELS = { zwift_racing: "Zwift racing", base: "aerobic base", climbing: "climbing", recovery: "recovery", general: "your event" };

function activeFocus(focuses, weekStartISO) {
  const applic = (focuses || []).filter((f) => f.from <= weekStartISO).sort((a, b) => a.from.localeCompare(b.from));
  return applic.length ? applic[applic.length - 1].focus : "general";
}

export function buildSkeleton(profile, weights, events, availability, focuses) {
  const sched = profile.schedule || { Mon: "gym", Tue: "ride", Wed: "ride", Thu: "ride", Fri: "gym", Sat: "rest", Sun: "ride" };
  const starts = weekDates(events, profile.eventDate);
  const rideIdx = NAMES.map((n, i) => (sched[n] === "ride" ? i : -1)).filter((i) => i >= 0);
  const lastRide = rideIdx[rideIdx.length - 1];

  const weeks = starts.map((ms, wi) => {
    const phase = phaseForWeek(wi, ms, events);
    const plan = PHASE[phase];
    const focus = activeFocus(focuses, iso(ms));
    const fo = FOCUS_RIDES[focus];
    const ridePool = fo ? fo.rides : plan.rides;
    const noLong = fo ? fo.noLong : false;
    let r = 0;
    const days = NAMES.map((name, di) => {
      const date = iso(ms + di * DAY);
      const kind = sched[name] || "rest";
      if (kind === "rest") return { day: name, date, type: "rest", intensity: "rest", title: "Rest", duration: "—", description: "Rest and recover." };
      if (kind === "gym") return { day: name, date, type: "gym", intensity: "strength", title: "Strength", duration: "45min", description: "Gym session — strength work." };
      let key = ridePool[r % ridePool.length]; r++;
      if (di === lastRide && !noLong && phase !== "Taper" && phase !== "Race") key = "long";
      const s = S[key];
      const steps = stepsFor(key);
      const dur = steps ? fmtDur(stepsMins(steps)) : fmtDur(s.mins);
      return { day: name, date, type: "ride", intensity: s.intensity, title: s.title, duration: dur, description: describe(key) || `${s.title} ride.`, ...(steps ? { steps } : {}) };
    });
    const mins = days.reduce((a, d) => a + (parseInt(d.duration) ? minsOf(d.duration) : 0), 0);
    const focusLabel = fo ? fo.label : plan.focus;
    return { weekNumber: wi + 1, startDate: iso(ms), phase, focus: focusLabel, targetHours: Math.round(mins / 60 * 10) / 10, days };
  });

  // phase summary (group consecutive phases)
  const phases = [];
  weeks.forEach((w) => { const last = phases[phases.length - 1]; if (last && last.name === w.phase) last.end = w.weekNumber; else phases.push({ name: w.phase, start: w.weekNumber, end: w.weekNumber }); });

  const cw = latestWeight(weights, profile);
  const maint = Math.round(cw * 32);
  const nextEv = (events || []).filter((e) => e.date >= iso(Date.now())).sort((a, b) => a.date.localeCompare(b.date))[0];
  return {
    summary: `${weeks.length}-week rolling plan${nextEv ? ` toward ${nextEv.name}` : ""}, periodised ${phases.map((p) => p.name).filter((v, i, a) => a.indexOf(v) === i).join(" → ")}.`,
    phases: phases.map((p) => ({ name: p.name, weeks: p.start === p.end ? `${p.start}` : `${p.start}-${p.end}`, focus: PHASE[p.name]?.focus || "" })),
    weeks,
    nutrition: { trainingDayCalories: maint, restDayCalories: Math.max(1600, maint - 500), proteinG: Math.round(cw * 2), notes: "Fuel hard and long days near maintenance; hold the deficit on easy and rest days." },
    coachNote: `Periodised around your events with recovery weeks built in, then rolling on past the last race. Every ride comes with its intervals ready to view and send to your Garmin or Zwift.`,
    generatedAt: new Date().toISOString(),
  };
}

function minsOf(s) { const h = /(\d+)h/.exec(s); const m = /h(\d+)/.exec(s) || /(\d+)min/.exec(s); return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0); }
function latestWeight(weights, profile) { if (weights && weights.length) return weights[weights.length - 1].kg; return profile.currentWeightKg || 75; }
