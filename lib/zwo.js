// Build a Zwift .zwo structured workout from a ride day's steps.
// .zwo power is expressed as a fraction of FTP (0.88 = 88% FTP), so no watt conversion is
// needed — Zwift scales to the rider's own FTP. We emit one element per step (SteadyState /
// Warmup / Cooldown / FreeRide), which rides identically to a compacted IntervalsT block.

const esc = (t) => String(t == null ? "" : t).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
const frac = (pct) => (pct / 100).toFixed(3);

function element(step) {
  const dur = Math.round(step.durationSec);
  const lo = step.powerLowPct, hi = step.powerHighPct;
  const label = step.name ? `><textevent timeoffset="0" message="${esc(step.name)}"/>` : null;
  const wrap = (tag, attrs) => label
    ? `    <${tag} ${attrs}${label}</${tag}>`
    : `    <${tag} ${attrs}/>`;

  if (step.intensity === "warmup" && lo != null && hi != null) {
    return wrap("Warmup", `Duration="${dur}" PowerLow="${frac(Math.min(lo, hi))}" PowerHigh="${frac(Math.max(lo, hi))}"`);
  }
  if (step.intensity === "cooldown" && lo != null && hi != null) {
    return wrap("Cooldown", `Duration="${dur}" PowerLow="${frac(Math.max(lo, hi))}" PowerHigh="${frac(Math.min(lo, hi))}"`);
  }
  if (lo != null && hi != null) {
    return wrap("SteadyState", `Duration="${dur}" Power="${frac((lo + hi) / 2)}"`);
  }
  // open target (e.g. sprint / max effort) → FreeRide
  return wrap("FreeRide", `Duration="${dur}"`);
}

export function buildWorkoutZwo(day) {
  const steps = (day.steps || []).filter((s) => s && s.durationSec > 0);
  if (!steps.length) throw new Error("This day has no structured steps to export.");
  const name = (`${day.day || ""} ${day.title || ""}`).trim() || "Workout";
  return `<?xml version="1.0" encoding="UTF-8"?>
<workout_file>
  <author>HeyCoach</author>
  <name>${esc(name)}</name>
  <description>${esc(day.description || "Structured workout from HeyCoach.")}</description>
  <sportType>bike</sportType>
  <tags/>
  <workout>
${steps.map(element).join("\n")}
  </workout>
</workout_file>
`;
}

export function workoutZwoFilename(day) {
  const safe = (`${day.day || ""}-${day.title || ""}`).replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  return `${safe || "workout"}.zwo`;
}
