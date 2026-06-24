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

export function buildSkeleton(profile, weights, events, availability) {
  const sched = profile.schedule || { Mon: "gym", Tue: "ride", Wed: "ride", Thu: "ride", Fri: "gym", Sat: "rest", Sun: "ride" };
  const starts = weekDates(events, profile.eventDate);
  const rideIdx = NAMES.map((n, i) => (sched[n] === "ride" ? i : -1)).filter((i) => i >= 0);
  const lastRide = rideIdx[rideIdx.length - 1];

  const weeks = starts.map((ms, wi) => {
    const phase = phaseForWeek(wi, ms, events);
    const plan = PHASE[phase];
    let r = 0;
    const days = NAMES.map((name, di) => {
      const date = iso(ms + di * DAY);
      const kind = sched[name] || "rest";
      if (kind === "rest") return { day: name, date, type: "rest", intensity: "rest", title: "Rest", duration: "—", description: "Rest and recover." };
      if (kind === "gym") return { day: name, date, type: "gym", intensity: "strength", title: "Strength", duration: "45min", description: "Gym session — strength work." };
      let key = plan.rides[r % plan.rides.length]; r++;
      if (di === lastRide && phase !== "Taper" && phase !== "Race") key = "long";
      const s = S[key];
      return { day: name, date, type: "ride", intensity: s.intensity, title: s.title, duration: fmtDur(s.mins), description: `${s.title} ride — open it to generate the intervals.` };
    });
    const mins = days.reduce((a, d) => a + (parseInt(d.duration) ? minsOf(d.duration) : 0), 0);
    return { weekNumber: wi + 1, startDate: iso(ms), phase, focus: plan.focus, targetHours: Math.round(mins / 60 * 10) / 10, days };
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
    coachNote: `Periodised around your events with recovery weeks built in, then rolling on past the last race. Open any ride to generate its intervals.`,
    generatedAt: new Date().toISOString(),
  };
}

function minsOf(s) { const h = /(\d+)h/.exec(s); const m = /h(\d+)/.exec(s) || /(\d+)min/.exec(s); return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0); }
function latestWeight(weights, profile) { if (weights && weights.length) return weights[weights.length - 1].kg; return profile.currentWeightKg || 75; }
