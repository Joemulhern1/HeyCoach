"use client";
import React, { useEffect, useRef, useState } from "react";
import "./globals.css";

const ZONES = {
  recovery: { label: "Recovery", color: "#4FB0E3" },
  endurance: { label: "Endurance", color: "#34D399" },
  tempo: { label: "Tempo", color: "#A3E635" },
  threshold: { label: "Threshold", color: "#FBBF24" },
  vo2: { label: "VO2 Max", color: "#FB7185" },
  strength: { label: "Strength", color: "#A78BFA" },
  rest: { label: "Rest", color: "#5A6B73" },
};
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DEFAULT_PROFILE = {
  eventName: "A-race road event",
  eventDate: "2026-09-10",
  currentFTP: 240,
  targetFTP: 270,
  currentWeightKg: 84,
  targetWeightKg: 75,
  experience: "Experienced amateur",
  useStravaForCoaching: false,
  schedule: { Mon: "gym", Tue: "ride", Wed: "ride", Thu: "ride", Fri: "gym", Sat: "rest", Sun: "ride" },
};

const C = {
  bg: "var(--bg)", surface: "var(--surface)", surfaceHi: "var(--surfaceHi)", border: "var(--border)",
  text: "var(--text)", muted: "var(--muted)", faint: "var(--faint)", brand: "var(--brand)",
  brandSoft: "rgba(124,92,255,0.14)", mono: "var(--mono)",
};
const input = { background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 10, padding: "10px 12px", fontSize: 15, outline: "none", width: "100%" };
const primaryBtn = { background: C.brand, color: "#fff", border: "none", borderRadius: 12, padding: "14px 0", fontSize: 16, fontWeight: 700, cursor: "pointer", width: "100%" };
const ghostBtn = { background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 10, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600 };

const Eyebrow = ({ children }) => <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.muted, fontWeight: 700 }}>{children}</div>;
const Card = ({ children, style }) => <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, ...style }}>{children}</div>;
const Field = ({ label, children }) => (
  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{label}</span>{children}
  </label>
);
const weeksOut = (d) => Math.max(0, Math.round((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7)));
const fmtMins = (s) => (s ? `${Math.round(s / 60)} min` : "—");
const latestWeight = (weights, profile) => {
  const s = [...(weights || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
  return s.length ? s[0].kg : profile.currentWeightKg || 84;
};
const migrate = (p) => ({ ...DEFAULT_PROFILE, ...p, currentWeightKg: p.currentWeightKg ?? p.weightKg ?? 84, targetWeightKg: p.targetWeightKg ?? 75 });

export default function HeyCoach() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [plan, setPlan] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [weights, setWeights] = useState([]);
  const [strava, setStrava] = useState({ configured: false, connected: false, athlete: null });
  const [screen, setScreen] = useState("onboarding");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/state").then((r) => r.json()),
      fetch("/api/strava/status").then((r) => r.json()).catch(() => ({})),
    ]).then(([s, st]) => {
      if (s.profile) { setProfile(migrate(s.profile)); setScreen("dashboard"); }
      if (s.plan) setPlan(s.plan);
      if (s.sessions) setSessions(s.sessions);
      if (s.weights) setWeights(s.weights);
      if (st) setStrava((p) => ({ ...p, ...st }));
    }).catch(() => {}).finally(() => setLoading(false));
    const q = new URLSearchParams(window.location.search).get("strava");
    if (q === "connected") setError("");
    else if (q === "error" || q === "denied") setError("Strava connection didn't complete.");
  }, []);

  const build = async (saveFirst) => {
    setBusy(true); setError("");
    try {
      if (saveFirst) {
        const r = await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
        if (!r.ok) throw new Error((await r.json()).error || "Couldn't save your goal.");
      }
      const r = await fetch("/api/plan", { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Couldn't build the week.");
      setPlan(data.plan); setScreen("dashboard");
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const saveProfile = async (next) => {
    setProfile(next);
    await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
  };

  if (loading) return <Shell><Spinner label="Loading your coach…" /></Shell>;

  return (
    <Shell>
      {error && <div style={{ background: "rgba(251,113,133,0.12)", border: `1px solid ${ZONES.vo2.color}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 14 }}>{error}</div>}
      {screen === "onboarding" && <Onboarding profile={profile} setProfile={setProfile} onBuild={() => build(true)} busy={busy} />}
      {screen === "dashboard" && (
        <Dashboard
          profile={profile} plan={plan} sessions={sessions} weights={weights} strava={strava} busy={busy}
          onEdit={() => setScreen("onboarding")} onRegenerate={() => build(false)}
          setSessions={setSessions} setWeights={setWeights} setError={setError} saveProfile={saveProfile}
        />
      )}
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text }}>
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "28px 20px 64px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
          <span style={{ width: 10, height: 10, background: C.brand, borderRadius: 3, transform: "rotate(45deg)" }} />
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.4 }}><span style={{ color: C.muted }}>Hey</span>Coach</span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: C.faint, fontFamily: C.mono, letterSpacing: 1 }}>COACH · NUTRITION</span>
        </div>
        {children}
      </div>
    </div>
  );
}

const Spinner = ({ label }) => (
  <div style={{ textAlign: "center", padding: "80px 0", color: C.muted }}>
    <div style={{ width: 34, height: 34, border: `3px solid ${C.border}`, borderTopColor: C.brand, borderRadius: "50%", margin: "0 auto 18px", animation: "spin 0.8s linear infinite" }} />
    <div style={{ fontSize: 15 }}>{label}</div>
  </div>
);

function Onboarding({ profile, setProfile, onBuild, busy }) {
  const upd = (k, v) => setProfile((p) => ({ ...p, [k]: v }));
  const cycle = (day) => setProfile((p) => {
    const order = ["ride", "gym", "rest"];
    const next = order[(order.indexOf(p.schedule[day]) + 1) % order.length];
    return { ...p, schedule: { ...p.schedule, [day]: next } };
  });
  const typeColor = (t) => (t === "gym" ? ZONES.strength.color : t === "ride" ? ZONES.endurance.color : C.faint);
  const projWkg = (profile.targetFTP / profile.targetWeightKg).toFixed(2);

  return (
    <div style={{ maxWidth: 540, margin: "0 auto" }}>
      <Eyebrow>Set up your coach</Eyebrow>
      <h2 style={{ margin: "8px 0 4px", fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>Tell HeyCoach the goal</h2>
      <p style={{ color: C.muted, margin: "0 0 22px", fontSize: 14, lineHeight: 1.5 }}>Power and weight targets. The coach periodises toward the date and runs the deficit around your training.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ gridColumn: "1 / -1" }}><Field label="Goal event"><input style={input} value={profile.eventName} onChange={(e) => upd("eventName", e.target.value)} /></Field></div>
        <Field label="Event date"><input type="date" style={input} value={profile.eventDate} onChange={(e) => upd("eventDate", e.target.value)} /></Field>
        <Field label="Experience">
          <select style={input} value={profile.experience} onChange={(e) => upd("experience", e.target.value)}>
            <option>Beginner</option><option>Intermediate</option><option>Experienced amateur</option><option>Competitive racer</option>
          </select>
        </Field>
        <Field label="Current FTP (W)"><input type="number" style={{ ...input, fontFamily: C.mono }} value={profile.currentFTP} onChange={(e) => upd("currentFTP", +e.target.value)} /></Field>
        <Field label="Target FTP (W)"><input type="number" style={{ ...input, fontFamily: C.mono }} value={profile.targetFTP} onChange={(e) => upd("targetFTP", +e.target.value)} /></Field>
        <Field label="Current weight (kg)"><input type="number" style={{ ...input, fontFamily: C.mono }} value={profile.currentWeightKg} onChange={(e) => upd("currentWeightKg", +e.target.value)} /></Field>
        <Field label="Target weight (kg)"><input type="number" style={{ ...input, fontFamily: C.mono }} value={profile.targetWeightKg} onChange={(e) => upd("targetWeightKg", +e.target.value)} /></Field>
      </div>
      <div style={{ marginTop: 14, background: C.brandSoft, border: `1px solid ${C.brand}`, borderRadius: 10, padding: "10px 14px", fontSize: 13, color: C.text }}>
        Target power-to-weight: <span style={{ fontFamily: C.mono, color: C.brand, fontWeight: 700 }}>{projWkg} W/kg</span> at {profile.targetFTP}W / {profile.targetWeightKg}kg
      </div>
      <div style={{ marginTop: 18 }}>
        <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Weekly shape — tap a day to change</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginTop: 8 }}>
          {DAYS.map((d) => (
            <button key={d} className="daytoggle" onClick={() => cycle(d)} style={{ background: C.surface, border: `1px solid ${C.border}`, borderTop: `3px solid ${typeColor(profile.schedule[d])}`, borderRadius: 8, padding: "10px 0 8px", cursor: "pointer", color: C.text }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{d}</div>
              <div style={{ fontSize: 10, color: C.muted, textTransform: "capitalize", marginTop: 4 }}>{profile.schedule[d]}</div>
            </button>
          ))}
        </div>
      </div>
      <button className="primary" onClick={onBuild} disabled={busy} style={{ ...primaryBtn, marginTop: 24, opacity: busy ? 0.6 : 1 }}>{busy ? "Building…" : "Build my week →"}</button>
    </div>
  );
}

function Dashboard({ profile, plan, sessions, weights, strava, busy, onEdit, onRegenerate, setSessions, setWeights, setError, saveProfile }) {
  const [selected, setSelected] = useState(null);
  const [q, setQ] = useState(""); const [answer, setAnswer] = useState(""); const [asking, setAsking] = useState(false);
  const [uploading, setUploading] = useState(false); const [shotting, setShotting] = useState(false);
  const [showManual, setShowManual] = useState(false); const [syncing, setSyncing] = useState(false);
  const [kg, setKg] = useState("");
  const fileRef = useRef(null); const shotRef = useRef(null);
  const sel = selected != null && plan ? plan.days[selected] : null;
  const selZone = sel ? ZONES[sel.intensity] || ZONES.rest : null;

  const ask = async () => {
    if (!q.trim()) return; setAsking(true); setAnswer("");
    try {
      const r = await fetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }) });
      const d = await r.json(); setAnswer(r.ok ? d.answer : d.error || "Coach is unavailable.");
    } catch { setAnswer("Coach is unavailable — try again."); } finally { setAsking(false); }
  };

  const uploadFiles = async (e) => {
    const files = [...(e.target.files || [])]; if (!files.length) return;
    setUploading(true); setError("");
    try {
      const fd = new FormData(); files.forEach((f) => fd.append("files", f));
      const r = await fetch("/api/sessions", { method: "POST", body: fd });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Upload failed.");
      setSessions(d.sessions); if (d.errors?.length) setError(d.errors.join(" · "));
    } catch (err) { setError(err.message); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const uploadShot = async (e) => {
    const file = (e.target.files || [])[0]; if (!file) return;
    setShotting(true); setError("");
    try {
      const fd = new FormData(); fd.append("image", file);
      const r = await fetch("/api/sessions/screenshot", { method: "POST", body: fd });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Couldn't read screenshot.");
      setSessions(d.sessions);
    } catch (err) { setError(err.message); } finally { setShotting(false); if (shotRef.current) shotRef.current.value = ""; }
  };

  const addManual = async (body) => {
    const r = await fetch("/api/sessions/manual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json(); if (r.ok) { setSessions(d.sessions); setShowManual(false); }
  };

  const syncStrava = async () => {
    setSyncing(true); setError("");
    try {
      const r = await fetch("/api/strava/sync", { method: "POST" });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Sync failed.");
      setSessions(d.sessions);
    } catch (err) { setError(err.message); } finally { setSyncing(false); }
  };

  const removeSession = async (id) => {
    const r = await fetch("/api/sessions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const d = await r.json(); if (r.ok) setSessions(d.sessions);
  };

  const logWeight = async () => {
    const w = Number(kg); if (!w) return;
    const r = await fetch("/api/weight", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kg: w }) });
    const d = await r.json(); if (r.ok) { setWeights(d.weights); setKg(""); }
  };
  const removeWeight = async (id) => {
    const r = await fetch("/api/weight", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const d = await r.json(); if (r.ok) setWeights(d.weights);
  };

  const downloadWorkout = (i) => {
    const a = document.createElement("a"); a.href = `/api/workout?day=${i}`; a.download = "";
    document.body.appendChild(a); a.click(); a.remove();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Card><GoalHeader profile={profile} weights={weights} onEdit={onEdit} /></Card>

      {plan ? (
        <>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <div><Eyebrow>This week</Eyebrow><div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>{plan.weekFocus}</div></div>
              <button onClick={onRegenerate} className="ghost" style={ghostBtn} disabled={busy}>{busy ? "…" : "↻ New week"}</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(96px, 1fr))", gap: 8, overflowX: "auto" }}>
              {plan.days.map((d, i) => {
                const z = ZONES[d.intensity] || ZONES.rest; const active = selected === i;
                return (
                  <button key={i} onClick={() => setSelected(active ? null : i)} className="daycard" style={{ textAlign: "left", background: active ? C.surfaceHi : C.surface, border: `1px solid ${active ? z.color : C.border}`, borderLeft: `4px solid ${z.color}`, borderRadius: 10, padding: "12px 10px", cursor: "pointer", color: C.text, minHeight: 118, display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, fontWeight: 800 }}>{d.day}</span>
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: z.color }} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>{d.title}</div>
                    <div style={{ marginTop: "auto", fontSize: 10.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>{z.label}</div>
                    <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted }}>{d.duration}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {sel && (
            <Card style={{ borderLeft: `4px solid ${selZone.color}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontSize: 17, fontWeight: 800 }}>{sel.day} · {sel.title}</div>
                <div style={{ fontFamily: C.mono, color: selZone.color, fontWeight: 700 }}>{selZone.label} · {sel.duration}</div>
              </div>
              <p style={{ lineHeight: 1.6, margin: "10px 0 0", fontSize: 15 }}>{sel.description}</p>
              {sel.type === "ride" && sel.steps?.length > 0 && (
                <button onClick={() => downloadWorkout(selected)} className="ghost" style={{ ...ghostBtn, marginTop: 14, color: C.text, borderColor: C.brand }}>
                  ⬇ Garmin workout (.FIT) · {sel.steps.length} steps
                </button>
              )}
            </Card>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <Card>
              <Eyebrow>Fuel</Eyebrow>
              <div style={{ display: "flex", gap: 18, marginTop: 12, flexWrap: "wrap" }}>
                <Stat label="Training day" value={plan.nutrition.trainingDayCalories} unit="kcal" />
                <Stat label="Rest day" value={plan.nutrition.restDayCalories} unit="kcal" />
                <Stat label="Protein" value={plan.nutrition.proteinG} unit="g/day" color={C.brand} />
              </div>
              <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.5, marginTop: 14 }}>{plan.nutrition.notes}</p>
            </Card>
            <Card style={{ borderColor: C.brand, background: C.brandSoft }}>
              <Eyebrow>Coach's note</Eyebrow>
              <p style={{ lineHeight: 1.6, marginTop: 10, fontSize: 15 }}>{plan.coachNote}</p>
            </Card>
          </div>
        </>
      ) : (
        <Card><div style={{ textAlign: "center", padding: "12px 0" }}>
          <p style={{ color: C.muted, marginBottom: 14 }}>No plan yet.</p>
          <button onClick={onRegenerate} className="primary" style={{ ...primaryBtn, width: "auto", padding: "12px 22px" }} disabled={busy}>{busy ? "Building…" : "Build my week"}</button>
        </div></Card>
      )}

      {/* Weight tracking */}
      <WeightCard profile={profile} weights={weights} kg={kg} setKg={setKg} logWeight={logWeight} removeWeight={removeWeight} />

      {/* Completed sessions */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <Eyebrow>Completed sessions</Eyebrow>
            <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>The coach reads these and adapts your next week.</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => shotRef.current?.click()} className="ghost" style={ghostBtn} disabled={shotting}>{shotting ? "Reading…" : "📷 Screenshot"}</button>
            <button onClick={() => fileRef.current?.click()} className="ghost" style={ghostBtn} disabled={uploading}>{uploading ? "Reading…" : "📁 File"}</button>
            <button onClick={() => setShowManual((v) => !v)} className="ghost" style={ghostBtn}>✎ Manual</button>
            {strava.configured && (strava.connected
              ? <button onClick={syncStrava} className="ghost" style={ghostBtn} disabled={syncing}>{syncing ? "Syncing…" : "↻ Strava"}</button>
              : <a href="/api/strava/connect" className="ghost" style={{ ...ghostBtn, textDecoration: "none" }}>Connect Strava</a>)}
            <input ref={shotRef} type="file" accept="image/*" onChange={uploadShot} style={{ display: "none" }} />
            <input ref={fileRef} type="file" accept=".fit,.tcx,.gpx" multiple onChange={uploadFiles} style={{ display: "none" }} />
          </div>
        </div>

        {showManual && <ManualForm onAdd={addManual} onCancel={() => setShowManual(false)} />}

        {strava.connected && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 12.5, color: C.muted }}>
            <input type="checkbox" checked={!!profile.useStravaForCoaching} onChange={(e) => saveProfile({ ...profile, useStravaForCoaching: e.target.checked })} />
            Use Strava activities for AI coaching (otherwise they're log-only — see Strava's API terms)
          </label>
        )}

        {sessions.length > 0 && (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            {sessions.slice(0, 10).map((s) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: C.mono }}>{s.date ? s.date.slice(0, 10) : "—"} · {s.source}</div>
                </div>
                <Metric v={fmtMins(s.durationSec)} l="time" />
                {s.distanceKm != null && <Metric v={`${s.distanceKm}km`} l="dist" />}
                {s.avgPower != null && <Metric v={`${s.avgPower}W`} l="avg" />}
                {s.avgHr != null && <Metric v={`${s.avgHr}`} l="bpm" />}
                <button onClick={() => removeSession(s.id)} className="ghost" style={{ ...ghostBtn, padding: "4px 9px", fontSize: 12 }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Ask coach */}
      <Card>
        <Eyebrow>Ask your coach</Eyebrow>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <input style={{ ...input, flex: 1, minWidth: 200 }} placeholder="e.g. I'm 1.5kg down but Thursday felt flat — adjust?" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} />
          <button onClick={ask} disabled={asking} className="primary" style={{ ...primaryBtn, width: "auto", padding: "0 20px", opacity: asking ? 0.6 : 1 }}>{asking ? "…" : "Ask"}</button>
        </div>
        {(asking || answer) && <p style={{ lineHeight: 1.6, marginTop: 14, fontSize: 15 }}>{asking ? <span className="pulse" style={{ color: C.muted }}>Coach is thinking…</span> : answer}</p>}
      </Card>
    </div>
  );
}

function GoalHeader({ profile, weights, onEdit }) {
  const wo = weeksOut(profile.eventDate);
  const cw = latestWeight(weights, profile);
  const ftpPct = Math.min(100, Math.max(0, ((profile.currentFTP - 150) / (profile.targetFTP - 150)) * 100));
  const wRange = profile.currentWeightKg - profile.targetWeightKg;
  const wPct = wRange > 0 ? Math.min(100, Math.max(0, ((profile.currentWeightKg - cw) / wRange) * 100)) : 0;
  const curWkg = (profile.currentFTP / cw).toFixed(2);
  const projWkg = (profile.targetFTP / profile.targetWeightKg).toFixed(2);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center", justifyContent: "space-between" }}>
      <div>
        <Eyebrow>Goal</Eyebrow>
        <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{profile.eventName}</div>
        <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}><span style={{ fontFamily: C.mono, color: C.text }}>{wo}</span> weeks out · {profile.eventDate}</div>
        <div style={{ marginTop: 10, fontSize: 12, color: C.muted }}>Power-to-weight</div>
        <div style={{ fontFamily: C.mono, fontSize: 18, fontWeight: 700 }}>{curWkg} <span style={{ color: C.muted, fontSize: 13 }}>→</span> <span style={{ color: C.brand }}>{projWkg}</span> <span style={{ color: C.muted, fontSize: 12 }}>W/kg</span></div>
      </div>
      <div style={{ minWidth: 220, flex: 1, maxWidth: 340, display: "flex", flexDirection: "column", gap: 14 }}>
        <Bar label="FTP" left={`${profile.currentFTP}W`} right={`${profile.targetFTP}W`} pct={ftpPct} a={ZONES.threshold.color} />
        <Bar label="Weight" left={`${cw}kg`} right={`${profile.targetWeightKg}kg`} pct={wPct} a={ZONES.endurance.color} />
      </div>
      <button onClick={onEdit} className="ghost" style={ghostBtn}>Edit goal</button>
    </div>
  );
}

const Bar = ({ label, left, right, pct, a }) => (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.muted, marginBottom: 6 }}>
      <span>{label}</span><span style={{ fontFamily: C.mono, color: C.text }}>{left} → {right}</span>
    </div>
    <div style={{ height: 8, background: C.surfaceHi, borderRadius: 999, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg, ${a}, ${C.brand})`, borderRadius: 999 }} />
    </div>
  </div>
);

function WeightCard({ profile, weights, kg, setKg, logWeight, removeWeight }) {
  const sorted = [...(weights || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
  const cw = latestWeight(weights, profile);
  const recent7 = sorted.slice(0, 7);
  const avg7 = recent7.length ? (recent7.reduce((s, w) => s + w.kg, 0) / recent7.length).toFixed(1) : null;
  const toGo = (cw - profile.targetWeightKg).toFixed(1);
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <Eyebrow>Weight</Eyebrow>
        <div style={{ display: "flex", gap: 8 }}>
          <input type="number" step="0.1" placeholder="kg" value={kg} onChange={(e) => setKg(e.target.value)} onKeyDown={(e) => e.key === "Enter" && logWeight()} style={{ ...input, width: 90, fontFamily: C.mono }} />
          <button onClick={logWeight} className="ghost" style={ghostBtn}>Log</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 22, marginTop: 14, flexWrap: "wrap" }}>
        <Stat label="Current" value={cw} unit="kg" />
        {avg7 && <Stat label="7-day avg" value={avg7} unit="kg" />}
        <Stat label="To target" value={toGo} unit="kg" color={C.brand} />
      </div>
      {sorted.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {sorted.slice(0, 8).map((w) => (
            <span key={w.id} onClick={() => removeWeight(w.id)} title="Click to remove" style={{ cursor: "pointer", fontFamily: C.mono, fontSize: 12, color: C.muted, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "4px 8px" }}>
              {w.date.slice(5, 10)} · {w.kg}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

function ManualForm({ onAdd }) {
  const [f, setF] = useState({ name: "", durationMin: "", avgPower: "", distanceKm: "", avgHr: "" });
  const u = (k, v) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div style={{ marginTop: 14, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
      <input style={{ ...input, gridColumn: "1 / -1" }} placeholder="Name (e.g. Threshold 3x12)" value={f.name} onChange={(e) => u("name", e.target.value)} />
      <input style={{ ...input, fontFamily: C.mono }} placeholder="Duration (min)" type="number" value={f.durationMin} onChange={(e) => u("durationMin", e.target.value)} />
      <input style={{ ...input, fontFamily: C.mono }} placeholder="Avg power (W)" type="number" value={f.avgPower} onChange={(e) => u("avgPower", e.target.value)} />
      <input style={{ ...input, fontFamily: C.mono }} placeholder="Distance (km)" type="number" value={f.distanceKm} onChange={(e) => u("distanceKm", e.target.value)} />
      <input style={{ ...input, fontFamily: C.mono }} placeholder="Avg HR (bpm)" type="number" value={f.avgHr} onChange={(e) => u("avgHr", e.target.value)} />
      <button onClick={() => onAdd(f)} className="primary" style={{ ...primaryBtn, gridColumn: "1 / -1", padding: "10px 0", fontSize: 14 }}>Add session</button>
    </div>
  );
}

const Stat = ({ label, value, unit, color }) => (
  <div>
    <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>{label}</div>
    <div style={{ fontFamily: C.mono, fontSize: 26, fontWeight: 700, color: color || C.text, marginTop: 4 }}>{value}<span style={{ fontSize: 12, color: C.muted, marginLeft: 4 }}>{unit}</span></div>
  </div>
);
const Metric = ({ v, l }) => (
  <div style={{ textAlign: "right" }}>
    <div style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 700 }}>{v}</div>
    <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase" }}>{l}</div>
  </div>
);
