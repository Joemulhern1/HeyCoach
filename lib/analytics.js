// Performance Management Chart — the Banister/Coggan model elite coaches use.
//   CTL (Fitness)  = 42-day exponentially-weighted average of daily TSS
//   ATL (Fatigue)  = 7-day  exponentially-weighted average of daily TSS
//   TSB (Form)     = yesterday's CTL − yesterday's ATL  (positive = fresh, negative = fatigued)
// Pure + deterministic so it's testable and runs on client and server alike.

const DAY = 86400000;
const iso = (d) => new Date(d).toISOString().slice(0, 10);

// Training Stress Score for one session. Uses power when available, else a duration estimate.
export function tssFor(s, ftp) {
  if (s.avgPower && ftp && s.durationSec) {
    const IF = s.avgPower / ftp;
    return Math.round((s.durationSec / 3600) * IF * IF * 100);
  }
  if (s.durationSec) return Math.round((s.durationSec / 3600) * 0.4225 * 100); // assume endurance IF 0.65
  return 0;
}

function statusFor(tsb) {
  if (tsb > 8) return { label: "Fresh", note: "rested — good for racing or a test", color: "#34D399" };
  if (tsb > -10) return { label: "Neutral", note: "balanced load — maintaining", color: "#A3E635" };
  if (tsb > -30) return { label: "Building", note: "productive fatigue — fitness is climbing", color: "#FBBF24" };
  return { label: "Overreached", note: "deep fatigue — prioritise recovery", color: "#FB7185" };
}

export function computePMC(sessions, profile) {
  const ftp = profile?.currentFTP;
  const tssMap = {};
  for (const s of sessions || []) {
    const t = tssFor(s, ftp);
    if (!t) continue;
    const d = (s.date || s.addedAt || "").slice(0, 10);
    if (!d) continue;
    tssMap[d] = (tssMap[d] || 0) + t;
  }
  const days = Object.keys(tssMap).sort();
  if (!days.length) return { empty: true };

  const start = new Date(days[0] + "T00:00:00Z").getTime();
  const today = new Date(iso(new Date()) + "T00:00:00Z").getTime();
  let ctl = 0, atl = 0;
  const series = [];
  for (let t = start; t <= today; t += DAY) {
    const d = iso(t);
    const tss = tssMap[d] || 0;
    const pCtl = ctl, pAtl = atl;
    ctl = pCtl + (tss - pCtl) / 42;
    atl = pAtl + (tss - pAtl) / 7;
    series.push({ date: d, ctl: r1(ctl), atl: r1(atl), tsb: r1(pCtl - pAtl), tss });
  }
  const current = series[series.length - 1];
  const wkAgo = series[Math.max(0, series.length - 8)];
  const rampPerWeek = r1(current.ctl - wkAgo.ctl);

  // Forecast to the event, holding recent average load (honest "if you keep this up").
  let projection = null, daysToEvent = null;
  const ev = profile?.eventDate ? new Date(profile.eventDate + "T00:00:00Z").getTime() : null;
  if (ev) daysToEvent = Math.max(0, Math.round((ev - today) / DAY));
  if (ev && ev > today) {
    const recent = series.slice(-14);
    const avgTss = recent.reduce((a, x) => a + x.tss, 0) / recent.length;
    let pc = ctl, pa = atl;
    const proj = [];
    for (let t = today + DAY; t <= ev; t += DAY) {
      const ppc = pc, ppa = pa;
      pc = ppc + (avgTss - ppc) / 42;
      pa = ppa + (avgTss - ppa) / 7;
      proj.push({ date: iso(t), ctl: r1(pc), atl: r1(pa), tsb: r1(ppc - ppa) });
    }
    const last = proj[proj.length - 1] || current;
    projection = { series: proj, eventCtl: last.ctl, eventTsb: last.tsb, avgTss: Math.round(avgTss) };
  }

  return { empty: false, series, current, rampPerWeek, projection, daysToEvent, status: statusFor(current.tsb) };
}

const r1 = (n) => Math.round(n * 10) / 10;

// Adaptive check: from the PMC, decide if the plan should ease. Returns a recommendation the
// user confirms (never auto-applied). Positive/on-track states return null (no nagging).
export function assessLoad(pmc) {
  if (!pmc || pmc.empty || !pmc.current) return null;
  const tsb = pmc.current.tsb;
  const ramp = pmc.rampPerWeek || 0;
  if (tsb <= -30) return { action: "ease_week", headline: `You're overreached — your form is ${tsb} and fatigue is high. I'd ease this week so the work sticks instead of digging a deeper hole.` };
  if (tsb <= -18 && ramp >= 8) return { action: "ease_week", headline: `Fatigue is climbing fast (form ${tsb}, ramp +${ramp}/week). Easing this week lets you absorb the training rather than break down.` };
  return null;
}
