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
function describe(type, name) {
  const d = { endurance: "Aerobic base — keep it steady and conversational.", tempo: "Sustained tempo — muscular endurance.", sweetspot: "Sweet spot — the best bang-for-buck aerobic work.", threshold: "At/around FTP — the classic FTP builder.", vo2: "VO2 max efforts — grow your aerobic ceiling.", anaerobic: "Supra-threshold — anaerobic capacity and repeatability.", sprint: "Neuromuscular power — short, maximal efforts.", recovery: "Easy flush — pure recovery.", openers: "Pre-race openers — sharpen without fatigue.", crit: "Race-style surges over tempo, sprint finish." };
  return d[type] || name;
}

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
const PLAN_MAP = { end: ["endurance", 90], long: ["endurance", 150], tempo: ["tempo"], ss: ["sweetspot"], thr: ["threshold"], vo2: ["vo2"], rec: ["recovery"], open: ["openers"], crit: ["crit"], anaerobic: ["anaerobic"] };
export function planWorkout(key, seedStr) {
  const map = PLAN_MAP[key];
  if (!map) return null;
  const [type, minutes] = map;
  const r = rng(hashStr(seedStr || String(key)));
  const g = GENERATORS[type](r, minutes);
  return { title: g.name, intensity: INTENSITY_OF[type], description: describe(type, g.name), steps: g.steps };
}
