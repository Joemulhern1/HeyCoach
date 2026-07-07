import { XMLParser } from "fast-xml-parser";

// Turn a Garmin/Strava export (.fit/.tcx/.gpx) into a compact session summary.
// This is the athlete's OWN file — no third-party API involved.

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true, // strip ns3: etc so Watts/HeartRateBpm resolve cleanly
});

const arr = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);
const num = (x) => {
  const n = parseFloat(x);
  return Number.isFinite(n) ? n : null;
};
const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const round = (n, d = 0) => (n == null ? null : Number(n.toFixed(d)));

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Best rolling average power over 5/20/60-min windows — the basis for FTP estimation.
// Resamples to 1 Hz using timestamps so it's robust to non-1s recording.
export function bestEfforts(points) {
  const withPow = points.filter((p) => p.power != null && p.time);
  if (withPow.length < 60) return {};
  const t0 = new Date(withPow[0].time).getTime();
  const secs = withPow.map((p) => ({ s: Math.round((new Date(p.time).getTime() - t0) / 1000), w: p.power }));
  const total = secs[secs.length - 1].s;
  if (!Number.isFinite(total) || total < 60) return {};
  const a = new Array(total + 1).fill(null);
  for (const { s, w } of secs) if (s >= 0 && s <= total) a[s] = w;
  let last = a.find((v) => v != null) ?? 0;
  for (let i = 0; i < a.length; i++) { if (a[i] == null) a[i] = last; else last = a[i]; }
  const pre = new Array(a.length + 1).fill(0);
  for (let i = 0; i < a.length; i++) pre[i + 1] = pre[i] + a[i];
  const best = (win) => { if (a.length < win) return null; let b = 0; for (let i = 0; i + win <= a.length; i++) { const avg = (pre[i + win] - pre[i]) / win; if (avg > b) b = avg; } return Math.round(b); };
  return { best5: best(300), best20: best(1200), best60: best(3600) };
}

function summarize(points, meta = {}) {
  // points: [{ time, hr, power, cadence, lat, lon, dist, ele }]
  const times = points.map((p) => p.time).filter(Boolean);
  const start = times.length ? new Date(times[0]) : null;
  const end = times.length ? new Date(times[times.length - 1]) : null;
  const durationSec =
    meta.durationSec ?? (start && end ? Math.round((end - start) / 1000) : null);

  let distanceKm = meta.distanceKm ?? null;
  const distVals = points.map((p) => p.dist).filter((v) => v != null);
  if (distanceKm == null && distVals.length) {
    distanceKm = (Math.max(...distVals) - Math.min(...distVals)) / 1000;
  }
  if (distanceKm == null) {
    let d = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      if (a.lat != null && b.lat != null) d += haversineKm(a, b);
    }
    if (d > 0) distanceKm = d;
  }

  const hr = points.map((p) => p.hr).filter((v) => v != null);
  const power = points.map((p) => p.power).filter((v) => v != null);
  const cad = points.map((p) => p.cadence).filter((v) => v != null);
  const ele = points.map((p) => p.ele).filter((v) => v != null);
  let elevationGainM = null;
  if (ele.length > 1) {
    let g = 0;
    for (let i = 1; i < ele.length; i++) {
      const diff = ele[i] - ele[i - 1];
      if (diff > 0) g += diff;
    }
    elevationGainM = g;
  }

  return {
    date: start ? start.toISOString() : null,
    durationSec,
    distanceKm: round(distanceKm, 1),
    avgHr: round(avg(hr)),
    maxHr: hr.length ? Math.round(Math.max(...hr)) : null,
    avgPower: round(avg(power)),
    maxPower: power.length ? Math.round(Math.max(...power)) : null,
    avgCadence: round(avg(cad)),
    elevationGainM: round(elevationGainM),
    ...bestEfforts(points),
  };
}

function parseTCX(text) {
  const doc = xml.parse(text);
  const acts = arr(doc?.TrainingCenterDatabase?.Activities?.Activity);
  const points = [];
  for (const a of acts) {
    for (const lap of arr(a.Lap)) {
      for (const tp of arr(lap?.Track?.Trackpoint)) {
        points.push({
          time: tp.Time,
          hr: num(tp?.HeartRateBpm?.Value),
          power: num(tp?.Extensions?.TPX?.Watts),
          cadence: num(tp.Cadence ?? tp?.Extensions?.TPX?.RunCadence),
          dist: num(tp.DistanceMeters),
          ele: num(tp.AltitudeMeters),
        });
      }
    }
  }
  return summarize(points, { sport: acts[0]?.["@_Sport"] });
}

function parseGPX(text) {
  const doc = xml.parse(text);
  const trks = arr(doc?.gpx?.trk);
  const points = [];
  for (const trk of trks) {
    for (const seg of arr(trk.trkseg)) {
      for (const pt of arr(seg.trkpt)) {
        const ext = pt?.extensions || {};
        const tpx = ext.TrackPointExtension || ext.TrackpointExtension || {};
        points.push({
          time: pt.time,
          lat: num(pt["@_lat"]),
          lon: num(pt["@_lon"]),
          ele: num(pt.ele),
          hr: num(tpx.hr ?? ext.hr),
          cadence: num(tpx.cad ?? ext.cad),
          power: num(ext.power ?? pt.power),
        });
      }
    }
  }
  return summarize(points);
}

async function parseFIT(buffer) {
  const mod = await import("fit-file-parser");
  const FitParser = mod.default || mod;
  const fp = new FitParser({
    force: true,
    speedUnit: "km/h",
    lengthUnit: "km",
    elapsedRecordField: true,
    mode: "list",
  });
  const data = await new Promise((resolve, reject) =>
    fp.parse(buffer, (err, d) => (err ? reject(err) : resolve(d)))
  );
  const records = arr(data?.records);
  const session = arr(data?.sessions)[0] || {};
  const points = records.map((r) => ({
    time: r.timestamp,
    hr: num(r.heart_rate),
    power: num(r.power),
    cadence: num(r.cadence),
    dist: r.distance != null ? num(r.distance) * 1000 : null, // km -> m
    ele: num(r.altitude ?? r.enhanced_altitude),
  }));
  const meta = {
    durationSec: num(session.total_elapsed_time ?? session.total_timer_time),
    distanceKm: num(session.total_distance),
  };
  return summarize(points, meta);
}

export async function parseRideFile(filename, buffer) {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  const name = filename.replace(/\.[^.]+$/, "");
  let summary;
  if (ext === "fit") summary = await parseFIT(buffer);
  else if (ext === "tcx") summary = parseTCX(buffer.toString("utf8"));
  else if (ext === "gpx") summary = parseGPX(buffer.toString("utf8"));
  else throw new Error(`Unsupported file type: .${ext} (use .fit, .tcx or .gpx)`);

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    source: ext.toUpperCase(),
    addedAt: new Date().toISOString(),
    ...summary,
  };
}

// Rough Training Stress Score from average power + FTP (no NP available from summary).
export function estimateTSS(session, ftp) {
  if (!session.avgPower || !ftp || !session.durationSec) return null;
  const intensity = session.avgPower / ftp;
  const tss = ((session.durationSec * session.avgPower * intensity) / (ftp * 3600)) * 100;
  return Math.round(tss);
}
