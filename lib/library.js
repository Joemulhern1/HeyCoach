// Workout library — canonical power-based sessions used across elite cycling programs
// (Coggan power levels; polarized / sweet-spot / threshold / VO2 frameworks). Power is %FTP,
// so every workout scales to the athlete and exports straight to a Garmin device.

// step builders
const wu = (min, lo = 50, hi = 70) => ({ name: "Warm-up", durationSec: min * 60, intensity: "warmup", powerLowPct: lo, powerHighPct: hi });
const cd = (min, lo = 45, hi = 55) => ({ name: "Cool-down", durationSec: min * 60, intensity: "cooldown", powerLowPct: lo, powerHighPct: hi });
const W = (name, min, lo, hi) => ({ name, durationSec: min * 60, intensity: "active", powerLowPct: lo, powerHighPct: hi });
const R = (min, lo = 50, hi = 58) => ({ name: "Recover", durationSec: min * 60, intensity: "rest", powerLowPct: lo, powerHighPct: hi });
const Wsec = (name, s, lo, hi) => ({ name, durationSec: s, intensity: "active", powerLowPct: lo, powerHighPct: hi });
const Rsec = (s) => ({ name: "Recover", durationSec: s, intensity: "rest", powerLowPct: 45, powerHighPct: 55 });
const Sprint = (name, s) => ({ name, durationSec: s, intensity: "active" }); // open target = max effort
// n work/rest intervals with no trailing rest
const sets = (n, w, r) => { const out = []; for (let i = 0; i < n; i++) { out.push({ ...w, name: `${w.name} ${i + 1}` }); if (i < n - 1) out.push({ ...r }); } return out; };
// micro intervals e.g. 30/30: n × (work s on / off s) with set recovery, repeated `setsN` times
const micro = (setsN, n, onS, offS, lo, hi, betweenMin) => {
  const out = [];
  for (let s = 0; s < setsN; s++) {
    for (let i = 0; i < n; i++) { out.push(Wsec(`On ${s + 1}.${i + 1}`, onS, lo, hi)); out.push(Rsec(offS)); }
    if (s < setsN - 1) out.push(R(betweenMin));
  }
  return out;
};

const RAW = [
  { id: "recovery-spin", name: "Recovery Spin", cat: "recovery", description: "Easy flush — keep it light, high cadence, zero strain.",
    steps: [W("Easy spin", 40, 45, 55)] },

  { id: "aerobic-base-90", name: "Aerobic Base 90", cat: "endurance", description: "Steady Zone 2 — the aerobic engine builder. Conversational throughout.",
    steps: [wu(10, 55, 65), W("Endurance", 70, 65, 75), cd(10)] },

  { id: "endurance-2h", name: "Endurance 2h", cat: "endurance", description: "Long aerobic ride with two tempo lifts to break it up.",
    steps: [wu(10, 55, 65), W("Endurance", 45, 65, 75), W("Tempo lift", 10, 80, 85), W("Endurance", 35, 65, 75), W("Tempo lift", 10, 80, 85), W("Endurance", 10, 65, 72), cd(10)] },

  { id: "tempo-3x15", name: "Tempo 3×15", cat: "tempo", description: "Sustained tempo blocks — muscular endurance without the fatigue cost of threshold.",
    steps: [wu(10, 55, 70), ...sets(3, W("Tempo", 15, 76, 85), R(5)), cd(10)] },

  { id: "ss-3x12", name: "Sweet Spot 3×12", cat: "sweetspot", description: "The bread-and-butter session — big aerobic return for the fatigue cost. 88–94% FTP.",
    steps: [wu(12, 55, 75), ...sets(3, W("Sweet Spot", 12, 88, 94), R(4)), cd(8)] },

  { id: "ss-4x10", name: "Sweet Spot 4×10", cat: "sweetspot", description: "Four sustained sweet-spot blocks — repeatable, high-yield aerobic work.",
    steps: [wu(10, 55, 75), ...sets(4, W("Sweet Spot", 10, 88, 94), R(3)), cd(8)] },

  { id: "ss-pyramid", name: "Sweet Spot Pyramid", cat: "sweetspot", description: "Ascending then descending sweet-spot blocks to hold focus across the set.",
    steps: [wu(10, 55, 75), W("SS 6", 6, 88, 93), R(3), W("SS 9", 9, 88, 93), R(3), W("SS 12", 12, 88, 93), R(3), W("SS 9", 9, 88, 93), R(3), W("SS 6", 6, 88, 93), cd(8)] },

  { id: "threshold-2x20", name: "Threshold 2×20", cat: "threshold", description: "The benchmark FTP session. Two 20-minute efforts right at threshold.",
    steps: [wu(15, 55, 75), W("Threshold", 20, 95, 100), R(8), W("Threshold", 20, 98, 102), cd(12)] },

  { id: "threshold-4x10", name: "Threshold 4×10", cat: "threshold", description: "Threshold broken into four sharper blocks — slightly above FTP, shorter rest.",
    steps: [wu(12, 55, 75), ...sets(4, W("Threshold", 10, 98, 104), R(4)), cd(10)] },

  { id: "over-unders-3x8", name: "Over-Unders 3×8", cat: "threshold", description: "Alternate just under and just over FTP — trains lactate clearance under load.",
    steps: [wu(12, 55, 75),
      ...[0, 1, 2].flatMap((i) => [W(`Under ${i + 1}a`, 2, 88, 92), W(`Over ${i + 1}a`, 1, 105, 110), W(`Under ${i + 1}b`, 2, 88, 92), W(`Over ${i + 1}b`, 1, 105, 110), W(`Under ${i + 1}c`, 2, 88, 92), ...(i < 2 ? [R(4)] : [])]),
      cd(10)] },

  { id: "vo2-5x3", name: "VO2 5×3", cat: "vo2", description: "Classic VO2max developer — five 3-minute efforts at 112–120% FTP, equal recovery.",
    steps: [wu(15, 55, 75), ...sets(5, W("VO2", 3, 112, 120), R(3)), cd(9)] },

  { id: "vo2-4x4", name: "VO2 4×4", cat: "vo2", description: "The Hickson/Seiler 4×4 — four 4-minute maximal-aerobic efforts. Brutally effective.",
    steps: [wu(15, 55, 75), ...sets(4, W("VO2", 4, 110, 116), R(4)), cd(12)] },

  { id: "vo2-30-30", name: "30/30 VO2", cat: "vo2", description: "Billat-style 30s on / 30s off — accumulate time at VO2max with manageable strain.",
    steps: [wu(15, 55, 75), ...micro(2, 8, 30, 30, 118, 125, 5), cd(10)] },

  { id: "anaerobic-6x1", name: "Anaerobic 6×1", cat: "anaerobic", description: "Six 1-minute efforts well above VO2 — develops anaerobic capacity and repeatability.",
    steps: [wu(15, 55, 75), ...sets(6, W("Anaerobic", 1, 130, 140), R(3)), cd(11)] },

  { id: "forty-twenties", name: "40/20s 2×6", cat: "anaerobic", description: "40s hard / 20s easy — the punchy session for road-race repeatability.",
    steps: [wu(15, 55, 75), ...micro(2, 6, 40, 20, 118, 128, 5), cd(10)] },

  { id: "sprints-8x15", name: "Sprints 8×15s", cat: "sprint", description: "Eight maximal 15-second sprints, full recovery — neuromuscular power. Go all-out.",
    steps: [wu(15, 55, 75), ...sets(8, Sprint("Sprint", 15), R(3)), cd(8)] },

  { id: "climbing-threshold", name: "Climbing Threshold 3×12", cat: "threshold", description: "Threshold at low cadence (60–70 rpm) to build climbing-specific strength.",
    steps: [wu(12, 55, 75), ...sets(3, W("Climb", 12, 92, 100), R(5)), cd(9)] },

  { id: "race-simulation", name: "Race Simulation", cat: "specialty", description: "Mixed-intensity session mimicking race demands — tempo base, surges, a threshold grind, sprint finish.",
    steps: [wu(15, 55, 75), W("Tempo settle", 10, 80, 86), W("Surge", 1, 115, 125), W("Tempo", 3, 80, 86), W("Surge", 1, 115, 125), W("Tempo", 3, 80, 86), W("Threshold grind", 12, 96, 102), R(5), W("Attack", 2, 120, 130), Sprint("Sprint finish", 20), cd(10)] },

  // ---- Recovery ----
  { id: "recovery-30", name: "Recovery Spin 30", cat: "recovery", description: "Short flush — legs turning, no strain.", steps: [W("Easy spin", 30, 45, 55)] },
  { id: "openers", name: "Openers (pre-race)", cat: "recovery", description: "Day-before primer — a few short efforts to open the legs without fatigue.", steps: [wu(12, 55, 70), ...sets(3, W("Opener", 1, 100, 110), R(3)), cd(8)] },

  // ---- Endurance ----
  { id: "endurance-3h", name: "Endurance 3h", cat: "endurance", description: "Long aerobic ride — the big base builder. Stay conversational.", steps: [wu(10, 55, 65), W("Endurance", 160, 65, 75), cd(10)] },
  { id: "fasted-z2", name: "Fasted Z2 75", cat: "endurance", description: "Steady low Zone 2, ideally fasted — trains fat oxidation. Easy effort.", steps: [wu(10, 55, 62), W("Steady Z2", 55, 62, 70), cd(10)] },
  { id: "z2-surges", name: "Endurance + Surges", cat: "endurance", description: "Aerobic ride broken by short punchy surges — race-day legs on a base day.", steps: [wu(10, 55, 65), W("Endurance", 20, 65, 73), ...[1, 2, 3, 4, 5].flatMap(() => [W("Surge", 1, 110, 120), W("Endurance", 8, 65, 72)]), cd(10)] },
  { id: "z2-ss", name: "Endurance + Sweet Spot", cat: "endurance", description: "Long aerobic ride with two sweet-spot blocks — big training load, race specificity.", steps: [wu(12, 55, 70), W("Endurance", 30, 65, 73), W("Sweet Spot", 12, 88, 93), W("Endurance", 20, 65, 73), W("Sweet Spot", 12, 88, 93), W("Endurance", 15, 65, 72), cd(10)] },
  { id: "z2-tempo-finish", name: "Z2 with Tempo Finish", cat: "endurance", description: "Aerobic base then a tempo block to finish on tired legs.", steps: [wu(10, 55, 65), W("Endurance", 60, 65, 74), W("Tempo finish", 15, 80, 86), cd(8)] },

  // ---- Tempo ----
  { id: "tempo-2x20", name: "Tempo 2x20", cat: "tempo", description: "Two sustained tempo blocks — muscular endurance.", steps: [wu(12, 55, 70), ...sets(2, W("Tempo", 20, 78, 85), R(6)), cd(10)] },
  { id: "tempo-4x10", name: "Tempo 4x10", cat: "tempo", description: "Four tempo blocks, short rest — repeatable aerobic work.", steps: [wu(10, 55, 70), ...sets(4, W("Tempo", 10, 80, 86), R(4)), cd(8)] },

  // ---- Sweet Spot ----
  { id: "ss-2x20", name: "Sweet Spot 2x20", cat: "sweetspot", description: "Two 20-minute sweet-spot efforts — high aerobic return.", steps: [wu(12, 55, 75), ...sets(2, W("Sweet Spot", 20, 88, 93), R(6)), cd(10)] },
  { id: "ss-5x8", name: "Sweet Spot 5x8", cat: "sweetspot", description: "Five sharper sweet-spot blocks, short rest.", steps: [wu(10, 55, 75), ...sets(5, W("Sweet Spot", 8, 89, 94), R(3)), cd(8)] },
  { id: "ss-30cont", name: "Sweet Spot 30 Continuous", cat: "sweetspot", description: "A single sustained 30-minute sweet-spot block — focus and pacing.", steps: [wu(12, 55, 75), W("Sweet Spot", 30, 88, 92), cd(8)] },
  { id: "ss-overs", name: "Sweet Spot Overs", cat: "sweetspot", description: "Sweet spot with short lifts just over threshold — bridges SS and threshold.", steps: [wu(12, 55, 75), ...[1, 2, 3].flatMap((i) => [W(`Under ${i}`, 6, 88, 90), W(`Over ${i}`, 3, 94, 97), ...(i < 3 ? [R(4)] : [])]), cd(8)] },

  // ---- Threshold ----
  { id: "thr-3x15", name: "Threshold 3x15", cat: "threshold", description: "Three 15-minute efforts at threshold — the FTP-raising workhorse.", steps: [wu(15, 55, 75), ...sets(3, W("Threshold", 15, 96, 101), R(6)), cd(10)] },
  { id: "thr-5x8", name: "Threshold 5x8", cat: "threshold", description: "Five sharper threshold blocks slightly over FTP.", steps: [wu(12, 55, 75), ...sets(5, W("Threshold", 8, 99, 104), R(4)), cd(8)] },
  { id: "thr-40tt", name: "Threshold 40min", cat: "threshold", description: "One sustained 40-minute effort at threshold — mental and physical grind.", steps: [wu(15, 55, 75), W("Threshold", 40, 97, 102), cd(10)] },
  { id: "criss-cross", name: "Criss-Cross Threshold", cat: "threshold", description: "Alternate just below and just above FTP without rest — lactate shuttling.", steps: [wu(15, 55, 75), ...[1, 2, 3].flatMap((i) => [W("Low", 3, 93, 96), W("High", 3, 102, 106), W("Low", 3, 93, 96), ...(i < 3 ? [R(5)] : [])]), cd(10)] },
  { id: "ou-4x6", name: "Over-Unders 4x6", cat: "threshold", description: "Four sets alternating under/over FTP — clearing lactate under load.", steps: [wu(12, 55, 75), ...[1, 2, 3, 4].flatMap((i) => [W("Under", 2, 90, 93), W("Over", 1, 105, 109), W("Under", 2, 90, 93), W("Over", 1, 105, 109), ...(i < 4 ? [R(4)] : [])]), cd(10)] },
  { id: "climb-4x8", name: "Climbing Repeats 4x8", cat: "threshold", description: "Four 8-minute threshold climbs at low cadence (60–70 rpm) — climbing strength.", steps: [wu(12, 55, 75), ...sets(4, W("Climb", 8, 95, 102), R(5)), cd(9)] },

  // ---- VO2 Max ----
  { id: "vo2-6x3", name: "VO2 6x3", cat: "vo2", description: "Six 3-minute VO2 efforts — a big aerobic-power stimulus.", steps: [wu(15, 55, 75), ...sets(6, W("VO2", 3, 112, 118), R(3)), cd(9)] },
  { id: "vo2-5x4", name: "VO2 5x4", cat: "vo2", description: "Five 4-minute efforts — longer VO2 intervals, deeply aerobic.", steps: [wu(15, 55, 75), ...sets(5, W("VO2", 4, 108, 114), R(4)), cd(10)] },
  { id: "vo2-8x2", name: "VO2 8x2", cat: "vo2", description: "Eight short, sharp 2-minute efforts — high power, manageable rest.", steps: [wu(15, 55, 75), ...sets(8, W("VO2", 2, 115, 122), R(2)), cd(9)] },
  { id: "vo2-40-20", name: "40/20 VO2", cat: "vo2", description: "40s hard / 20s easy — accumulate big time at VO2 with short recoveries.", steps: [wu(15, 55, 75), ...micro(2, 8, 40, 20, 118, 126, 5), cd(10)] },
  { id: "hard-starts", name: "Hard Starts 5x", cat: "vo2", description: "Sprint into each VO2 effort to spike oxygen demand, then hold — race-winning fitness.", steps: [wu(15, 55, 75), ...[1, 2, 3, 4, 5].flatMap((i) => [Wsec(`Hard start ${i}`, 20, 150, 170), W(`VO2 hold ${i}`, 3, 112, 118), ...(i < 5 ? [R(4)] : [])]), cd(9)] },
  { id: "vo2-ramps", name: "VO2 Ramps 4x3", cat: "vo2", description: "Each effort ramps from high tempo up to VO2 — progressive overload within the interval.", steps: [wu(15, 55, 75), ...[1, 2, 3, 4].flatMap((i) => [W("Ramp lo", 1, 108, 112), W("Ramp mid", 1, 114, 118), W("Ramp hi", 1, 120, 125), ...(i < 4 ? [R(4)] : [])]), cd(9)] },

  // ---- Anaerobic ----
  { id: "anaerobic-8x45", name: "Anaerobic 8x45s", cat: "anaerobic", description: "Eight 45-second efforts well above VO2 — anaerobic capacity and repeatability.", steps: [wu(15, 55, 75), ...[1, 2, 3, 4, 5, 6, 7, 8].flatMap((i) => [Wsec(`Effort ${i}`, 45, 126, 138), ...(i < 8 ? [Rsec(135)] : [])]), cd(8)] },
  { id: "thirty-fifteens", name: "30/15s", cat: "anaerobic", description: "30s on / 15s off — relentless punchy efforts for crit and road-race repeatability.", steps: [wu(15, 55, 75), ...micro(3, 6, 30, 15, 120, 130, 5), cd(8)] },
  { id: "anaerobic-5x2", name: "Anaerobic Capacity 5x2", cat: "anaerobic", description: "Five 2-minute maximal-ish efforts — extends how long you can hold supra-threshold power.", steps: [wu(15, 55, 75), ...sets(5, W("Effort", 2, 125, 135), R(4)), cd(9)] },

  // ---- Sprint ----
  { id: "sprints-10x10", name: "Sprints 10x10s", cat: "sprint", description: "Ten short maximal sprints with full recovery — pure neuromuscular power.", steps: [wu(15, 55, 75), ...sets(10, Sprint("Sprint", 10), R(2)), cd(8)] },
  { id: "standing-starts", name: "Standing Starts 6", cat: "sprint", description: "From near-stop, accelerate hard — torque and explosive power.", steps: [wu(15, 55, 75), ...sets(6, Sprint("Standing start", 12), R(4)), cd(8)] },
  { id: "flying-sprints", name: "Flying Sprints 6x20s", cat: "sprint", description: "Wind up to speed then 20s flat-out — top-end speed.", steps: [wu(15, 55, 75), ...sets(6, Sprint("Flying sprint", 20), R(4)), cd(8)] },
  { id: "hill-sprints", name: "Hill Sprints 8", cat: "sprint", description: "Eight max efforts up a short rise — strength and power. Full recovery between.", steps: [wu(15, 55, 75), ...sets(8, Sprint("Hill sprint", 20), R(4)), cd(8)] },

  // ---- Specialty / race ----
  { id: "crit-sim", name: "Criterium Simulation", cat: "specialty", description: "Repeated hard surges out of corners over a tempo base, then a sprint finish.", steps: [wu(15, 55, 75), ...[1, 2, 3, 4, 5, 6].flatMap(() => [Wsec("Corner surge", 30, 115, 130), W("Pack tempo", 2, 80, 88)]), Sprint("Sprint finish", 20), cd(10)] },
  { id: "road-attacks", name: "Road Race Attacks", cat: "specialty", description: "Repeated attacks with incomplete recovery, a threshold grind, then the final sprint.", steps: [wu(15, 55, 75), ...[1, 2, 3, 4].flatMap((i) => [W(`Attack ${i}`, 1, 120, 135), W("Recover in pack", 4, 78, 86)]), W("Threshold grind", 10, 96, 101), Sprint("Final sprint", 20), cd(10)] },
  { id: "tt-2x20", name: "Time Trial 2x20", cat: "specialty", description: "Two 20-minute race-pace efforts in your TT position — pacing and aero specificity.", steps: [wu(15, 55, 75), ...sets(2, W("TT effort", 20, 98, 103), R(6)), cd(10)] },

  // ---- Testing ----
  { id: "ramp-test", name: "Ramp Test (FTP)", cat: "test", description: "Ramp until you can't hold the wattage. FTP ≈ 75% of your best 1-minute power reached.", steps: [wu(10, 50, 60), ...Array.from({ length: 16 }, (_, i) => { const p = 70 + i * 6; return W(`Stage ${i + 1}`, 1, p, p); }), cd(5)] },
  { id: "ftp-20", name: "20-min FTP Test", cat: "test", description: "Classic protocol — a 5-min blow-out, recovery, then an all-out 20 min. FTP ≈ avg power × 0.95.", steps: [wu(15, 55, 72), W("5-min blow-out", 5, 108, 118), R(10, 50, 60), W("Primer", 5, 100, 108), R(5, 50, 60), W("20-min test", 20, 100, 115), cd(10)] },
  { id: "test-8x2", name: "8-min Test x2", cat: "test", description: "Two maximal 8-minute efforts. FTP ≈ average power of the two × 0.90.", steps: [wu(15, 55, 75), ...sets(2, W("8-min effort", 8, 100, 115), R(10)), cd(10)] },

];

// midpoint IF for a step (sprints/open steps assumed ~1.4)
const stepIF = (s) => (s.powerLowPct && s.powerHighPct ? (s.powerLowPct + s.powerHighPct) / 200 : 1.4);

function finalize(w) {
  const totalSec = w.steps.reduce((a, s) => a + s.durationSec, 0);
  const tss = Math.round((w.steps.reduce((a, s) => a + s.durationSec * stepIF(s) ** 2, 0) / 3600) * 100);
  return { ...w, durationMin: Math.round(totalSec / 60), tss };
}

import { EXPANDED } from "./library-expanded.js";
// Archetype tags for the curated set (by category); the expanded set carries its own tags.
// Library tags predate the 5-profile model — map legacy discipline tags onto current profiles.
const ARCH_ALIAS = { gc: "allrounder", classics: "allrounder", roadrace: "allrounder", crit: "sprinter", cyclocross: "sprinter", granfondo: "ultra", endurance: "ultra", climber: "climber", sprinter: "sprinter", tt: "tt", ultra: "ultra", allrounder: "allrounder" };
const CAT_ARCH = { recovery: ["gc","classics","climber","sprinter"], endurance: ["gc","climber","classics"], tempo: ["gc","climber","classics"], sweetspot: ["gc","climber"], threshold: ["gc","climber","classics"], vo2: ["classics","climber","sprinter","gc"], anaerobic: ["sprinter","classics"], sprint: ["sprinter","classics"], specialty: ["classics","sprinter","gc"], test: ["gc","classics","climber","sprinter"] };
const CAT_BRIEF = { recovery: "Purpose: blood flow and freshness — this ride makes tomorrow's hard ride better. If in doubt, go easier.", endurance: "Purpose: build the aerobic engine everything else sits on. Conversational pace; pushing harder makes this session worse.", tempo: "Purpose: muscular endurance — comfortably hard, smooth and seated, cadence 85–95.", sweetspot: "Purpose: the highest FTP return per unit of fatigue. Taxing but controlled — honest work, not a fight.", threshold: "Purpose: push sustainable power upward — the biggest lever on race performance. Hold steady watts; discomfort by the last rep is the point.", vo2: "Purpose: grow your aerobic ceiling. Start each rep controlled, finish honest — the last 30 seconds are where the adaptation lives.", anaerobic: "Purpose: capacity for attacks and gaps. Near-maximal but repeatable — the last rep should match the first.", sprint: "Purpose: neuromuscular power. Every effort 100% committed; take all the recovery.", specialty: "Purpose: race-specific rehearsal — practise the exact demands of the event.", test: "Purpose: measure your FTP so every workout targets the right watts." };
const CURATED = RAW.map(finalize).map((w) => ({ ...w, archetypes: w.archetypes || CAT_ARCH[w.cat] || [], level: w.level || 5, description: (w.description && w.description.length >= 60) ? w.description : `${w.description || w.name} ${CAT_BRIEF[w.cat] || ""}`.trim() }));
const seen = new Set(CURATED.map((w) => w.name.toLowerCase()));
export const LIBRARY = [...CURATED, ...EXPANDED.filter((w) => !seen.has(w.name.toLowerCase()))]
  .map((w) => {
    const tags = new Set((w.archetypes || []).map((a) => ARCH_ALIAS[a] || a));
    // Ensure the newer profiles get a properly stocked library, by discipline demands.
    if (["threshold", "sweetspot", "tempo", "endurance", "recovery", "test"].includes(w.cat)) tags.add("tt");
    if (["endurance", "tempo", "sweetspot", "recovery", "test"].includes(w.cat)) tags.add("ultra");
    if (w.cat === "specialty" && /tt |time trial/i.test(w.name)) tags.add("tt");
    return { ...w, archetypes: [...tags] };
  });
export const findWorkout = (id) => LIBRARY.find((w) => w.id === id);

export const CATEGORIES = [
  { key: "recovery", label: "Recovery" },
  { key: "endurance", label: "Endurance" },
  { key: "tempo", label: "Tempo" },
  { key: "sweetspot", label: "Sweet Spot" },
  { key: "threshold", label: "Threshold" },
  { key: "vo2", label: "VO2 Max" },
  { key: "anaerobic", label: "Anaerobic" },
  { key: "sprint", label: "Sprint" },
  { key: "specialty", label: "Specialty" },
  { key: "test", label: "Testing" },
];
