// HeyCoach workout generator. Composes structured workouts on demand from established interval
// frameworks (Coggan power zones; polarized / sweet-spot / threshold / VO2 / anaerobic models),
// with seeded variation so there's effectively an unlimited, ever-fresh library — and every
// session is deterministic for a given seed (so the plan stays stable across rebuilds).

// ---- seeded RNG ----
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

// ---- step builders (schema matches lib/fit.js + lib/zwo.js) ----
const wu = (m, lo = 50, hi = 70) => ({ name: "Warm-up", durationSec: Math.round(m * 60), intensity: "warmup", powerLowPct: lo, powerHighPct: hi });
const cd = (m, lo = 60, hi = 45) => ({ name: "Cool-down", durationSec: Math.round(m * 60), intensity: "cooldown", powerLowPct: lo, powerHighPct: hi });
const W = (name, m, lo, hi) => ({ name, durationSec: Math.round(m * 60), intensity: "active", powerLowPct: lo, powerHighPct: hi });
const Ws = (name, s, lo, hi) => ({ name, durationSec: s, intensity: "active", powerLowPct: lo, powerHighPct: hi });
const R = (m) => ({ name: "Recover", durationSec: Math.round(m * 60), intensity: "rest", powerLowPct: 50, powerHighPct: 56 });
const Rs = (s) => ({ name: "Recover", durationSec: s, intensity: "rest", powerLowPct: 50, powerHighPct: 56 });
const Sprint = (name, s) => ({ name, durationSec: s, intensity: "active", powerLowPct: 150, powerHighPct: 200 });
const reps = (n, mk, rest) => { const o = []; for (let i = 0; i < n; i++) { o.push(mk(i + 1)); if (i < n - 1 && rest) o.push(rest); } return o; };
const micro = (sets, n, onS, offS, lo, hi, betweenMin) => { const o = []; for (let s = 0; s < sets; s++) { for (let i = 0; i < n; i++) { o.push(Ws("ON", onS, lo, hi)); o.push(Rs(offS)); } if (s < sets - 1) o.push(R(betweenMin)); } return o; };

// ---- per-type generators (each returns { name, steps }) ----
function genEndurance(r, T) {
  const t = T || pick(r, [75, 90, 120]);
  return pick(r, [
    () => ({ name: `Endurance ${Math.round(t / 15) * 15}min`, steps: [wu(10), W("Endurance", t - 20, 65, 75), cd(10)] }),
    () => ({ name: "Z2 + Tempo finish", steps: [wu(10), W("Endurance", t - 35, 65, 74), W("Tempo finish", 15, 80, 86), cd(10)] }),
    () => { const k = pick(r, [4, 5, 6]); const blk = Math.max(6, Math.round((t - 30) / k) - 1); return { name: `Endurance + ${k} surges`, steps: [wu(10), W("Endurance", 15, 65, 72), ...reps(k, () => W("Endurance", blk, 65, 72), null).flatMap((s, i) => i % 1 === 0 ? [W("Surge", 1, 110, 120), s] : [s]), cd(10)] }; },
    () => ({ name: "Endurance + 2 sweet-spot blocks", steps: [wu(10), W("Endurance", Math.max(20, t - 64), 65, 73), W("Sweet Spot", 12, 88, 93), W("Endurance", 8, 65, 72), W("Sweet Spot", 12, 88, 93), cd(10)] }),
  ])();
}
function genTempo(r) {
  return pick(r, [
    () => ({ name: "Tempo 2×20", steps: [wu(12), ...reps(2, (i) => W(`Tempo ${i}`, 20, 78, 85), R(6)), cd(10)] }),
    () => ({ name: "Tempo 3×12", steps: [wu(12), ...reps(3, (i) => W(`Tempo ${i}`, 12, 80, 86), R(5)), cd(8)] }),
    () => ({ name: "Tempo 4×10", steps: [wu(10), ...reps(4, (i) => W(`Tempo ${i}`, 10, 80, 86), R(4)), cd(8)] }),
    () => ({ name: "Tempo pyramid", steps: [wu(12), W("Tempo 10", 10, 80, 85), R(4), W("Tempo 15", 15, 80, 85), R(5), W("Tempo 10", 10, 80, 85), cd(8)] }),
  ])();
}
function genSweetspot(r) {
  return pick(r, [
    () => ({ name: "Sweet Spot 2×20", steps: [wu(12), ...reps(2, (i) => W(`Sweet Spot ${i}`, 20, 88, 93), R(6)), cd(10)] }),
    () => ({ name: "Sweet Spot 3×12", steps: [wu(12), ...reps(3, (i) => W(`Sweet Spot ${i}`, 12, 88, 93), R(5)), cd(8)] }),
    () => ({ name: "Sweet Spot 4×10", steps: [wu(10), ...reps(4, (i) => W(`Sweet Spot ${i}`, 10, 89, 94), R(4)), cd(8)] }),
    () => ({ name: "Sweet Spot 5×8", steps: [wu(10), ...reps(5, (i) => W(`Sweet Spot ${i}`, 8, 89, 94), R(3)), cd(8)] }),
    () => ({ name: "Sweet Spot over-unders", steps: [wu(12), ...[1, 2, 3].flatMap((i) => [W(`Under ${i}`, 6, 88, 90), W(`Over ${i}`, 3, 94, 97), ...(i < 3 ? [R(4)] : [])]), cd(8)] }),
  ])();
}
function genThreshold(r) {
  return pick(r, [
    () => ({ name: "Threshold 2×20", steps: [wu(15), ...reps(2, (i) => W(`Threshold ${i}`, 20, 96, 101), R(6)), cd(10)] }),
    () => ({ name: "Threshold 3×15", steps: [wu(15), ...reps(3, (i) => W(`Threshold ${i}`, 15, 96, 101), R(6)), cd(10)] }),
    () => ({ name: "Threshold 3×12", steps: [wu(12), ...reps(3, (i) => W(`Threshold ${i}`, 12, 97, 102), R(5)), cd(9)] }),
    () => ({ name: "Threshold 4×10", steps: [wu(12), ...reps(4, (i) => W(`Threshold ${i}`, 10, 98, 103), R(5)), cd(9)] }),
    () => ({ name: "Over-unders 4×6", steps: [wu(12), ...[1, 2, 3, 4].flatMap((i) => [W("Under", 2, 90, 93), W("Over", 1, 105, 109), W("Under", 2, 90, 93), W("Over", 1, 105, 109), ...(i < 4 ? [R(4)] : [])]), cd(10)] }),
    () => ({ name: "Criss-cross threshold", steps: [wu(15), ...[1, 2, 3].flatMap((i) => [W("Low", 3, 93, 96), W("High", 3, 102, 106), W("Low", 3, 93, 96), ...(i < 3 ? [R(5)] : [])]), cd(10)] }),
  ])();
}
function genVo2(r) {
  return pick(r, [
    () => ({ name: "VO2 5×3", steps: [wu(15), ...reps(5, (i) => W(`VO2 ${i}`, 3, 110, 118), R(3)), cd(10)] }),
    () => ({ name: "VO2 6×3", steps: [wu(15), ...reps(6, (i) => W(`VO2 ${i}`, 3, 112, 118), R(3)), cd(9)] }),
    () => ({ name: "VO2 4×4", steps: [wu(15), ...reps(4, (i) => W(`VO2 ${i}`, 4, 108, 114), R(4)), cd(10)] }),
    () => ({ name: "VO2 8×2", steps: [wu(15), ...reps(8, (i) => W(`VO2 ${i}`, 2, 115, 122), R(2)), cd(9)] }),
    () => ({ name: "40/20s VO2", steps: [wu(15), ...micro(pick(r, [2, 3]), 8, 40, 20, 118, 126, 5), cd(10)] }),
    () => ({ name: "Hard-starts 5×4", steps: [wu(15), ...[1, 2, 3, 4, 5].flatMap((i) => [Ws(`Hard start ${i}`, 20, 150, 170), W(`Hold ${i}`, 3, 112, 118), ...(i < 5 ? [R(4)] : [])]), cd(9)] }),
    () => ({ name: "VO2 ramps 4×3", steps: [wu(15), ...[1, 2, 3, 4].flatMap((i) => [W("Ramp lo", 1, 108, 112), W("Ramp mid", 1, 114, 118), W("Ramp hi", 1, 120, 125), ...(i < 4 ? [R(4)] : [])]), cd(9)] }),
  ])();
}
function genAnaerobic(r) {
  return pick(r, [
    () => ({ name: "Anaerobic 8×45s", steps: [wu(15), ...[1, 2, 3, 4, 5, 6, 7, 8].flatMap((i) => [Ws(`Effort ${i}`, 45, 126, 138), ...(i < 8 ? [Rs(135)] : [])]), cd(8)] }),
    () => ({ name: "30/15s ×3", steps: [wu(15), ...micro(3, 6, 30, 15, 120, 130, 5), cd(8)] }),
    () => ({ name: "Anaerobic 6×2", steps: [wu(15), ...reps(6, (i) => W(`Effort ${i}`, 2, 122, 132), R(4)), cd(9)] }),
    () => ({ name: "Anaerobic 10×1", steps: [wu(15), ...reps(10, (i) => W(`Effort ${i}`, 1, 120, 130), R(2)), cd(8)] }),
  ])();
}
function genSprint(r) {
  return pick(r, [
    () => ({ name: "Sprints 10×10s", steps: [wu(15), ...reps(10, () => Sprint("Sprint", 10), R(2)), cd(8)] }),
    () => ({ name: "Standing starts 6", steps: [wu(15), ...reps(6, () => Sprint("Standing start", 12), R(4)), cd(8)] }),
    () => ({ name: "Flying sprints 6×20s", steps: [wu(15), ...reps(6, () => Sprint("Flying sprint", 20), R(4)), cd(8)] }),
    () => ({ name: "Hill sprints 8", steps: [wu(15), ...reps(8, () => Sprint("Hill sprint", 20), R(4)), cd(8)] }),
  ])();
}
function genRecovery(r) { const t = pick(r, [30, 40, 50]); return { name: `Recovery spin ${t}min`, steps: [W("Easy spin", t, 45, 55)] }; }
function genOpeners(r) { return { name: "Openers", steps: [wu(12), ...reps(pick(r, [3, 4]), (i) => W(`Opener ${i}`, 1, 105, 115), R(3)), cd(8)] }; }
function genCrit(r) { const n = pick(r, [5, 6, 7]); const out = [wu(12)]; for (let i = 1; i <= n; i++) { out.push(Ws(`Corner surge ${i}`, 30, 115, 130)); out.push(W("Pack tempo", 2, 80, 88)); } out.push(Sprint("Sprint finish", 20)); out.push(cd(8)); return { name: "Criterium simulation", steps: out }; }

const GENERATORS = { endurance: genEndurance, tempo: genTempo, sweetspot: genSweetspot, threshold: genThreshold, vo2: genVo2, anaerobic: genAnaerobic, sprint: genSprint, recovery: genRecovery, openers: genOpeners, crit: genCrit };
export const GEN_TYPES = ["endurance", "tempo", "sweetspot", "threshold", "vo2", "anaerobic", "sprint", "recovery"];
const CAT_OF = { endurance: "endurance", tempo: "tempo", sweetspot: "sweetspot", threshold: "threshold", vo2: "vo2", anaerobic: "anaerobic", sprint: "sprint", recovery: "recovery", openers: "vo2", crit: "specialty" };
const INTENSITY_OF = { endurance: "endurance", tempo: "tempo", sweetspot: "tempo", threshold: "threshold", vo2: "vo2", anaerobic: "vo2", sprint: "vo2", recovery: "recovery", openers: "vo2", crit: "vo2" };

function finalize(steps) {
  let sec = 0, tss = 0;
  for (const s of steps) { sec += s.durationSec; const mid = ((s.powerLowPct + s.powerHighPct) / 2) / 100; tss += (s.durationSec / 3600) * mid * mid * 100; }
  return { durationMin: Math.round(sec / 60), tss: Math.round(tss) };
}
// Coach-quality descriptions: purpose ("why"), execution ("how"), and feel ("what to expect").
// Matched per workout name where it matters; falls back to a strong per-type brief.
const DESC = {
  "Tempo 2×20": "Two sustained 20-minute tempo blocks. Purpose: muscular endurance — teaching your legs to hold force for a long time. Ride smooth and seated, cadence 85–95. It should feel 'comfortably hard': you can speak in short sentences, but you're glad when each block ends.",
  "Tempo pyramid": "Tempo blocks of 10–15–10 minutes. Purpose: sustained aerobic strength with a mental midpoint to break it up. Settle into a rhythm early; the 15 is the test. Comfortably hard throughout — never straining.",
  "Sweet Spot over-unders": "Blocks alternating just below (88–90%) and just over (94–97%) sweet spot. Purpose: raise your sustainable power and practice absorbing small surges without blowing up. Stay seated, keep the transition smooth. The 'overs' should sting slightly; the 'unders' are for composure, not rest.",
  "Over-unders 4×6": "Four 6-minute blocks alternating under (90–93%) and over (105–109%) FTP. Purpose: lactate shuttling — clearing acid while still working, exactly what happens when a race surges on a climb. The 'over' minutes burn; the skill is relaxing back to 'under' without easing off. Expect deep fatigue by set 4 — that's the adaptation.",
  "Criss-cross threshold": "Continuous blocks weaving between 93–96% and 102–106% FTP. Purpose: race-realistic threshold work — holding the front group when the pace lifts. No rest inside a block, so pace the first crossings conservatively.",
  "40/20s VO2": "40 seconds hard, 20 seconds soft, in sets. Purpose: accumulate maximum time at VO2max with recoveries too short to escape it. The first set feels manageable — the last reps of the last set are the whole point. Keep the '20s' rolling, never freewheel.",
  "Hard-starts 5×4": "Each rep opens with a 20-second near-sprint, then settles into 3 minutes at VO2. Purpose: spike oxygen demand instantly — the move that wins races — then hold power while gasping. Expect the hold to feel harder than the number suggests; that's by design.",
  "VO2 ramps 4×3": "Three-minute efforts that climb 108% → 125% in stages. Purpose: progressive overload inside each rep — finishing harder than you start. Don't overcook the first minute; the last minute should be a genuine fight.",
  "Anaerobic 8×45s": "Eight 45-second efforts well above VO2 with ~2min recoveries. Purpose: anaerobic capacity — repeated attacks, closing gaps. Each one is close to maximal but repeatable; if rep 6 matches rep 2, you paced it right.",
  "30/15s ×3": "Sets of 30 seconds on / 15 off. Purpose: the punch-recover-punch demand of crits and Zwift racing. The 15 seconds is barely a breath — commit to every 'on' and stay on top of the gear.",
  "Openers": "A handful of 1-minute efforts at just over race pace, fully recovered between. Purpose: wake the legs up before racing without adding fatigue. Leave the session feeling *better* than when you started — sharp, not tired.",
  "Criterium simulation": "Repeated 30-second surges out of a tempo base, ending in a sprint. Purpose: rehearse the exact rhythm of a crit — corner, surge, settle. Practice the surge from race position; treat the final sprint as the real thing.",
};
const TYPE_DESC = {
  endurance: "Steady Zone 2 aerobic riding. Purpose: build the engine — mitochondria, fat-burning, resilience — that every other quality sits on. Conversational pace, high cadence, resist every urge to push; going harder makes this session *worse*.",
  tempo: "Sustained work at 78–88% FTP. Purpose: muscular endurance and time-in-saddle strength. Comfortably hard — short sentences possible, smooth and seated.",
  sweetspot: "Work at 88–94% FTP, the highest return per hour of training stress. Purpose: raise FTP without the recovery cost of full threshold. It should feel taxing but controlled — hard enough to matter, sustainable enough to repeat.",
  threshold: "Work at or fractionally above FTP. Purpose: push your sustainable power up — the single biggest lever on race performance. Expect real discomfort by the final rep; hold the target watts steady rather than surging.",
  vo2: "Efforts at 108–125% FTP. Purpose: grow your aerobic ceiling (VO2max) — your FTP can only be a fraction of it. Breathing goes ragged by design. Start each rep controlled, finish each rep honest: the last 30 seconds are where the adaptation lives.",
  anaerobic: "Short efforts well above VO2. Purpose: capacity for attacks, bridges and finishes. Near-maximal but repeatable — pace so the last rep matches the first.",
  sprint: "Short maximal sprints with full recovery. Purpose: neuromuscular power and speed. Quality over quantity: every sprint 100% committed, and take all the recovery.",
  recovery: "A genuinely easy spin. Purpose: blood flow and freshness — this ride makes tomorrow's hard ride better. If in doubt, go easier; heart rate barely above resting.",
  openers: "Short efforts to sharpen the legs before racing. Leave feeling better than you arrived.",
  crit: "Race-style surges over a tempo base with a sprint finish — rehearsal for crit and Zwift racing dynamics.",
};
function describe(type, name) { return DESC[name] || TYPE_DESC[type] || name; }

// Full workout object (for the library/TrainNow). Seed makes it reproducible for export.
export function generateWorkout(type, opts = {}) {
  const t = GENERATORS[type] ? type : pick(rng(opts.seed || 1), GEN_TYPES);
  const seed = opts.seed != null ? opts.seed : Math.floor(Math.random() * 1e9);
  const r = rng(seed);
  const g = GENERATORS[t](r, opts.minutes);
  const { durationMin, tss } = finalize(g.steps);
  return { id: `gen-${t}-${seed}`, name: g.name, cat: CAT_OF[t], type: t, seed, description: describe(t, g.name), steps: g.steps, durationMin, tss, generated: true };
}

// Steps + metadata for a planned ride. Deterministic per (key, seed string) so rebuilds are stable.
const PLAN_MAP = { end: ["endurance", 90], long: ["endurance", 150], tempo: ["tempo"], ss: ["sweetspot"], thr: ["threshold"], vo2: ["vo2"], rec: ["recovery"], open: ["openers"], crit: ["crit"], anaerobic: ["anaerobic"], sprint: ["sprint"] };
export function planWorkout(key, seedStr) {
  const map = PLAN_MAP[key];
  if (!map) return null;
  const [type, minutes] = map;
  const r = rng(hashStr(seedStr || String(key)));
  const g = GENERATORS[type](r, minutes);
  return { title: g.name, intensity: INTENSITY_OF[type], description: describe(type, g.name), steps: g.steps };
}
