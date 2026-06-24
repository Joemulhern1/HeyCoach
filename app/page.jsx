"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./globals.css";
import { LIBRARY, CATEGORIES } from "../lib/library.js";
import { computePMC } from "../lib/analytics.js";

const ZONES = {
  recovery: { label: "Recovery", color: "#0EA5E9" },
  endurance: { label: "Endurance", color: "#10B981" },
  tempo: { label: "Tempo", color: "#65A30D" },
  threshold: { label: "Threshold", color: "#F59E0B" },
  vo2: { label: "VO2 Max", color: "#EF4444" },
  strength: { label: "Strength", color: "#8B5CF6" },
  rest: { label: "Rest", color: "#94A3B8" },
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
  brandSoft: "var(--brandSoft)", mono: "var(--mono)",
};
const input = { background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 10, padding: "10px 12px", fontSize: 15, outline: "none", width: "100%" };
const primaryBtn = { background: C.brand, color: "#fff", border: "none", borderRadius: 12, padding: "14px 0", fontSize: 16, fontWeight: 700, cursor: "pointer", width: "100%" };
const ghostBtn = { background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 10, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600 };

// Parse a response safely — if the server returns non-JSON (timeout/crash page),
// surface a readable message instead of a cryptic "Unexpected token" error.
async function jget(r) {
  const t = await r.text();
  try { return JSON.parse(t); }
  catch { return { error: r.status === 504 || /timed out|timeout/i.test(t) ? "That took too long — please try again." : (t || "").replace(/<[^>]*>/g, "").trim().slice(0, 140) || "Server error — try again." }; }
}

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
  const [block, setBlock] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [weights, setWeights] = useState([]);
  const [progression, setProgression] = useState(null);
  const [me, setMe] = useState(null);
  const [events, setEvents] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [strava, setStrava] = useState({ configured: false, connected: false, athlete: null });
  const [screen, setScreen] = useState("onboarding");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [nav, setNav] = useState("today");

  useEffect(() => {
    Promise.all([
      fetch("/api/state").then((r) => jget(r)),
      fetch("/api/strava/status").then((r) => jget(r)).catch(() => ({})),
      fetch("/api/auth/me").then((r) => jget(r)).catch(() => ({})),
    ]).then(([s, st, m]) => {
      if (m?.user) setMe(m.user);
      if (s.profile) { setProfile(migrate(s.profile)); setScreen("dashboard"); }
      if (s.block) setBlock(s.block);
      if (s.sessions) setSessions(s.sessions);
      if (s.weights) setWeights(s.weights);
      if (s.progression) setProgression(s.progression);
      if (s.events) setEvents(s.events);
      if (s.availability) setAvailability(s.availability);
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
        if (!r.ok) throw new Error((await jget(r)).error || "Couldn't save your goal.");
      }
      const r = await fetch("/api/block", { method: "POST" });
      const data = await jget(r);
      if (!r.ok) throw new Error(data.error || "Couldn't build the plan.");
      setBlock(data.block); if (data.events) setEvents(data.events); setScreen("dashboard");
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const saveProfile = async (next) => {
    setProfile(next);
    await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
  };

  const rebuildTimer = useRef(null);
  const scheduleRebuild = () => {
    if (!block) return; // don't auto-build before the first plan exists
    clearTimeout(rebuildTimer.current);
    rebuildTimer.current = setTimeout(() => build(false), 1800);
  };

  if (loading) return <CenterWrap><Spinner label="Loading your coach…" /></CenterWrap>;

  if (screen === "onboarding") return (
    <CenterWrap>
      {error && <ErrBanner>{error}</ErrBanner>}
      <Onboarding profile={profile} setProfile={setProfile} onBuild={() => build(true)} busy={busy} />
    </CenterWrap>
  );

  return (
    <AppShell me={me} nav={nav} setNav={setNav}>
      {error && <ErrBanner>{error}</ErrBanner>}
      <Dashboard
        profile={profile} block={block} setBlock={setBlock} sessions={sessions} weights={weights} strava={strava} busy={busy}
        progression={progression} setProgression={setProgression} events={events} setEvents={setEvents} availability={availability} setAvailability={setAvailability} scheduleRebuild={scheduleRebuild}
        onEdit={() => setScreen("onboarding")} onRegenerate={() => build(false)}
        setSessions={setSessions} setWeights={setWeights} setError={setError} saveProfile={saveProfile}
        nav={nav} setNav={setNav} me={me}
      />
    </AppShell>
  );
}

const Logo = () => <span style={{ width: 22, height: 22, borderRadius: 7, background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 900, flexShrink: 0 }}>H</span>;
const ErrBanner = ({ children }) => <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 14 }}>{children}</div>;

function CenterWrap({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text }}>
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "26px 20px 64px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, fontWeight: 800, fontSize: 17, letterSpacing: -0.4, marginBottom: 26 }}><Logo /> HeyCoach</div>
        {children}
      </div>
    </div>
  );
}

const NAV = [
  { label: "Train" },
  { id: "today", label: "Today", ic: "🏠" },
  { id: "calendar", label: "Calendar", ic: "🗓" },
  { id: "workouts", label: "Workouts", ic: "🚴" },
  { label: "Track" },
  { id: "analytics", label: "Analytics", ic: "📈" },
  { id: "nutrition", label: "Nutrition", ic: "🍽" },
  { id: "activity", label: "Activity", ic: "📋" },
  { label: "Ask" },
  { id: "coach", label: "Coach", ic: "💬" },
];

function AppShell({ me, nav, setNav, children }) {
  const [open, setOpen] = useState(false);
  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; };
  const go = (id) => { setNav(id); setOpen(false); };
  return (
    <div className="app">
      <div className={"scrim" + (open ? " show" : "")} onClick={() => setOpen(false)} />
      <aside className={"sidebar" + (open ? " open" : "")}>
        <div className="brandmark"><Logo /> HeyCoach</div>
        {NAV.map((n, i) => n.id
          ? <button key={n.id} className={"navitem" + (nav === n.id ? " active" : "")} onClick={() => go(n.id)}><span className="ic">{n.ic}</span>{n.label}</button>
          : <div key={"s" + i} className="navlabel">{n.label}</div>
        )}
        <div className="sidefoot">
          {me?.role === "admin" && <a href="/admin" className="navitem"><span className="ic">⚙️</span>Admin</a>}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px" }}>
            <span style={{ width: 30, height: 30, borderRadius: "50%", background: C.brandSoft, color: C.brand, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{(me?.displayName || me?.username || "?").slice(0, 1).toUpperCase()}</span>
            <div style={{ minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{me?.displayName || me?.username || "Athlete"}</div></div>
          </div>
          <button className="navitem" onClick={logout}><span className="ic">⎋</span>Log out</button>
        </div>
      </aside>
      <div className="content">
        <div className="topbar">
          <button className="hamb" onClick={() => setOpen(true)}>☰</button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: 15 }}><Logo /> HeyCoach</div>
        </div>
        <div className="content-inner">{children}</div>
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

function Dashboard({ profile, block, setBlock, sessions, weights, strava, busy, onEdit, onRegenerate, setSessions, setWeights, setError, saveProfile, progression, setProgression, events, setEvents, availability, setAvailability, scheduleRebuild, nav, setNav, me }) {
  const [selected, setSelected] = useState(null); // { week, day }
  const [q, setQ] = useState(""); const [answer, setAnswer] = useState(""); const [asking, setAsking] = useState(false);
  const [uploading, setUploading] = useState(false); const [shotting, setShotting] = useState(false);
  const [showManual, setShowManual] = useState(false); const [syncing, setSyncing] = useState(false);
  const [preparing, setPreparing] = useState(null);
  const [kg, setKg] = useState("");
  const fileRef = useRef(null); const shotRef = useRef(null);
  const curWeek = block ? currentWeekIdx(block) : 0;
  const sel = selected && block ? block.weeks[selected.week]?.days?.[selected.day] : null;
  const selZone = sel ? ZONES[sel.intensity] || ZONES.rest : null;

  const ask = async () => {
    if (!q.trim()) return; setAsking(true); setAnswer("");
    try {
      const r = await fetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }) });
      const d = await jget(r); setAnswer(r.ok ? d.answer : d.error || "Coach is unavailable.");
    } catch { setAnswer("Coach is unavailable — try again."); } finally { setAsking(false); }
  };

  const uploadFiles = async (e) => {
    const files = [...(e.target.files || [])]; if (!files.length) return;
    setUploading(true); setError("");
    try {
      const fd = new FormData(); files.forEach((f) => fd.append("files", f));
      const r = await fetch("/api/sessions", { method: "POST", body: fd });
      const d = await jget(r); if (!r.ok) throw new Error(d.error || "Upload failed.");
      setSessions(d.sessions); if (d.errors?.length) setError(d.errors.join(" · "));
    } catch (err) { setError(err.message); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const uploadShot = async (e) => {
    const file = (e.target.files || [])[0]; if (!file) return;
    setShotting(true); setError("");
    try {
      const fd = new FormData(); fd.append("image", file);
      const r = await fetch("/api/sessions/screenshot", { method: "POST", body: fd });
      const d = await jget(r); if (!r.ok) throw new Error(d.error || "Couldn't read screenshot.");
      setSessions(d.sessions);
    } catch (err) { setError(err.message); } finally { setShotting(false); if (shotRef.current) shotRef.current.value = ""; }
  };

  const addManual = async (body) => {
    const r = await fetch("/api/sessions/manual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await jget(r); if (r.ok) { setSessions(d.sessions); setShowManual(false); }
  };

  const syncStrava = async () => {
    setSyncing(true); setError("");
    try {
      const r = await fetch("/api/strava/sync", { method: "POST" });
      const d = await jget(r); if (!r.ok) throw new Error(d.error || "Sync failed.");
      setSessions(d.sessions);
    } catch (err) { setError(err.message); } finally { setSyncing(false); }
  };

  const removeSession = async (id) => {
    const r = await fetch("/api/sessions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const d = await jget(r); if (r.ok) setSessions(d.sessions);
  };

  const sendFeedback = async (sessionId, outcome) => {
    const r = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, outcome }) });
    const d = await jget(r); if (r.ok) { setSessions(d.sessions); setProgression(d.progression); }
  };

  const bumpFtp = (newFtp) => saveProfile({ ...profile, currentFTP: newFtp });
  const ftpSuggestion = suggestFtpClient(sessions, profile);

  const logWeight = async () => {
    const w = Number(kg); if (!w) return;
    const r = await fetch("/api/weight", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kg: w }) });
    const d = await jget(r); if (r.ok) { setWeights(d.weights); setKg(""); }
  };
  const removeWeight = async (id) => {
    const r = await fetch("/api/weight", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const d = await jget(r); if (r.ok) setWeights(d.weights);
  };

  const downloadWorkout = (w, d) => {
    const a = document.createElement("a"); a.href = `/api/workout?week=${w}&day=${d}`; a.download = "";
    document.body.appendChild(a); a.click(); a.remove();
  };

  const prepareWeek = async (weekIndex) => {
    setPreparing(weekIndex); setError("");
    try {
      const r = await fetch("/api/block/week", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weekIndex }) });
      const d = await jget(r); if (!r.ok) throw new Error(d.error || "Couldn't prepare that week.");
      setBlock(d.block);
    } catch (e) { setError(e.message); } finally { setPreparing(null); }
  };

  const dayAction = async (body) => {
    setError("");
    const r = await fetch("/api/block/day", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await jget(r); if (r.ok) { setBlock(d.block); if (d.progression) setProgression(d.progression); } else setError(d.error);
  };

  const todayIso = new Date().toISOString().slice(0, 10);
  const isoFromWeek = (start, di) => new Date(new Date(start + "T00:00:00Z").getTime() + di * 86400000).toISOString().slice(0, 10);
  let today = null, todayPos = null;
  if (block) block.weeks.forEach((w, wi) => w.days.forEach((d, di) => { if ((d.date || isoFromWeek(w.startDate, di)) === todayIso) { today = d; todayPos = { week: wi, day: di }; } }));
  const tz = today ? (ZONES[today.intensity] || ZONES.rest) : null;

  const Head = ({ title, sub }) => (
    <div style={{ marginBottom: 2 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.4 }}>{title}</h1>
      {sub && <div style={{ color: C.muted, fontSize: 14, marginTop: 3 }}>{sub}</div>}
    </div>
  );

  const buildPrompt = (
    <Card><div style={{ textAlign: "center", padding: "12px 0" }}>
      <p style={{ color: C.muted, marginBottom: 14 }}>No plan yet.</p>
      <button onClick={onRegenerate} className="primary" style={{ ...primaryBtn, width: "auto", padding: "12px 22px" }} disabled={busy}>{busy ? "Building…" : "Build my plan"}</button>
    </div></Card>
  );

  const sessionsCard = (
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
      {sessions.length > 0 ? (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          {sessions.slice(0, 10).map((s) => (
            <div key={s.id} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
              <FeedbackStrip s={s} onFeedback={sendFeedback} />
            </div>
          ))}
        </div>
      ) : <div style={{ marginTop: 14, color: C.muted, fontSize: 13.5 }}>No rides logged yet — import a .fit/.tcx/.gpx, drop a screenshot, or add one manually.</div>}
    </Card>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {nav === "today" && (<>
        <Head title={`Hi${me?.displayName || me?.username ? ", " + (me.displayName || me.username) : ""} 👋`} sub="Here's where you stand today." />
        <Card><GoalHeader profile={profile} weights={weights} onEdit={onEdit} events={events} /></Card>
        {block ? (
          <Card style={tz ? { borderLeft: `4px solid ${tz.color}` } : {}}>
            <Eyebrow>Today · {todayIso}</Eyebrow>
            {today ? (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ fontSize: 19, fontWeight: 800 }}>{today.title}</div>
                  <div style={{ fontFamily: C.mono, color: tz.color, fontWeight: 700 }}>{tz.label} · {today.duration}</div>
                </div>
                <p style={{ color: C.muted, marginTop: 8, lineHeight: 1.6, marginBottom: 0 }}>{today.description}</p>
                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  {today.type === "ride" && today.steps?.length > 0 && <button onClick={() => downloadWorkout(todayPos.week, todayPos.day)} className="ghost" style={ghostBtn}>⬇ Garmin (.FIT)</button>}
                  <button onClick={() => { setSelected(todayPos); setNav("calendar"); }} className="ghost" style={ghostBtn}>Open in calendar →</button>
                </div>
              </div>
            ) : <p style={{ color: C.muted, marginTop: 8, marginBottom: 0 }}>Nothing scheduled today — enjoy the rest.</p>}
          </Card>
        ) : buildPrompt}
        <AnalyticsCard sessions={sessions} profile={profile} />
      </>)}

      {nav === "calendar" && (<>
        <Head title="Calendar" sub="Your plan, races and time off — periodised and rolling." />
        <EventsCard events={events} setEvents={setEvents} setError={setError} scheduleRebuild={scheduleRebuild} />
        <AvailabilityCard availability={availability} setAvailability={setAvailability} setError={setError} scheduleRebuild={scheduleRebuild} />
        {block ? (
          <BlockView
            block={block} curWeek={curWeek} selected={selected} setSelected={setSelected}
            sel={sel} selZone={selZone} onRegenerate={onRegenerate} busy={busy}
            downloadWorkout={downloadWorkout} prepareWeek={prepareWeek} preparing={preparing} events={events} dayAction={dayAction}
          />
        ) : buildPrompt}
      </>)}

      {nav === "workouts" && (<>
        <Head title="Workouts" sub="56 science-based sessions — preview the profile and send to your Garmin." />
        <LibraryCard />
      </>)}

      {nav === "analytics" && (<>
        <Head title="Analytics" sub="Fitness, fatigue and form — plus your zone progression." />
        <AnalyticsCard sessions={sessions} profile={profile} />
        {block && <ProgressionCard progression={progression} ftpSuggestion={ftpSuggestion} onBumpFtp={bumpFtp} />}
        <WeightCard profile={profile} weights={weights} kg={kg} setKg={setKg} logWeight={logWeight} removeWeight={removeWeight} />
      </>)}

      {nav === "nutrition" && (<>
        <Head title="Nutrition" sub="Fuelling for your training load." />
        {block?.nutrition ? <NutritionView n={block.nutrition} /> : buildPrompt}
        <WeightCard profile={profile} weights={weights} kg={kg} setKg={setKg} logWeight={logWeight} removeWeight={removeWeight} />
      </>)}

      {nav === "activity" && (<>
        <Head title="Activity" sub="Log your rides — the coach reads them and adapts." />
        {sessionsCard}
      </>)}

      {nav === "coach" && (<>
        <Head title="Coach" sub="Ask anything about your training, nutrition or form." />
        <Card>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input style={{ ...input, flex: 1, minWidth: 200 }} placeholder="e.g. I'm 1.5kg down but Thursday felt flat — adjust?" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} />
            <button onClick={ask} disabled={asking} className="primary" style={{ ...primaryBtn, width: "auto", padding: "0 20px", opacity: asking ? 0.6 : 1 }}>{asking ? "…" : "Ask"}</button>
          </div>
          {(asking || answer) && <p style={{ lineHeight: 1.6, marginTop: 14, fontSize: 15, marginBottom: 0 }}>{asking ? <span className="pulse" style={{ color: C.muted }}>Coach is thinking…</span> : answer}</p>}
        </Card>
      </>)}
    </div>
  );
}

function NutritionView({ n }) {
  const Stat = ({ label, value, unit, color }) => (
    <div style={{ flex: 1, minWidth: 150, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, fontFamily: C.mono, marginTop: 6, color: color || C.text }}>{value}<span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}> {unit}</span></div>
    </div>
  );
  return (
    <>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Stat label="Training-day fuel" value={n.trainingDayCalories} unit="kcal" color={ZONES.endurance.color} />
        <Stat label="Rest-day target" value={n.restDayCalories} unit="kcal" color={ZONES.recovery.color} />
        <Stat label="Daily protein" value={n.proteinG} unit="g" color={C.brand} />
      </div>
      {n.notes && <Card style={{ marginTop: 14 }}><Eyebrow>Coach's note</Eyebrow><p style={{ lineHeight: 1.6, marginTop: 8, marginBottom: 0, fontSize: 14.5 }}>{n.notes}</p></Card>}
      <Card style={{ marginTop: 14, background: C.brandSoft, border: `1px solid ${C.brand}` }}>
        <Eyebrow>Coming next</Eyebrow>
        <p style={{ lineHeight: 1.6, marginTop: 8, marginBottom: 0, fontSize: 14 }}>Per-day meal plans, macro splits (carbs/protein/fat) and ride-day fuelling (carbs/hour, pre/during/post) are the next feature landing here.</p>
      </Card>
    </>
  );
}

function GoalHeader({ profile, weights, onEdit, events }) {
  const next = nextEventOf(events, profile);
  const wo = next ? weeksOut(next.date) : null;
  const cw = latestWeight(weights, profile);
  const ftpPct = Math.min(100, Math.max(0, ((profile.currentFTP - 150) / (profile.targetFTP - 150)) * 100));
  const wRange = profile.currentWeightKg - profile.targetWeightKg;
  const wPct = wRange > 0 ? Math.min(100, Math.max(0, ((profile.currentWeightKg - cw) / wRange) * 100)) : 0;
  const curWkg = (profile.currentFTP / cw).toFixed(2);
  const projWkg = (profile.targetFTP / profile.targetWeightKg).toFixed(2);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center", justifyContent: "space-between" }}>
      <div>
        <Eyebrow>Next event</Eyebrow>
        <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{next ? next.name : "No event set"}</div>
        <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>{next ? <><span style={{ fontFamily: C.mono, color: C.text }}>{wo}</span> weeks out · {next.date}{next.priority ? ` · ${next.priority}-race` : ""}</> : "Add one below and the plan builds around it"}</div>
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

function nextEventOf(events, profile) {
  const today = new Date().toISOString().slice(0, 10);
  const future = (events || []).filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  if (future.length) return future[0];
  if (profile?.eventDate && profile.eventDate >= today) return { name: profile.eventName || "Goal event", date: profile.eventDate, priority: "A" };
  return null;
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

function currentWeekIdx(block) {
  if (!block?.weeks?.length) return 0;
  const today = new Date().toISOString().slice(0, 10);
  for (let i = block.weeks.length - 1; i >= 0; i--) {
    if (block.weeks[i].startDate <= today) return i;
  }
  return 0;
}

function BlockView({ block, curWeek, selected, setSelected, sel, selZone, onRegenerate, busy, downloadWorkout, prepareWeek, preparing, events, dayAction }) {
  const [moveOpen, setMoveOpen] = useState(false);
  const [view, setView] = useState("calendar");
  const selWeek = selected ? block.weeks[selected.week] : null;
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <div><Eyebrow>Training plan</Eyebrow><div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>{busy ? "Re-planning around your changes…" : `${block.weeks.length} weeks · rolling`}</div></div>
        <button onClick={onRegenerate} className="ghost" style={ghostBtn} disabled={busy}>{busy ? "…" : "↻ Rebuild"}</button>
      </div>
      {block.summary && <p style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.5, margin: "0 0 12px" }}>{block.summary}</p>}
      {Array.isArray(block.phases) && block.phases.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {block.phases.map((p, i) => (
            <span key={i} style={{ fontSize: 11.5, color: C.muted, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "4px 9px" }}>
              <b style={{ color: C.text }}>{p.name}</b>{p.weeks ? ` · wk ${p.weeks}` : ""}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {["calendar", "weeks"].map((v) => (
          <button key={v} onClick={() => setView(v)} className="ghost" style={{ ...ghostBtn, padding: "5px 12px", fontSize: 12.5, ...(view === v ? { borderColor: C.brand, color: C.text } : {}) }}>{v === "calendar" ? "📅 Calendar" : "Weeks"}</button>
        ))}
      </div>

      {view === "calendar" ? (
        <CalendarView weeks={block.weeks} events={events} curWeek={curWeek} selected={selected} setSelected={setSelected} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {block.weeks.map((wk, wi) => {
            const next = block.weeks[wi + 1];
            const wkEvents = (events || []).filter((e) => e.date >= wk.startDate && (!next || e.date < next.startDate));
            return <WeekRow key={wi} wk={wk} wi={wi} isCurrent={wi === curWeek} selected={selected} setSelected={setSelected} wkEvents={wkEvents} />;
          })}
        </div>
      )}

      {sel && selWeek && (
        <Card style={{ borderLeft: `4px solid ${sel.status === "missed" ? "#FB7185" : sel.status === "off" ? C.faint : selZone.color}`, marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 17, fontWeight: 800, textDecoration: sel.status === "missed" ? "line-through" : "none", color: sel.status === "missed" ? C.muted : C.text }}>Wk {selWeek.weekNumber} · {sel.day} · {sel.title}</div>
            <div style={{ fontFamily: C.mono, color: selZone.color, fontWeight: 700 }}>{selZone.label} · {sel.duration}</div>
          </div>
          {sel.status === "missed" && <div style={{ color: "#FB7185", fontSize: 12, fontWeight: 700, marginTop: 6 }}>✕ Marked missed</div>}
          <p style={{ lineHeight: 1.6, margin: "10px 0 0", fontSize: 15 }}>{sel.description}</p>
          {sel.type === "ride" && sel.status !== "off" && (sel.steps?.length > 0
            ? <button onClick={() => downloadWorkout(selected.week, selected.day)} className="ghost" style={{ ...ghostBtn, marginTop: 14, color: C.text, borderColor: C.brand }}>⬇ Garmin workout (.FIT) · {sel.steps.length} steps</button>
            : <button onClick={() => prepareWeek(selected.week)} className="ghost" style={{ ...ghostBtn, marginTop: 14 }} disabled={preparing === selected.week}>{preparing === selected.week ? "Preparing week…" : "Prepare this week's intervals →"}</button>
          )}
          {sel.status !== "off" && (
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button onClick={() => setMoveOpen((v) => !v)} className="ghost" style={{ ...ghostBtn, fontSize: 12.5 }}>↔ Move</button>
              {sel.status === "missed"
                ? <button onClick={() => dayAction({ weekIndex: selected.week, dayIndex: selected.day, action: "clear" })} className="ghost" style={{ ...ghostBtn, fontSize: 12.5 }}>Undo missed</button>
                : <button onClick={() => dayAction({ weekIndex: selected.week, dayIndex: selected.day, action: "missed" })} className="ghost" style={{ ...ghostBtn, fontSize: 12.5, color: "#FB7185", borderColor: "#FB7185" }}>✕ Mark missed</button>}
            </div>
          )}
          {moveOpen && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 6 }}>Swap with which day?</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {selWeek.days.map((d, ti) => ti !== selected.day && (
                  <button key={ti} onClick={() => { dayAction({ weekIndex: selected.week, dayIndex: selected.day, targetDayIndex: ti, action: "swap" }); setMoveOpen(false); }} className="ghost" style={{ ...ghostBtn, padding: "5px 10px", fontSize: 12 }}>{d.day}</button>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {block.nutrition && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 16 }}>
          <Card>
            <Eyebrow>Fuel</Eyebrow>
            <div style={{ display: "flex", gap: 18, marginTop: 12, flexWrap: "wrap" }}>
              <Stat label="Training day" value={block.nutrition.trainingDayCalories} unit="kcal" />
              <Stat label="Rest day" value={block.nutrition.restDayCalories} unit="kcal" />
              <Stat label="Protein" value={block.nutrition.proteinG} unit="g/day" color={C.brand} />
            </div>
            <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.5, marginTop: 14 }}>{block.nutrition.notes}</p>
          </Card>
          <Card style={{ borderColor: C.brand, background: C.brandSoft }}>
            <Eyebrow>Coach's note</Eyebrow>
            <p style={{ lineHeight: 1.6, marginTop: 10, fontSize: 15 }}>{block.coachNote}</p>
          </Card>
        </div>
      )}
    </>
  );
}

function WeekRow({ wk, wi, isCurrent, selected, setSelected, wkEvents }) {
  const PRIO = { A: "#FB7185", B: "#FBBF24", C: "#A3E635" };
  return (
    <div style={{ background: isCurrent ? C.surfaceHi : C.surface, border: `1px solid ${isCurrent ? C.brand : C.border}`, borderRadius: 12, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          Week {wk.weekNumber} <span style={{ color: C.muted, fontWeight: 600 }}>· {wk.phase}</span>
          {isCurrent && <span style={{ marginLeft: 8, fontSize: 10, color: C.brand, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>This week</span>}
        </div>
        <div style={{ fontSize: 11, color: C.muted, fontFamily: C.mono }}>{wk.startDate ? wk.startDate.slice(5) : ""}{wk.targetHours ? ` · ${wk.targetHours}h` : ""}</div>
      </div>
      {(wkEvents || []).map((e) => (
        <div key={e.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.bg, border: `1px solid ${PRIO[e.priority] || C.brand}`, borderRadius: 8, padding: "3px 9px", marginBottom: 8, marginRight: 6, fontSize: 11.5 }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: PRIO[e.priority] || C.brand }} />
          <b>🏁 {e.name}</b> <span style={{ color: C.muted }}>· {e.priority}</span>
        </div>
      ))}
      {wk.focus && <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>{wk.focus}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5 }}>
        {(wk.days || []).map((d, di) => {
          const z = ZONES[d.intensity] || ZONES.rest;
          const active = selected && selected.week === wi && selected.day === di;
          const off = d.status === "off";
          const missed = d.status === "missed";
          const topColor = off ? C.faint : missed ? "#FB7185" : z.color;
          const label = off ? (/illness/i.test(d.title) ? "🤒 Off" : "✈ Off") : d.type === "rest" ? "Rest" : d.title;
          return (
            <button key={di} onClick={() => setSelected(active ? null : { week: wi, day: di })} className="daycard"
              style={{ textAlign: "left", background: active ? C.bg : off ? "rgba(90,107,115,0.12)" : "transparent", border: `1px solid ${active ? topColor : C.border}`, borderTop: `3px solid ${topColor}`, borderRadius: 7, padding: "7px 5px", cursor: "pointer", color: C.text, minHeight: 50, display: "flex", flexDirection: "column", gap: 2, overflow: "hidden", opacity: off ? 0.7 : 1 }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: missed ? "#FB7185" : C.text }}>{d.day}{missed ? " ✕" : ""}</span>
              <span style={{ fontSize: 9.5, color: C.muted, lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: missed ? "line-through" : "none" }}>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const PROG_ORDER = ["endurance", "tempo", "threshold", "vo2", "recovery", "strength"];

function ProgressionCard({ progression, ftpSuggestion, onBumpFtp }) {
  const p = progression || {};
  return (
    <Card>
      <Eyebrow>Form — progression levels</Eyebrow>
      <div style={{ color: C.muted, fontSize: 12.5, marginTop: 4, marginBottom: 12 }}>Per-zone fitness (1–10), moved by your ride feedback. Your plan leans into strong zones and eases the rest.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {PROG_ORDER.map((z) => {
          const zc = ZONES[z] || ZONES.rest; const lvl = p[z] ?? 5;
          return (
            <div key={z} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 78, fontSize: 12, color: C.muted }}>{zc.label}</div>
              <div style={{ flex: 1, height: 8, background: C.surfaceHi, borderRadius: 999, overflow: "hidden" }}>
                <div style={{ width: `${lvl * 10}%`, height: "100%", background: zc.color, borderRadius: 999 }} />
              </div>
              <div style={{ width: 34, textAlign: "right", fontFamily: C.mono, fontSize: 13, fontWeight: 700 }}>{lvl}</div>
            </div>
          );
        })}
      </div>
      {ftpSuggestion && (
        <div style={{ marginTop: 14, background: C.brandSoft, border: `1px solid ${C.brand}`, borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13 }}>Recent rides suggest your FTP may be <b style={{ color: C.brand }}>~{ftpSuggestion.suggested}W</b> ({ftpSuggestion.basis}).</div>
          <button onClick={() => onBumpFtp(ftpSuggestion.suggested)} className="primary" style={{ ...primaryBtn, width: "auto", padding: "8px 16px", fontSize: 13 }}>Update FTP</button>
        </div>
      )}
    </Card>
  );
}

const FB = { nailed: { label: "Nailed it", color: "#34D399" }, ok: { label: "Completed", color: "#A3E635" }, hard: { label: "Hard", color: "#FBBF24" }, missed: { label: "Missed", color: "#FB7185" } };

function FeedbackStrip({ s, onFeedback }) {
  if (s.feedback) {
    const f = FB[s.feedback] || {};
    return <div style={{ marginTop: 8, fontSize: 12, color: C.muted }}>How it went: <span style={{ color: f.color, fontWeight: 700 }}>{f.label}</span>{s.feedbackZone ? ` · ${s.feedbackZone}` : ""}</div>;
  }
  return (
    <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11.5, color: C.muted }}>How'd it go?</span>
      {Object.keys(FB).map((k) => (
        <button key={k} onClick={() => onFeedback(s.id, k)} className="ghost" style={{ ...ghostBtn, padding: "3px 9px", fontSize: 11.5, color: FB[k].color, borderColor: C.border }}>{FB[k].label}</button>
      ))}
    </div>
  );
}

function suggestFtpClient(sessions, profile) {
  const ftp = profile?.currentFTP;
  if (!ftp) return null;
  const cutoff = Date.now() - 35 * 86400000;
  let best = null;
  for (const s of sessions || []) {
    if (!s.avgPower || !s.durationSec) continue;
    const when = new Date(s.date || s.addedAt).getTime();
    if (when < cutoff) continue;
    if (s.durationSec >= 35 * 60 && s.avgPower >= ftp * 0.97) { if (!best || s.avgPower > best.avgPower) best = s; }
  }
  if (!best) return null;
  const suggested = Math.round(best.avgPower / 0.95);
  if (suggested <= ftp + 4) return null;
  return { suggested, basis: `held ${best.avgPower}W for ${Math.round(best.durationSec / 60)} min` };
}

const CAT_COLORS = {
  recovery: "#0EA5E9", endurance: "#10B981", tempo: "#65A30D", sweetspot: "#4D7C0F",
  threshold: "#F59E0B", vo2: "#EF4444", anaerobic: "#DB2777", sprint: "#9333EA", specialty: "#6366F1", test: "#0EA5E9",
};

function IntervalProfile({ steps }) {
  const total = steps.reduce((a, s) => a + s.durationSec, 0) || 1;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 46, marginTop: 12 }}>
      {steps.map((s, i) => {
        const p = s.powerHighPct || 160;
        const h = Math.max(8, Math.min(100, (p / 150) * 100));
        const w = Math.max(0.4, (s.durationSec / total) * 100);
        const col = s.intensity === "rest" ? C.faint : (s.intensity === "warmup" || s.intensity === "cooldown") ? C.muted : C.brand;
        return <div key={i} title={`${s.name} · ${Math.round(s.durationSec / 60) || "<1"}min`} style={{ width: `${w}%`, height: `${h}%`, background: col, borderRadius: "2px 2px 0 0" }} />;
      })}
    </div>
  );
}

function LibraryCard() {
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(null);
  const cats = CATEGORIES.filter((c) => LIBRARY.some((w) => w.cat === c.key));
  const list = filter === "all" ? LIBRARY : LIBRARY.filter((w) => w.cat === filter);
  const dl = (id) => {
    const a = document.createElement("a"); a.href = `/api/library/workout?id=${id}`; a.download = "";
    document.body.appendChild(a); a.click(); a.remove();
  };
  return (
    <Card>
      <Eyebrow>Workout library</Eyebrow>
      <div style={{ color: C.muted, fontSize: 12.5, marginTop: 4, marginBottom: 12 }}>Canonical power sessions, scaled to your FTP. Tap one to preview or send to your Garmin.</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {[{ key: "all", label: "All" }, ...cats].map((c) => (
          <button key={c.key} onClick={() => setFilter(c.key)} className="ghost"
            style={{ ...ghostBtn, padding: "4px 10px", fontSize: 12, ...(filter === c.key ? { borderColor: C.brand, color: C.text } : {}) }}>{c.label}</button>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {list.map((w) => {
          const col = CAT_COLORS[w.cat] || C.brand; const isOpen = open === w.id;
          return (
            <div key={w.id} style={{ background: C.bg, border: `1px solid ${isOpen ? col : C.border}`, borderLeft: `4px solid ${col}`, borderRadius: 10, padding: "10px 12px" }}>
              <div onClick={() => setOpen(isOpen ? null : w.id)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{w.name}</div>
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: C.mono }}>{CATEGORIES.find((c) => c.key === w.cat)?.label} · {w.durationMin}min · {w.tss} TSS</div>
                </div>
                <span style={{ color: C.muted, fontSize: 12 }}>{isOpen ? "▲" : "▼"}</span>
              </div>
              {isOpen && (
                <div>
                  <p style={{ fontSize: 13.5, lineHeight: 1.5, margin: "10px 0 0" }}>{w.description}</p>
                  <IntervalProfile steps={w.steps} />
                  <button onClick={() => dl(w.id)} className="ghost" style={{ ...ghostBtn, marginTop: 10, color: C.text, borderColor: C.brand }}>⬇ Garmin workout (.FIT) · {w.durationMin}min</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function PMCChart({ series, projection }) {
  const all = [...series, ...(projection?.series || [])];
  if (all.length < 2) return null;
  const W = 600, H = 150, pad = 8;
  const maxV = Math.max(...all.map((d) => Math.max(d.ctl, d.atl)), 10);
  const x = (i) => pad + (i / (all.length - 1)) * (W - 2 * pad);
  const y = (v) => H - pad - (v / maxV) * (H - 2 * pad);
  const ctlPts = series.map((d, i) => `${x(i)},${y(d.ctl)}`).join(" ");
  const atlPts = series.map((d, i) => `${x(i)},${y(d.atl)}`).join(" ");
  const area = `${x(0)},${H - pad} ${ctlPts} ${x(series.length - 1)},${H - pad}`;
  const off = series.length - 1;
  const projPts = projection ? [series[series.length - 1], ...projection.series].map((d, i) => `${x(off + i)},${y(d.ctl)}`).join(" ") : "";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none" style={{ display: "block", marginTop: 12, height: 150 }}>
      <polygon points={area} fill="rgba(99,102,241,0.12)" />
      <polyline points={ctlPts} fill="none" stroke={C.brand} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      {projPts && <polyline points={projPts} fill="none" stroke={C.brand} strokeWidth="2" strokeDasharray="5 4" opacity="0.7" vectorEffect="non-scaling-stroke" />}
      <polyline points={atlPts} fill="none" stroke="#FB7185" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function AnalyticsCard({ sessions, profile }) {
  const pmc = useMemo(() => computePMC(sessions, profile), [sessions, profile]);
  const [read, setRead] = useState("");
  const [loading, setLoading] = useState(false);

  if (pmc.empty) {
    return (
      <Card>
        <Eyebrow>Fitness · Fatigue · Form</Eyebrow>
        <div style={{ color: C.muted, fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>Log a few rides and your fitness, fatigue and form chart builds here — the picture that tells you when to push and when to back off.</div>
      </Card>
    );
  }
  const c = pmc.current;
  const fmt = (v) => (v > 0 ? `+${Math.round(v)}` : `${Math.round(v)}`);
  const getRead = async () => {
    setLoading(true); setRead("");
    try { const r = await fetch("/api/form", { method: "POST" }); const d = await jget(r); setRead(r.ok ? d.read : d.error || "Unavailable."); }
    catch { setRead("Unavailable — try again."); } finally { setLoading(false); }
  };
  const steepRamp = pmc.rampPerWeek > 8;
  return (
    <Card>
      <Eyebrow>Fitness · Fatigue · Form</Eyebrow>
      <div style={{ display: "flex", gap: 20, marginTop: 12, flexWrap: "wrap" }}>
        <Stat label="Fitness (CTL)" value={Math.round(c.ctl)} unit="" />
        <Stat label="Fatigue (ATL)" value={Math.round(c.atl)} unit="" color="#FB7185" />
        <Stat label="Form (TSB)" value={fmt(c.tsb)} unit="" color={pmc.status.color} />
      </div>
      <div style={{ fontSize: 13, marginTop: 8 }}><span style={{ color: pmc.status.color, fontWeight: 700 }}>{pmc.status.label}</span> <span style={{ color: C.muted }}>— {pmc.status.note}.</span></div>
      <PMCChart series={pmc.series} projection={pmc.projection} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: C.muted, marginTop: 6, flexWrap: "wrap", gap: 8 }}>
        <span><span style={{ color: C.brand }}>━</span> Fitness&nbsp;&nbsp;<span style={{ color: "#FB7185" }}>━</span> Fatigue&nbsp;&nbsp;<span style={{ color: C.brand }}>┄</span> projected</span>
        <span style={{ fontFamily: C.mono, color: steepRamp ? "#FBBF24" : C.muted }}>ramp {pmc.rampPerWeek > 0 ? "+" : ""}{pmc.rampPerWeek}/wk{steepRamp ? " ⚠ steep" : ""}</span>
      </div>
      {pmc.projection && pmc.daysToEvent != null && (
        <div style={{ marginTop: 10, background: C.surfaceHi, borderRadius: 10, padding: "10px 12px", fontSize: 13, lineHeight: 1.5 }}>
          Holding current load you'll reach <b style={{ color: C.brand }}>~{Math.round(pmc.projection.eventCtl)} fitness</b> on event day at form <b style={{ color: pmc.projection.eventTsb > 0 ? "#34D399" : "#FBBF24" }}>{fmt(pmc.projection.eventTsb)}</b> ({pmc.daysToEvent} days out). {pmc.projection.eventTsb < 5 ? "Ease the final 1–2 weeks so form swings positive and you arrive fresh." : "That's race-ready freshness — protect the taper."}
        </div>
      )}
      <button onClick={getRead} disabled={loading} className="ghost" style={{ ...ghostBtn, marginTop: 12, borderColor: C.brand, color: C.text }}>{loading ? "Reading…" : "Coach's read on my form"}</button>
      {read && <p style={{ lineHeight: 1.6, marginTop: 12, fontSize: 14.5 }}>{read}</p>}
    </Card>
  );
}

const EV_PRIO = { A: "#FB7185", B: "#FBBF24", C: "#A3E635" };
const EV_RATING = { strong: { label: "💪 Strong", color: "#34D399" }, solid: { label: "👍 Solid", color: "#A3E635" }, off: { label: "😐 Off-day", color: "#FBBF24" } };

function EventsCard({ events, setEvents, setError, scheduleRebuild }) {
  const [f, setF] = useState({ name: "", date: "", priority: "A" });
  const today = new Date().toISOString().slice(0, 10);
  const list = [...(events || [])].sort((a, b) => a.date.localeCompare(b.date));

  const add = async () => {
    if (!f.name.trim() || !f.date) return;
    const r = await fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const d = await jget(r); if (r.ok) { setEvents(d.events); setF({ name: "", date: "", priority: "A" }); scheduleRebuild?.(); } else setError(d.error);
  };
  const remove = async (id) => { const r = await fetch("/api/events", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); const d = await jget(r); if (r.ok) { setEvents(d.events); scheduleRebuild?.(); } };
  const rate = async (id, rating) => { const r = await fetch("/api/events", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, rating }) }); const d = await jget(r); if (r.ok) setEvents(d.events); };

  return (
    <Card>
      <Eyebrow>Events</Eyebrow>
      <div style={{ color: C.muted, fontSize: 12.5, marginTop: 4, marginBottom: 12 }}>Add your races (A = peak for it, B = sharpen, C = train through). The plan periodises around all of them — then keeps rolling.</div>

      {list.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {list.map((e) => {
            const past = e.date < today;
            const wo = Math.round((new Date(e.date) - Date.now()) / (7 * 86400000));
            return (
              <div key={e.id} style={{ background: C.bg, border: `1px solid ${C.border}`, borderLeft: `4px solid ${EV_PRIO[e.priority] || C.brand}`, borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{e.name} <span style={{ fontSize: 10.5, color: EV_PRIO[e.priority], fontWeight: 800 }}>{e.priority}</span></div>
                    <div style={{ fontSize: 11, color: C.muted, fontFamily: C.mono }}>{e.date} · {past ? "done" : `${wo} wk`}</div>
                  </div>
                  <button onClick={() => remove(e.id)} className="ghost" style={{ ...ghostBtn, padding: "4px 9px", fontSize: 12 }}>✕</button>
                </div>
                {past && (e.rating
                  ? <div style={{ marginTop: 8, fontSize: 12, color: EV_RATING[e.rating]?.color, fontWeight: 700 }}>{EV_RATING[e.rating]?.label}</div>
                  : <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><span style={{ fontSize: 11.5, color: C.muted }}>How'd it go?</span>{Object.keys(EV_RATING).map((k) => <button key={k} onClick={() => rate(e.id, k)} className="ghost" style={{ ...ghostBtn, padding: "3px 9px", fontSize: 11.5, color: EV_RATING[k].color }}>{EV_RATING[k].label}</button>)}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8 }}>
        <input style={{ ...input }} placeholder="Event name (e.g. County Champs)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input type="date" style={{ ...input, width: "auto" }} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        <select style={{ ...input, width: "auto" }} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
          <option value="A">A</option><option value="B">B</option><option value="C">C</option>
        </select>
      </div>
      <button onClick={add} className="ghost" style={{ ...ghostBtn, marginTop: 10, borderColor: C.brand, color: C.text }}>+ Add event</button>
      {list.length > 0 && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 10 }}>After changing events, hit <b>↻ Rebuild</b> on the plan to re-periodise around them.</div>}
    </Card>
  );
}

function AvailabilityCard({ availability, setAvailability, setError, scheduleRebuild }) {
  const [f, setF] = useState({ type: "holiday", start: "", end: "" });
  const list = [...(availability || [])].sort((a, b) => a.start.localeCompare(b.start));
  const add = async () => {
    if (!f.start || !f.end) return;
    const r = await fetch("/api/availability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const d = await jget(r); if (r.ok) { setAvailability(d.availability); setF({ type: "holiday", start: "", end: "" }); scheduleRebuild?.(); } else setError(d.error);
  };
  const remove = async (id) => { const r = await fetch("/api/availability", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); const d = await jget(r); if (r.ok) { setAvailability(d.availability); scheduleRebuild?.(); } };
  return (
    <Card>
      <Eyebrow>Time off</Eyebrow>
      <div style={{ color: C.muted, fontSize: 12.5, marginTop: 4, marginBottom: 12 }}>Add holidays or illness. The plan keeps those days clear and eases around them — deload into a holiday, rebuild gently after illness.</div>
      {list.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {list.map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{a.type === "illness" ? "🤒 Illness" : "✈ Holiday"}{a.notes ? ` · ${a.notes}` : ""}</div>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: C.mono }}>{a.start} → {a.end}</div>
              </div>
              <button onClick={() => remove(a.id)} className="ghost" style={{ ...ghostBtn, padding: "4px 9px", fontSize: 12 }}>✕</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: 8, alignItems: "center" }}>
        <select style={{ ...input, width: "auto" }} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          <option value="holiday">Holiday</option><option value="illness">Illness</option>
        </select>
        <input type="date" style={input} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
        <input type="date" style={input} value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
      </div>
      <button onClick={add} className="ghost" style={{ ...ghostBtn, marginTop: 10, borderColor: C.brand, color: C.text }}>+ Add time off</button>
      {list.length > 0 && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 10 }}>After adding, hit <b>↻ Rebuild</b> to re-plan around it.</div>}
    </Card>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function CalendarView({ weeks, events, curWeek, selected, setSelected }) {
  const today = new Date().toISOString().slice(0, 10);
  let lastMonth = null;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 6 }}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} style={{ fontSize: 10, color: C.muted, textAlign: "center", fontWeight: 700, letterSpacing: 0.5 }}>{d}</div>)}
      </div>
      {weeks.map((wk, wi) => {
        const ws = new Date(wk.startDate + "T00:00:00Z").getTime();
        const month = new Date(ws).getUTCMonth();
        const showMonth = month !== lastMonth; lastMonth = month;
        return (
          <div key={wi}>
            {showMonth && <div style={{ fontSize: 10.5, color: C.brand, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", margin: "12px 0 5px" }}>{MONTHS[month]} {new Date(ws).getUTCFullYear()}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
              {wk.days.map((d, di) => {
                const date = new Date(ws + di * 86400000).toISOString().slice(0, 10);
                const z = ZONES[d.intensity] || ZONES.rest;
                const off = d.status === "off", missed = d.status === "missed", isToday = date === today;
                const hasEvent = (events || []).some((e) => e.date === date);
                const active = selected && selected.week === wi && selected.day === di;
                const label = off ? "Off" : d.type === "rest" ? "" : d.type === "gym" ? "Gym" : d.title;
                return (
                  <button key={di} onClick={() => setSelected(active ? null : { week: wi, day: di })}
                    style={{ aspectRatio: "1 / 1", minHeight: 44, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 4, background: active ? C.surfaceHi : off ? "rgba(90,107,115,0.10)" : "transparent", border: `1px solid ${active ? z.color : isToday ? C.brand : C.border}`, borderRadius: 7, cursor: "pointer", color: C.text, overflow: "hidden", opacity: off ? 0.75 : 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: isToday ? C.brand : C.muted }}>{date.slice(8)}</span>
                      {hasEvent && <span style={{ fontSize: 9 }}>🏁</span>}
                    </div>
                    {d.type !== "rest" && !off && <span style={{ height: 4, borderRadius: 2, background: missed ? "#FB7185" : z.color }} />}
                    <span style={{ fontSize: 8.5, color: missed ? "#FB7185" : C.muted, lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: missed ? "line-through" : "none" }}>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
