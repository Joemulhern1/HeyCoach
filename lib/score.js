// Instant workout score (0–10) + one-line coach verdict, computed deterministically the moment
// you log a ride — no API key, no waiting. The honest signal available from summary stats (avg
// power + duration) is TRAINING LOAD: did you accumulate the TSS the session was worth, at roughly
// the right intensity? That rewards doing the work and catches slacking or cutting it short.

function stepsTss(steps) {
  let t = 0;
  for (const s of steps || []) { const mid = ((s.powerLowPct + s.powerHighPct) / 2) / 100; t += (s.durationSec / 3600) * mid * mid * 100; }
  return t;
}
const stepsMins = (steps) => (steps || []).reduce((a, s) => a + s.durationSec, 0) / 60;

function workIF(steps) {
  const work = (steps || []).filter((s) => s.intensity === "active" && s.powerHighPct > 80);
  if (!work.length) return null;
  let num = 0, den = 0;
  for (const s of work) { num += s.durationSec * ((s.powerLowPct + s.powerHighPct) / 2) / 100; den += s.durationSec; }
  return den ? num / den : null;
}

function actualTss(session, ftp) {
  if (session.tss != null) return session.tss;
  const p = session.normalizedPower || session.avgPower;
  if (!p || !ftp || !session.durationSec) return null;
  const IF = p / ftp;
  return (session.durationSec / 3600) * IF * IF * 100;
}

export function scoreWorkout(session, planned, profile) {
  const ftp = profile?.currentFTP || null;
  const durMin = session.durationSec ? session.durationSec / 60 : null;

  if (!planned || planned.type === "rest" || !planned.steps?.length) {
    const aT = actualTss(session, ftp);
    let s = 7;
    if (aT != null) { if (aT >= 60) s += 1; if (aT >= 100) s += 1; }
    else if (durMin != null) { if (durMin >= 90) s += 1; if (durMin >= 150) s += 1; }
    s = Math.max(5, Math.min(10, s));
    const big = (aT != null && aT >= 90) || (durMin != null && durMin >= 120);
    return { score: s, verdict: big ? "Big day banked — that's real fitness in the legs." : "Solid session in the bank.", detail: aT != null ? `${Math.round(aT)} TSS` : durMin ? `${Math.round(durMin)}min` : null };
  }

  const planTss = stepsTss(planned.steps);
  const aTss = actualTss(session, ftp);
  const targMin = stepsMins(planned.steps);

  if (aTss == null) {
    let s = 6;
    if (durMin != null && targMin) { const r = durMin / targMin; s = r >= 0.9 ? 8 : r >= 0.7 ? 7 : r >= 0.5 ? 6 : 4; }
    return { score: s, verdict: `Logged ${planned.title}. Add power data and I'll grade how well you hit the targets.`, detail: durMin && targMin ? `${Math.round(durMin)}min vs ${Math.round(targMin)} planned` : null };
  }

  const ratio = planTss > 0 ? aTss / planTss : 1;
  let base;
  if (ratio >= 0.9 && ratio <= 1.2) base = 9.5;
  else if (ratio > 1.2 && ratio <= 1.5) base = 8.5;
  else if (ratio >= 0.75 && ratio < 0.9) base = 7.5;
  else if (ratio > 1.5) base = 7.5;
  else if (ratio >= 0.55 && ratio < 0.75) base = 5.5;
  else if (ratio >= 0.35) base = 4;
  else base = 2.5;

  const p = session.normalizedPower || session.avgPower;
  const wIF = workIF(planned.steps);
  const aIF = (p && ftp) ? p / ftp : null;
  let intWord = "on target";
  if (aIF != null && wIF) {
    const rel = aIF / wIF;
    if (rel < 0.62) { intWord = "easier than prescribed"; base -= 1.5; }
    else if (rel > 1.02) { intWord = "harder than prescribed"; }
  }

  const under = durMin && targMin && durMin < targMin * 0.85;
  const score = Math.max(1, Math.min(10, Math.round(base)));

  let verdict;
  if (score >= 9) verdict = `Excellent — you nailed ${planned.title}, right on the training load.`;
  else if (score >= 7) verdict = ratio > 1.2 ? `Strong — you went bigger than ${planned.title} asked for.` : `Strong work on ${planned.title} — ${intWord}${under ? " but a touch short" : ""}.`;
  else if (score >= 5) verdict = `Got some work done, but it came in light of ${planned.title} — ${intWord}${under ? " and short on time" : ""}.`;
  else verdict = `That fell well short of ${planned.title} — ${intWord}. No drama; log it and move on.`;

  const bits = [`${Math.round(aTss)} vs ${Math.round(planTss)} TSS planned`];
  if (durMin != null && targMin) bits.push(`${Math.round(durMin)}min vs ${Math.round(targMin)}`);
  return { score, verdict, detail: bits.join(" · ") };
}

export function scoreForSession(session, store) {
  const date = (session.date || new Date().toISOString()).slice(0, 10);
  let planned = null;
  for (const w of store.block?.weeks || []) for (const d of w.days) if (d.date === date) planned = d;
  const r = scoreWorkout(session, planned, store.profile);
  session.score = r.score;
  session.scoreVerdict = r.verdict;
  session.scoreDetail = r.detail;
  return r;
}
