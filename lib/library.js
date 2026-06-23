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
];

// midpoint IF for a step (sprints/open steps assumed ~1.4)
const stepIF = (s) => (s.powerLowPct && s.powerHighPct ? (s.powerLowPct + s.powerHighPct) / 200 : 1.4);

function finalize(w) {
  const totalSec = w.steps.reduce((a, s) => a + s.durationSec, 0);
  const tss = Math.round((w.steps.reduce((a, s) => a + s.durationSec * stepIF(s) ** 2, 0) / 3600) * 100);
  return { ...w, durationMin: Math.round(totalSec / 60), tss };
}

export const LIBRARY = RAW.map(finalize);
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
];
