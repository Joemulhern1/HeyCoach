// Library expansion — systematic workout families across progression levels (L1–L10),
// each tagged with the rider archetypes it serves (gc / classics / climber / sprinter).
// Built from the same interval science as the curated set; every workout is a stable,
// named session that exports to Garmin (.FIT) and Zwift (.ZWO).

const wu = (min, lo = 50, hi = 72) => ({ name: "Warm-up", durationSec: Math.round(min * 60), intensity: "warmup", powerLowPct: lo, powerHighPct: hi });
const cd = (min, lo = 60, hi = 45) => ({ name: "Cool-down", durationSec: Math.round(min * 60), intensity: "cooldown", powerLowPct: lo, powerHighPct: hi });
const W = (name, min, lo, hi) => ({ name, durationSec: Math.round(min * 60), intensity: "active", powerLowPct: lo, powerHighPct: hi });
const Ws = (name, s, lo, hi) => ({ name, durationSec: s, intensity: "active", powerLowPct: lo, powerHighPct: hi });
const R = (min) => ({ name: "Recover", durationSec: Math.round(min * 60), intensity: "rest", powerLowPct: 50, powerHighPct: 56 });
const Rs = (s) => ({ name: "Recover", durationSec: s, intensity: "rest", powerLowPct: 48, powerHighPct: 55 });
const SPR = (name, s) => ({ name, durationSec: s, intensity: "active", powerLowPct: 150, powerHighPct: 200 });
const reps = (n, mk, rest) => { const o = []; for (let i = 0; i < n; i++) { o.push(mk(i + 1)); if (i < n - 1 && rest) o.push(rest); } return o; };

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const OUT = [];
const usedIds = new Set();
function add(name, cat, level, archetypes, description, steps) {
  let id = `x-${slug(name)}`; let k = 2;
  while (usedIds.has(id)) id = `x-${slug(name)}-${k++}`;
  usedIds.add(id);
  OUT.push({ id, name, cat, level, archetypes, description, steps });
}

// ---------- ENDURANCE (gc, climber core; everyone's base) ----------
for (const [i, mins] of [60, 75, 90, 105, 120, 150, 180, 210, 240].entries()) {
  const level = Math.min(10, 2 + i);
  add(`Endurance ${mins >= 60 ? (mins % 60 === 0 ? mins / 60 + "h" : Math.floor(mins / 60) + "h" + String(mins % 60).padStart(2, "0")) : mins + "min"}`, "endurance", level, ["gc", "climber", "classics"],
    `Steady Zone 2 for ${mins} minutes. Purpose: aerobic engine — mitochondria, fat oxidation, resilience. Conversational pace throughout; going harder makes this session worse, not better.`,
    [wu(10, 55, 65), W("Endurance", mins - 20, 65, 75), cd(10)]);
}
for (const [i, k] of [3, 5, 8].entries()) {
  add(`Endurance + ${k} surges`, "endurance", 4 + i, ["classics", "gc", "sprinter"],
    `Aerobic ride broken by ${k} one-minute surges at 110–120%. Purpose: race-day legs on a base day — practising sharp accelerations from a steady rhythm. Settle fully between surges.`,
    [wu(10, 55, 65), W("Endurance", 15, 65, 73), ...Array.from({ length: k }, (_, j) => [W(`Surge ${j + 1}`, 1, 110, 120), W("Endurance", Math.max(5, 10 - k), 65, 72)]).flat(), cd(10)]);
}
for (const [i, blocks] of [1, 2, 3].entries()) {
  add(`Z2 + ${blocks}× tempo lift`, "endurance", 3 + i, ["gc", "climber"],
    `Endurance with ${blocks} ten-minute tempo lift${blocks > 1 ? "s" : ""}. Purpose: sustained aerobic riding with just enough muscular tension to build strength without real fatigue cost.`,
    [wu(10, 55, 65), ...Array.from({ length: blocks }, () => [W("Endurance", 25, 65, 74), W("Tempo lift", 10, 80, 86)]).flat(), W("Endurance", 15, 65, 72), cd(10)]);
}

// ---------- RECOVERY ----------
for (const [i, mins] of [20, 30, 40, 50, 60].entries()) {
  add(`Recovery ${mins}min`, "recovery", 1, ["gc", "classics", "climber", "sprinter"],
    `A genuinely easy ${mins}-minute spin at 45–55%. Purpose: blood flow and freshness — this ride makes tomorrow's hard ride better. If in doubt, go easier.`,
    [W("Easy spin", mins, 45, 55)]);
}

// ---------- TEMPO ----------
for (const [i, [n, m]] of [[2, 15], [3, 10], [2, 20], [3, 12], [4, 10], [3, 15], [2, 25], [4, 12], [3, 20], [2, 30]].entries()) {
  add(`Tempo ${n}×${m}`, "tempo", 2 + Math.floor(i * 0.8), ["gc", "climber", "classics"],
    `${n} × ${m} minutes at 78–86% FTP with short recoveries. Purpose: muscular endurance — teaching the legs to hold force. Comfortably hard: short sentences possible, smooth and seated, cadence 85–95.`,
    [wu(12), ...reps(n, (j) => W(`Tempo ${j}`, m, 78, 86), R(Math.max(3, Math.round(m / 3)))), cd(8)]);
}

// ---------- SWEET SPOT (gc + climber bread-and-butter) ----------
for (const [i, [n, m]] of [[2, 12], [3, 10], [2, 15], [3, 12], [4, 10], [2, 20], [3, 15], [5, 8], [4, 12], [3, 20], [2, 25], [6, 8], [4, 15], [2, 30], [3, 25]].entries()) {
  const lvl = Math.min(10, 2 + Math.floor(i * 0.6));
  add(`Sweet Spot ${n}×${m}`, "sweetspot", lvl, ["gc", "climber"],
    `${n} × ${m} minutes at 88–94% FTP. Purpose: the highest FTP return per unit of fatigue — the backbone of GC and climbing form. Taxing but controlled; the last block should feel like honest work, not a fight.`,
    [wu(12, 55, 75), ...reps(n, (j) => W(`Sweet Spot ${j}`, m, 88, 94), R(Math.max(3, Math.round(m / 3)))), cd(8)]);
}
for (const [i, sets_] of [2, 3, 4].entries()) {
  add(`SS over-unders ×${sets_}`, "sweetspot", 5 + i, ["gc", "climber", "classics"],
    `${sets_} blocks weaving 88–90% and 94–97%. Purpose: raise sustainable power while practising surges without blowing up. The 'overs' sting slightly; the 'unders' are composure, not rest.`,
    [wu(12, 55, 75), ...Array.from({ length: sets_ }, (_, s) => [W(`Under ${s + 1}`, 6, 88, 90), W(`Over ${s + 1}`, 3, 94, 97), ...(s < sets_ - 1 ? [R(4)] : [])]).flat(), cd(8)]);
}

// ---------- THRESHOLD (the FTP builder — gc/climber/classics) ----------
for (const [i, [n, m]] of [[2, 10], [3, 8], [2, 12], [3, 10], [4, 8], [2, 15], [3, 12], [4, 10], [2, 20], [3, 15], [5, 8], [4, 12], [2, 25], [3, 20], [1, 40]].entries()) {
  const lvl = Math.min(10, 3 + Math.floor(i * 0.55));
  add(n === 1 ? `Threshold ${m}min continuous` : `Threshold ${n}×${m}`, "threshold", lvl, ["gc", "climber", "classics"],
    `${n === 1 ? `A single ${m}-minute effort` : `${n} × ${m} minutes`} at 96–102% FTP. Purpose: push your sustainable power up — the biggest single lever on race performance. Hold steady watts rather than surging; real discomfort by the final rep is the point.`,
    [wu(15, 55, 75), ...reps(n, (j) => W(`Threshold ${j}`, m, 96, 102), R(Math.max(4, Math.round(m / 2.5)))), cd(10)]);
}
for (const [i, sets_] of [3, 4, 5].entries()) {
  add(`Over-unders ${sets_}×6`, "threshold", 6 + i, ["classics", "gc", "climber"],
    `${sets_} × 6-minute blocks alternating 90–93% and 105–109%. Purpose: lactate shuttling — clearing acid while still working, exactly what happens when the race surges on a climb. The skill is relaxing back to 'under' without easing off.`,
    [wu(12, 55, 75), ...Array.from({ length: sets_ }, (_, s) => [W("Under", 2, 90, 93), W("Over", 1, 105, 109), W("Under", 2, 90, 93), W("Over", 1, 105, 109), ...(s < sets_ - 1 ? [R(4)] : [])]).flat(), cd(10)]);
}
for (const [i, sets_] of [2, 3, 4].entries()) {
  add(`Criss-cross ×${sets_}`, "threshold", 6 + i, ["gc", "classics"],
    `${sets_} continuous 9-minute blocks weaving 93–96% and 102–106% with no rest inside a block. Purpose: race-realistic threshold — holding the front group when the pace lifts. Pace the first crossings conservatively.`,
    [wu(15, 55, 75), ...Array.from({ length: sets_ }, (_, s) => [W("Low", 3, 93, 96), W("High", 3, 102, 106), W("Low", 3, 93, 96), ...(s < sets_ - 1 ? [R(5)] : [])]).flat(), cd(10)]);
}
for (const [i, [n, m]] of [[3, 8], [4, 8], [5, 8], [3, 12], [4, 10]].entries()) {
  add(`Climbing repeats ${n}×${m}`, "threshold", 5 + i, ["climber", "gc"],
    `${n} × ${m}-minute climbs at 95–102% FTP at LOW cadence (60–70 rpm). Purpose: climbing-specific strength — torque under aerobic load, exactly what long gradients demand. Stay seated, drive through the whole pedal stroke.`,
    [wu(12, 55, 75), ...reps(n, (j) => W(`Climb ${j}`, m, 95, 102), R(5)), cd(9)]);
}

// ---------- VO2 MAX (classics/climber/sprinter sharpening) ----------
for (const [i, [n, m]] of [[4, 3], [5, 3], [6, 3], [3, 4], [4, 4], [5, 4], [6, 2], [8, 2], [10, 2], [3, 5], [4, 5], [7, 3]].entries()) {
  const lvl = Math.min(10, 4 + Math.floor(i * 0.5));
  add(`VO2 ${n}×${m}`, "vo2", lvl, ["classics", "climber", "sprinter", "gc"],
    `${n} × ${m}-minute efforts at ${m >= 5 ? "106–112" : m >= 4 ? "108–114" : "110–118"}% FTP with ${m}-minute recoveries. Purpose: grow your aerobic ceiling — FTP can only ever be a fraction of VO2max. Start each rep controlled, finish honest: the last 30 seconds are where the adaptation lives.`,
    [wu(15, 55, 75), ...reps(n, (j) => W(`VO2 ${j}`, m, m >= 5 ? 106 : m >= 4 ? 108 : 110, m >= 5 ? 112 : m >= 4 ? 114 : 118), R(m)), cd(10)]);
}
for (const [i, sets_] of [2, 3, 4].entries()) {
  add(`30/30s ×${sets_}`, "vo2", 6 + i, ["classics", "sprinter", "climber"],
    `${sets_} sets of 6 × 30s at 118–125% / 30s soft. Purpose: accumulate maximum time at VO2 with recoveries too short to escape it. Keep the soft 30s rolling — never freewheel. The last set is the whole point.`,
    [wu(15, 55, 75), ...Array.from({ length: sets_ }, (_, s) => [...Array.from({ length: 6 }, (_, j) => [Ws(`On ${s + 1}.${j + 1}`, 30, 118, 125), Rs(30)]).flat(), ...(s < sets_ - 1 ? [R(5)] : [])]).flat(), cd(9)]);
}
for (const [i, sets_] of [2, 3].entries()) {
  add(`40/20s ×${sets_}`, "vo2", 7 + i, ["classics", "sprinter"],
    `${sets_} sets of 8 × 40s at 118–126% / 20s soft. Purpose: relentless VO2 accumulation with barely-there recoveries — the demand of crits and hard Zwift races. Commit to every 'on'.`,
    [wu(15, 55, 75), ...Array.from({ length: sets_ }, (_, s) => [...Array.from({ length: 8 }, (_, j) => [Ws(`On ${s + 1}.${j + 1}`, 40, 118, 126), Rs(20)]).flat(), ...(s < sets_ - 1 ? [R(5)] : [])]).flat(), cd(10)]);
}
for (const [i, n] of [4, 5, 6].entries()) {
  add(`Hard-starts ${n}×3`, "vo2", 7 + i, ["classics", "sprinter", "gc"],
    `${n} reps: 20-second near-sprint into 3 minutes held at VO2. Purpose: spike oxygen demand instantly — the move that wins races — then hold power while gasping. The hold feels harder than the number; that's the design.`,
    [wu(15, 55, 75), ...Array.from({ length: n }, (_, j) => [Ws(`Hard start ${j + 1}`, 20, 150, 170), W(`Hold ${j + 1}`, 3, 110, 118), ...(j < n - 1 ? [R(4)] : [])]).flat(), cd(9)]);
}

// ---------- ANAEROBIC (classics/sprinter weaponry) ----------
for (const [i, [n, sec]] of [[6, 60], [8, 60], [10, 60], [12, 60], [5, 90], [6, 90], [6, 45], [8, 45], [10, 45], [5, 120], [6, 120]].entries()) {
  const lvl = Math.min(10, 4 + Math.floor(i * 0.55));
  add(`Anaerobic ${n}×${sec >= 60 ? Math.round(sec / 60) + "min" : sec + "s"}`, "anaerobic", lvl, ["sprinter", "classics"],
    `${n} × ${sec}-second efforts at ${sec >= 90 ? "120–130" : "125–138"}% FTP with roughly 1:2 recovery. Purpose: anaerobic capacity — attacks, bridges, closing gaps. Near-maximal but repeatable: if the last rep matches the second, you paced it right.`,
    [wu(15, 55, 75), ...Array.from({ length: n }, (_, j) => [Ws(`Effort ${j + 1}`, sec, sec >= 90 ? 120 : 125, sec >= 90 ? 130 : 138), ...(j < n - 1 ? [Rs(sec * 2)] : [])]).flat(), cd(8)]);
}
for (const [i, sets_] of [2, 3, 4].entries()) {
  add(`30/15s ×${sets_}`, "anaerobic", 6 + i, ["sprinter", "classics"],
    `${sets_} sets of 6 × 30s at 120–130% / 15s barely-off. Purpose: the punch-recover-punch rhythm of crit and Zwift racing. The 15 seconds is one breath — stay on top of the gear and commit to every rep.`,
    [wu(15, 55, 75), ...Array.from({ length: sets_ }, (_, s) => [...Array.from({ length: 6 }, (_, j) => [Ws(`On ${s + 1}.${j + 1}`, 30, 120, 130), Rs(15)]).flat(), ...(s < sets_ - 1 ? [R(5)] : [])]).flat(), cd(8)]);
}

// ---------- SPRINT (sprinter core) ----------
for (const [i, n] of [6, 8, 10, 12].entries()) {
  add(`Sprints ${n}×10s`, "sprint", 3 + i, ["sprinter", "classics"],
    `${n} maximal 10-second sprints, ~2 minutes full recovery. Purpose: pure neuromuscular power. Quality over quantity — every sprint 100% committed, take all the recovery, stop if form collapses.`,
    [wu(15, 55, 75), ...reps(n, (j) => SPR(`Sprint ${j}`, 10), R(2)), cd(8)]);
}
for (const [i, n] of [4, 6, 8].entries()) {
  add(`Flying sprints ${n}×20s`, "sprint", 4 + i, ["sprinter"],
    `${n} × 20-second sprints from speed, full recovery. Purpose: top-end velocity — winding up a big gear and holding peak speed. Build smoothly, hit max by second 5, hold form to the line.`,
    [wu(15, 55, 75), ...reps(n, (j) => SPR(`Flying sprint ${j}`, 20), R(4)), cd(8)]);
}
for (const [i, n] of [4, 6, 8].entries()) {
  add(`Standing starts ×${n}`, "sprint", 4 + i, ["sprinter"],
    `${n} explosive starts from near-standstill in a big gear, ~12 seconds each. Purpose: raw torque and jump — the first three pedal strokes of every sprint. Full recovery between; these are strength work, not fitness work.`,
    [wu(15, 55, 75), ...reps(n, (j) => SPR(`Standing start ${j}`, 12), R(4)), cd(8)]);
}
for (const [i, n] of [6, 8, 10].entries()) {
  add(`Hill sprints ×${n}`, "sprint", 5 + i, ["sprinter", "classics", "climber"],
    `${n} maximal ~20-second efforts up a short rise, full recovery. Purpose: power against gradient — strength and speed in one. Attack from rolling speed, drive to the crest, never fade before it.`,
    [wu(15, 55, 75), ...reps(n, (j) => SPR(`Hill sprint ${j}`, 20), R(4)), cd(8)]);
}

// ---------- SPECIALTY / RACE SIM ----------
for (const [i, n] of [5, 6, 8].entries()) {
  add(`Crit sim ${n} surges`, "specialty", 6 + i, ["sprinter", "classics"],
    `${n} × 30-second corner surges at 115–130% over an 80–88% tempo base, then a sprint finish. Purpose: rehearse the exact rhythm of a criterium — surge, settle, surge. Treat the final sprint as the real thing.`,
    [wu(12, 55, 75), ...Array.from({ length: n }, (_, j) => [Ws(`Corner surge ${j + 1}`, 30, 115, 130), W("Pack tempo", 2, 80, 88)]).flat(), SPR("Sprint finish", 20), cd(8)]);
}
for (const [i, n] of [3, 4, 5].entries()) {
  add(`Road attacks ×${n}`, "specialty", 6 + i, ["classics", "gc"],
    `${n} one-minute attacks at 120–135% with incomplete recovery in the 'pack', a 10-minute threshold grind, then the final sprint. Purpose: full road-race dress rehearsal — attack, absorb, grind, finish.`,
    [wu(15, 55, 75), ...Array.from({ length: n }, (_, j) => [W(`Attack ${j + 1}`, 1, 120, 135), W("Pack", 4, 78, 86)]).flat(), W("Threshold grind", 10, 96, 101), SPR("Final sprint", 20), cd(10)]);
}
add("TT rehearsal 2×20", "specialty", 7, ["gc", "climber"], "Two 20-minute blocks at 98–103% in your race position. Purpose: pacing discipline and aero adaptation — racing the clock is a skill. Even splits; the second 20 should match the first.", [wu(15, 55, 75), ...reps(2, (j) => W(`TT effort ${j}`, 20, 98, 103), R(6)), cd(10)]);
add("TT rehearsal 3×15", "specialty", 8, ["gc", "climber"], "Three 15-minute race-pace blocks in position. Purpose: TT specificity with a little more headroom to hold form deep into fatigue.", [wu(15, 55, 75), ...reps(3, (j) => W(`TT effort ${j}`, 15, 98, 103), R(5)), cd(10)]);
add("Breakaway simulation", "specialty", 8, ["classics", "gc"], "A 3-minute attack at 115–125%, settle to 20 minutes at 92–96% 'in the break', then a 1-minute drive to the line. Purpose: the exact physiology of making a break stick.", [wu(15, 55, 75), W("The attack", 3, 115, 125), W("In the break", 20, 92, 96), W("Drive to the line", 1, 115, 130), cd(10)]);
add("Zwift race sim", "specialty", 8, ["sprinter", "classics"], "Hard 1-minute start at 130–150%, settle to sweet spot, repeated 30-second surges, sprint finish. Purpose: the brutal shape of a Zwift race — survive the start, live in the surges, win the end.", [wu(12, 55, 75), Ws("Race start", 60, 130, 150), W("Settle", 8, 88, 93), ...Array.from({ length: 5 }, (_, j) => [Ws(`Surge ${j + 1}`, 30, 118, 130), W("Hold", 2, 85, 92)]).flat(), SPR("Sprint finish", 15), cd(8)]);


// ---------- HIGH-END "+" VARIANTS (harder progressions of the staples) ----------
for (const [i, [n, m]] of [[2, 15], [3, 12], [4, 10], [2, 20], [3, 15], [5, 8]].entries()) {
  add(`Sweet Spot+ ${n}×${m}`, "sweetspot", Math.min(10, 6 + i), ["gc", "climber"],
    `${n} × ${m} minutes at the top of sweet spot (90–96% FTP). Purpose: the bridge between sweet spot and full threshold — more stimulus, still repeatable day-to-day. Noticeably harder than standard sweet spot; hold form to the last minute.`,
    [wu(12, 55, 75), ...reps(n, (j) => W(`Sweet Spot+ ${j}`, m, 90, 96), R(Math.max(3, Math.round(m / 3)))), cd(8)]);
}
for (const [i, [n, m]] of [[3, 10], [4, 8], [2, 15], [3, 12], [5, 6], [2, 20]].entries()) {
  add(`Threshold+ ${n}×${m}`, "threshold", Math.min(10, 7 + Math.floor(i * 0.6)), ["gc", "climber", "classics"],
    `${n} × ${m} minutes fractionally over FTP (100–105%). Purpose: supra-threshold time that drags FTP upward — the sharp end of the build. Expect the last rep to be a genuine fight; that is the session working.`,
    [wu(15, 55, 75), ...reps(n, (j) => W(`Threshold+ ${j}`, m, 100, 105), R(Math.max(4, Math.round(m / 2)))), cd(10)]);
}
for (const [i, [n, m]] of [[5, 5], [6, 4], [4, 6]].entries()) {
  add(`VO2 long ${n}×${m}`, "vo2", 8 + i, ["climber", "classics", "gc"],
    `${n} × ${m}-minute efforts at 105–112% — long-form VO2. Purpose: maximum aerobic stress for riders who race long climbs and sustained attacks. Pace the opening minute or the set collapses.`,
    [wu(15, 55, 75), ...reps(n, (j) => W(`VO2 ${j}`, m, 105, 112), R(m)), cd(10)]);
}
for (const [i, n] of [4, 6, 8].entries()) {
  add(`Sprint + surge combo ×${n}`, "sprint", 5 + i, ["sprinter", "classics"],
    `${n} reps: a 10-second maximal sprint straight into 1 minute at 105–115%. Purpose: sprinting on tired legs and holding speed after the jump — how finishes are actually won. Full recovery between reps.`,
    [wu(15, 55, 75), ...Array.from({ length: n }, (_, j) => [SPR(`Sprint ${j + 1}`, 10), W(`Hold ${j + 1}`, 1, 105, 115), ...(j < n - 1 ? [R(4)] : [])]).flat(), cd(8)]);
}
for (const [i, mins] of [45, 60, 75].entries()) {
  add(`Tempo sustained ${mins}min`, "tempo", 5 + i, ["gc", "climber"],
    `One continuous ${mins}-minute block at 76–84%. Purpose: pure diesel work — long muscular endurance with no rests to hide in. Settle in early, hold cadence 85+, and ride the discomfort plateau.`,
    [wu(12), W("Tempo", mins, 76, 84), cd(8)]);
}
add("Kermesse sim", "specialty", 7, ["classics", "sprinter"], "Repeated 45-second digs at 115–128% over tempo with short lulls, then a late 3-minute all-in move. Purpose: the relentless rhythm of kermesse/circuit racing — never quite recovering, always going again.", [wu(12, 55, 75), ...Array.from({ length: 6 }, (_, j) => [Ws(`Dig ${j + 1}`, 45, 115, 128), W("Lull", 2, 78, 86)]).flat(), W("Late move", 3, 108, 118), cd(9)]);
add("Points race sim", "specialty", 7, ["sprinter", "classics"], "Sprint every 'lap': 6 × 15-second sprints off a rolling 85–92% base. Purpose: repeated sprinting under aerobic load — track and crit finishing speed when it counts.", [wu(12, 55, 75), ...Array.from({ length: 6 }, (_, j) => [W("Race pace", 3, 85, 92), SPR(`Lap sprint ${j + 1}`, 15)]).flat(), cd(9)]);
add("Gran fondo grinder", "specialty", 6, ["gc", "climber"], "A long pyramid: 15 tempo, 10 sweet spot, 5 threshold, then back down without rest. Purpose: fondo/road-race pacing — a big continuous aerobic block that climbs through the zones and holds together.", [wu(12, 55, 72), W("Tempo", 15, 78, 84), W("Sweet Spot", 10, 88, 93), W("Threshold", 5, 96, 101), W("Sweet Spot", 10, 88, 93), W("Tempo", 15, 78, 84), cd(10)]);
add("Attack & recover ×6", "specialty", 8, ["classics", "gc"], "Six 30-second attacks at 125–140%, each followed by 3 minutes at 88–93% — recovering at sweet spot, not soft pedal. Purpose: making attacks while the race is still on; the recovery *is* the workout.", [wu(15, 55, 75), ...Array.from({ length: 6 }, (_, j) => [Ws(`Attack ${j + 1}`, 30, 125, 140), W("SS recover", 3, 88, 93)]).flat(), cd(10)]);

// ---------- TESTING ----------
add("Ramp test", "test", 5, ["gc", "classics", "climber", "sprinter"], "Ramp until you can't hold the wattage. FTP ≈ 75% of your best 1-minute power. No pacing needed — just hold each stage until you can't.", [wu(10, 50, 60), ...Array.from({ length: 16 }, (_, i) => { const p = 70 + i * 6; return W(`Stage ${i + 1}`, 1, p, p); }), cd(5)]);
add("20-min FTP test", "test", 7, ["gc", "classics", "climber", "sprinter"], "The classic protocol: 5-min blow-out, recover, then 20 minutes all-out. FTP ≈ average power × 0.95. Pace the first 5 minutes conservatively — most people start too hard.", [wu(15, 55, 72), W("5-min blow-out", 5, 108, 118), R(10), W("Primer", 5, 100, 108), R(5), W("20-min test", 20, 100, 115), cd(10)]);
add("8-min test ×2", "test", 6, ["gc", "classics", "climber", "sprinter"], "Two maximal 8-minute efforts with long recovery. FTP ≈ average of the two × 0.90. Useful when a 20-minute effort isn't realistic.", [wu(15, 55, 75), ...reps(2, (j) => W(`8-min effort ${j}`, 8, 100, 115), R(10)), cd(10)]);

function finalize(w) {
  let sec = 0, tss = 0;
  for (const s of w.steps) { sec += s.durationSec; const lo = s.powerLowPct ?? 150, hi = s.powerHighPct ?? 200; const mid = ((lo + hi) / 2) / 100; tss += (s.durationSec / 3600) * mid * mid * 100; }
  return { ...w, durationMin: Math.round(sec / 60), tss: Math.round(tss) };
}
export const EXPANDED = OUT.map(finalize);
