// Per-zone fitness "progression levels" (1–10), TrainerRoad-style.
// Deterministic on purpose: levels move by fixed rules from ride feedback so the system
// is predictable and testable. The AI only *reads* these to bias plan generation.

export const ZONE_ORDER = ["recovery", "endurance", "tempo", "threshold", "vo2", "strength"];

export function defaultProgression() {
  return { recovery: 5, endurance: 5, tempo: 5, threshold: 5, vo2: 5, strength: 5 };
}

// Infer which zone a completed session trained, from power vs FTP (or a gym keyword).
export function zoneFromSession(s, ftp) {
  if (s && s.avgPower && ftp) {
    const pct = (s.avgPower / ftp) * 100;
    if (pct < 56) return "recovery";
    if (pct < 76) return "endurance";
    if (pct < 91) return "tempo";
    if (pct <= 105) return "threshold";
    return "vo2";
  }
  const name = (s?.name || "").toLowerCase();
  if (/gym|strength|squat|lift|legs|deadlift|press|bench/.test(name)) return "strength";
  return "endurance";
}

// How an outcome nudges the trained zone's level.
const NUDGE = { nailed: 0.7, ok: 0.3, hard: 0.0, missed: -0.7 };

export function nudgeProgression(prog, zone, outcome) {
  const p = { ...defaultProgression(), ...(prog || {}) };
  const delta = NUDGE[outcome] ?? 0;
  if (p[zone] == null) p[zone] = 5;
  p[zone] = Math.max(1, Math.min(10, Math.round((p[zone] + delta) * 10) / 10));
  return p;
}

export function progressionSummary(prog) {
  const p = { ...defaultProgression(), ...(prog || {}) };
  return ZONE_ORDER.map((z) => `${z} ${p[z]}/10`).join(", ");
}

// Suggest an FTP bump when a recent long effort sat at/above current FTP — a sign it's underset.
export function suggestFtpBump(sessions, profile) {
  const ftp = profile?.currentFTP;
  if (!ftp) return null;
  const cutoff = Date.now() - 35 * 86400000;
  let best = null;
  for (const s of sessions || []) {
    if (!s.avgPower || !s.durationSec) continue;
    const when = new Date(s.date || s.addedAt).getTime();
    if (when < cutoff) continue;
    if (s.durationSec >= 35 * 60 && s.avgPower >= ftp * 0.97) {
      if (!best || s.avgPower > best.avgPower) best = s;
    }
  }
  if (!best) return null;
  const suggested = Math.round(best.avgPower / 0.95);
  if (suggested <= ftp + 4) return null;
  return { suggested, basis: `held ${best.avgPower}W for ${Math.round(best.durationSec / 60)} min` };
}
