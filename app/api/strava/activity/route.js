import { readStore, patchStore } from "../../../../lib/store.js";
import { getValidToken, fetchActivity, fetchStreams, mapActivity, parseActivityUrl } from "../../../../lib/strava.js";
import { bestEfforts } from "../../../../lib/parse.js";
import { estimateFtp } from "../../../../lib/ftp.js";

export const maxDuration = 60;

export async function POST(req) {
  const { url } = await req.json();
  const id = parseActivityUrl(url);
  if (!id) return Response.json({ error: "That doesn't look like a Strava activity link — paste the URL of the ride (strava.com/activities/…)." }, { status: 400 });
  const store = await readStore();
  if (!store.strava) return Response.json({ error: "Connect Strava first (Activity tab), then paste the link." }, { status: 400 });
  try {
    const token = await getValidToken(store.strava, (next) => patchStore({ strava: next }));
    const raw = await fetchActivity(token, id);
    const session = mapActivity(raw);
    if (!session.isRide) return Response.json({ error: "That activity isn't a ride." }, { status: 400 });
    // Power stream -> best efforts (feeds FTP detection)
    const streams = await fetchStreams(token, id);
    if (streams?.watts?.data?.length && streams?.time?.data?.length) {
      const t0 = Date.now();
      const points = streams.time.data.map((t, i) => ({ time: new Date(t0 + t * 1000).toISOString(), power: streams.watts.data[i] }));
      Object.assign(session, bestEfforts(points));
    }
    // Deterministic analysis vs today's plan
    const ftp = store.profile?.currentFTP || null;
    const tss = (ftp && session.avgPower && session.durationSec) ? Math.round((session.durationSec * session.avgPower * (session.avgPower / ftp)) / (ftp * 3600) * 100) : null;
    const todayIso = new Date().toISOString().slice(0, 10);
    let planned = null;
    for (const wk of store.block?.weeks || []) for (const d of wk.days) if (d.date === todayIso && d.type === "ride") planned = d;
    const intensity = (ftp && session.avgPower) ? Math.round(session.avgPower / ftp * 100) : null;
    const bits = [];
    if (tss != null) bits.push(`${tss} TSS`);
    if (intensity != null) bits.push(`${intensity}% of FTP average`);
    if (session.best20) bits.push(`best 20-min ${session.best20}W`);
    let note = `Logged "${session.name}"${bits.length ? ` — ${bits.join(", ")}` : ""}.`;
    if (planned) note += ` Planned today: ${planned.title}.`;
    const existing = (store.sessions || []).filter((s) => s.id !== session.id);
    const sessions = [session, ...existing];
    const saved = await patchStore({ sessions });
    const ftpRec = estimateFtp(saved.sessions, store.profile);
    if (ftpRec?.suggestion) note += ` Your power suggests FTP ${ftpRec.from} → ${ftpRec.suggestion}W — check the Today screen to apply.`;
    return Response.json({ sessions: saved.sessions, note });
  } catch (e) {
    return Response.json({ error: e.message || "Couldn't analyse that activity." }, { status: 500 });
  }
}
