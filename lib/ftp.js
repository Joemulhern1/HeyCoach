// Estimate FTP from the athlete's own logged rides. Prefers best 20-min power (× 0.95) from
// files with a power stream; falls back to a sustained hard average; else suggests a test.
// Pure and deterministic — returns a suggestion the user confirms (never auto-applied).
export function estimateFtp(sessions, profile) {
  const ftp = profile?.currentFTP;
  if (!ftp) return null;
  const cutoff = Date.now() - 56 * 86400000;
  const recent = (sessions || []).filter((s) => {
    const when = new Date(s.date || s.addedAt).getTime();
    return Number.isFinite(when) && when >= cutoff;
  });
  if (!recent.length) return null;
  const margin = Math.max(4, Math.round(ftp * 0.02));

  // 1) Best 20-minute power — the most reliable signal. Require a genuinely hard effort.
  let best20 = null, best20date = null;
  for (const s of recent) {
    if (s.best20 && s.best20 >= ftp * 0.88 && (!best20 || s.best20 > best20)) { best20 = s.best20; best20date = s.date || s.addedAt; }
  }
  if (best20) {
    const est = Math.round(best20 * 0.95);
    // Only raise FTP automatically — a below-FTP estimate just means the effort wasn't maximal,
    // so we never nudge it down from ride data (lower it manually after a real test if needed).
    if (est - ftp >= margin) return { suggestion: est, from: ftp, deltaW: est - ftp, basis: `your best 20-min of ${best20}W`, date: best20date };
    return null;
  }

  // 2) Fallback: a long, sustained effort (≥35 min at ≥97% FTP) by average power.
  let best = null;
  for (const s of recent) {
    if (!s.avgPower || !s.durationSec) continue;
    if (s.durationSec >= 35 * 60 && s.avgPower >= ftp * 0.97 && (!best || s.avgPower > best.avgPower)) best = s;
  }
  if (best) {
    const est = Math.round(best.avgPower / 0.95);
    if (est - ftp >= margin) return { suggestion: est, from: ftp, deltaW: est - ftp, basis: `${best.avgPower}W held for ${Math.round(best.durationSec / 60)} min`, date: best.date || best.addedAt };
    return null;
  }

  // 3) Training, but never going hard enough to read FTP — nudge a test.
  if (recent.filter((s) => s.avgPower).length >= 3) return { needTest: true };
  return null;
}
