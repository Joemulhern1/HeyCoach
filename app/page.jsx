"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./globals.css";
import { LIBRARY, CATEGORIES } from "../lib/library.js";
import { computePMC, assessLoad } from "../lib/analytics.js";
import { dailyTargets, classifyDay, fuelling, DAYTYPE_LABEL, dailyAdvice } from "../lib/nutrition.js";
import { estimateFtp } from "../lib/ftp.js";
import { feelSwap, ARCHETYPES, ARCHETYPE_KEYS } from "../lib/periodize.js";
import { generateWorkout } from "../lib/generate.js";

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
const input = { background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 14, padding: "11px 14px", fontSize: 15, outline: "none", width: "100%" };
const primaryBtn = { background: "#111827", color: "#fff", border: "none", borderRadius: 999, padding: "14px 0", fontSize: 15, fontWeight: 600, cursor: "pointer", width: "100%", letterSpacing: 0.1, transition: "transform .12s ease, filter .12s ease" };
const ghostBtn = { background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 999, padding: "8px 15px", fontSize: 13, cursor: "pointer", fontWeight: 600, transition: "background .12s ease, border-color .12s ease, transform .12s ease" };

// Parse a response safely — if the server returns non-JSON (timeout/crash page),
// surface a readable message instead of a cryptic "Unexpected token" error.
async function jget(r) {
  const t = await r.text();
  try { return JSON.parse(t); }
  catch { return { error: r.status === 504 || /timed out|timeout/i.test(t) ? "That took too long — please try again." : (t || "").replace(/<[^>]*>/g, "").trim().slice(0, 140) || "Server error — try again." }; }
}

const Eyebrow = ({ children }) => <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.muted, fontWeight: 700 }}>{children}</div>;
const Card = ({ children, style, onClick }) => <div onClick={onClick} style={{ background: C.surface, borderRadius: 22, padding: 20, boxShadow: "0 1px 2px rgba(17,24,39,.04), 0 6px 20px rgba(17,24,39,.05)", ...style }}>{children}</div>;
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
  const [coachChat, setCoachChat] = useState([]);
  const [nutritionPlan, setNutritionPlan] = useState(null);
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
      if (s.coachChat) setCoachChat(s.coachChat);
      if (s.nutritionPlan) setNutritionPlan(s.nutritionPlan);
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
        nav={nav} setNav={setNav} me={me} coachChat={coachChat} setCoachChat={setCoachChat} nutritionPlan={nutritionPlan} setNutritionPlan={setNutritionPlan}
      />
    </AppShell>
  );
}

const Logo = () => <span style={{ width: 22, height: 22, borderRadius: 7, background: "#111827", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 900, flexShrink: 0 }}>H</span>;
const ErrBanner = ({ children }) => <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C", borderRadius: 16, padding: "10px 14px", marginBottom: 16, fontSize: 14 }}>{children}</div>;

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

function stepsTss(steps) {
  let t = 0; for (const s of (steps || [])) { const mid = ((s.powerLowPct + s.powerHighPct) / 2) / 100; t += (s.durationSec / 3600) * mid * mid * 100; } return Math.round(t);
}
function mainSetText(steps, ftp) {
  const work = (steps || []).filter((s) => s.intensity === "active" && s.powerHighPct > 78);
  if (!work.length) return null;
  const key = (s) => `${s.durationSec}-${s.powerLowPct}-${s.powerHighPct}`;
  const counts = {}; work.forEach((s) => { counts[key(s)] = (counts[key(s)] || 0) + 1; });
  const topKey = Object.keys(counts).reduce((a, b) => (counts[b] > counts[a] ? b : a));
  const rep = work.find((s) => key(s) === topKey); const n = counts[topKey];
  const dur = rep.durationSec >= 60 ? `${Math.round(rep.durationSec / 60)}min` : `${rep.durationSec}s`;
  const watts = ftp ? ` ≈ ${Math.round(ftp * rep.powerLowPct / 100)}–${Math.round(ftp * rep.powerHighPct / 100)}W` : "";
  return `${n} × ${dur} @ ${rep.powerLowPct}–${rep.powerHighPct}% FTP${watts}`;
}

function lastSessionRemark(s, tss) {
  const t = tss ? ` — ${tss} TSS in the bank` : "";
  switch (s.feedback) {
    case "nailed": return `You nailed ${s.name}${t}. That's exactly the kind of session that lifts your FTP.`;
    case "ok": return `Solid work on ${s.name}${tss ? ` (${tss} TSS)` : ""} — right on track.`;
    case "hard": return `${s.name} felt hard${tss ? ` (${tss} TSS)` : ""} — useful signal. If the next one feels flat too, we'll ease off.`;
    case "missed": return `You marked ${s.name} as missed — no drama, we carry on.`;
    default: return `Logged: ${s.name}${tss ? ` — ${tss} TSS` : ""}. Rate how it felt so I can fine-tune your plan.`;
  }
}


const Ic = ({ d, size = 17 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>{d}</svg>
);
const ICONS = {
  today: <Ic d={<><path d="M3.5 9.5 10 3.5l6.5 6V16a1 1 0 0 1-1 1h-4v-4.5h-3V17h-4a1 1 0 0 1-1-1V9.5Z" /></>} />,
  calendar: <Ic d={<><rect x="3" y="4.5" width="14" height="12" rx="1.5" /><path d="M3 8.5h14M7 3v3M13 3v3" /></>} />,
  workouts: <Ic d={<path d="M11 2.5 5 11.5h4L8 17.5l6-9h-4l1-6Z" />} />,
  analytics: <Ic d={<><path d="M3 16.5h14" /><path d="M4.5 13.5 8.5 9l3 3 4-5.5" /></>} />,
  nutrition: <Ic d={<><path d="M3.5 10.5h13a6.5 6.5 0 0 1-13 0Z" /><path d="M7 7.5c0-1.2 1-1.4 1-2.6M11 7.5c0-1.2 1-1.4 1-2.6" /></>} />,
  activity: <Ic d={<><path d="M4 5.5h12M4 10h12M4 14.5h8" /></>} />,
  coach: <Ic d={<path d="M4 4.5h12a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H9l-3.5 3V14H4a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z" />} />,
  admin: <Ic d={<><circle cx="10" cy="10" r="2.6" /><path d="M10 3v2.2M10 14.8V17M3 10h2.2M14.8 10H17M5.2 5.2l1.5 1.5M13.3 13.3l1.5 1.5M14.8 5.2l-1.5 1.5M6.7 13.3l-1.5 1.5" /></>} />,
  logout: <Ic d={<><path d="M12.5 6.5V4.5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h6.5a1 1 0 0 0 1-1v-2" /><path d="M8.5 10H17M14.5 7.5 17 10l-2.5 2.5" /></>} />,
  race: <Ic size={12} d={<path d="M5 3v14M5 3.5h9l-2.5 3L14 9.5H5" fill="currentColor" strokeWidth="1.4" />} />,
};

const NAV = [
  { label: "Train" },
  { id: "today", label: "Today", ic: "today" },
  { id: "calendar", label: "Calendar", ic: "calendar" },
  { id: "workouts", label: "Workouts", ic: "workouts" },
  { label: "Track" },
  { id: "analytics", label: "Analytics", ic: "analytics" },
  { id: "nutrition", label: "Nutrition", ic: "nutrition" },
  { id: "activity", label: "Activity", ic: "activity" },
  { label: "Ask" },
  { id: "coach", label: "Coach", ic: "coach" },
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
          ? <button key={n.id} className={"navitem" + (nav === n.id ? " active" : "")} onClick={() => go(n.id)}><span className="ic">{ICONS[n.ic]}</span>{n.label}</button>
          : <div key={"s" + i} className="navlabel">{n.label}</div>
        )}
        <div className="sidefoot">
          {me?.role === "admin" && <a href="/admin" className="navitem"><span className="ic">{ICONS.admin}</span>Admin</a>}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px" }}>
            <span style={{ width: 30, height: 30, borderRadius: "50%", background: C.brandSoft, color: C.brand, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{(me?.displayName || me?.username || "?").slice(0, 1).toUpperCase()}</span>
            <div style={{ minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{me?.displayName || me?.username || "Athlete"}</div></div>
          </div>
          <button className="navitem" onClick={logout}><span className="ic">{ICONS.logout}</span>Log out</button>
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
        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="The rider you want to become">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ARCHETYPE_KEYS.map((k) => {
                const active = (profile.riderType || "gc") === k;
                return <button key={k} type="button" onClick={() => upd("riderType", k)} className="ghost" style={{ ...ghostBtn, padding: "8px 14px", fontSize: 13, ...(active ? { borderColor: C.brand, color: C.brand, background: C.brandSoft } : {}) }}>{ARCHETYPES[k].label}</button>;
              })}
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 7, lineHeight: 1.5 }}>All your training builds toward {ARCHETYPES[profile.riderType || "gc"].note}. Change this any time and rebuild to re-shape the plan.</div>
          </Field>
        </div>
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
      <div style={{ marginTop: 14, background: C.brandSoft, border: `1px solid ${C.brand}`, borderRadius: 16, padding: "10px 14px", fontSize: 13, color: C.text }}>
        Target power-to-weight: <span style={{ fontFamily: C.mono, color: C.brand, fontWeight: 700 }}>{projWkg} W/kg</span> at {profile.targetFTP}W / {profile.targetWeightKg}kg
      </div>
      <div style={{ marginTop: 18 }}>
        <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Your week — what each day is for, and how much time you have</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          {DAYS.map((d) => {
            const type = profile.schedule[d];
            const hrs = Number(profile.dayHours?.[d]) || 0;
            const setType = (t) => setProfile((p) => ({ ...p, schedule: { ...p.schedule, [d]: t } }));
            const setHrs = (v) => setProfile((p) => ({ ...p, dayHours: { ...(p.dayHours || {}), [d]: Number(v) } }));
            const fmtH = (h) => h === 0 ? "Auto" : (h >= 1 ? `${Math.floor(h)}h${h % 1 ? String(Math.round((h % 1) * 60)).padStart(2, "0") : ""}` : `${Math.round(h * 60)}min`);
            return (
              <div key={d} style={{ display: "flex", alignItems: "center", gap: 10, background: C.surface, border: `1px solid ${C.border}`, borderLeft: `3px solid ${typeColor(type)}`, borderRadius: 14, padding: "8px 10px" }}>
                <div style={{ width: 34, fontSize: 12.5, fontWeight: 700 }}>{d}</div>
                <div style={{ display: "flex", gap: 4 }}>
                  {["ride", "gym", "rest"].map((t) => (
                    <button key={t} type="button" onClick={() => setType(t)} className="ghost" style={{ ...ghostBtn, padding: "3px 9px", fontSize: 11, textTransform: "capitalize", ...(type === t ? { borderColor: typeColor(t), color: C.text, fontWeight: 700 } : {}) }}>{t}</button>
                  ))}
                </div>
                {type === "ride" ? (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <input type="range" min="0" max="4" step="0.25" value={hrs} onChange={(e) => setHrs(e.target.value)} style={{ flex: 1, accentColor: "var(--brand)", minWidth: 0 }} />
                    <span style={{ fontSize: 11.5, fontFamily: C.mono, fontWeight: 700, color: hrs ? C.brand : C.faint, width: 42, textAlign: "right" }}>{fmtH(hrs)}</span>
                  </div>
                ) : (
                  <div style={{ flex: 1, fontSize: 11, color: C.faint, textAlign: "right" }}>{type === "gym" ? "~45min strength" : "recovery"}</div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 7, lineHeight: 1.5 }}>Slide to cap a ride day's time — sessions fit the slot, protecting the intervals. "Auto" lets the plan choose.</div>
      </div>
      <button className="primary" onClick={onBuild} disabled={busy} style={{ ...primaryBtn, marginTop: 24, opacity: busy ? 0.6 : 1 }}>{busy ? "Building…" : "Build my week →"}</button>
    </div>
  );
}

function Dashboard({ profile, block, setBlock, sessions, weights, strava, busy, onEdit, onRegenerate, setSessions, setWeights, setError, saveProfile, progression, setProgression, events, setEvents, availability, setAvailability, scheduleRebuild, nav, setNav, me, coachChat, setCoachChat, nutritionPlan, setNutritionPlan }) {
  const [selected, setSelected] = useState(null); // { week, day }
  const [q, setQ] = useState(""); const [asking, setAsking] = useState(false);
  const chat = coachChat, setChat = setCoachChat;
  const chatEndRef = useRef(null);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [chat, asking]);
  const [uploading, setUploading] = useState(false); const [shotting, setShotting] = useState(false);
  const [showManual, setShowManual] = useState(false); const [syncing, setSyncing] = useState(false);
  const [preparing, setPreparing] = useState(null);
  const [kg, setKg] = useState("");
  const fileRef = useRef(null); const shotRef = useRef(null);
  const todayFileRef = useRef(null); const todayShotRef = useRef(null);
  const curWeek = block ? currentWeekIdx(block) : 0;
  const sel = selected && block ? block.weeks[selected.week]?.days?.[selected.day] : null;
  const selZone = sel ? ZONES[sel.intensity] || ZONES.rest : null;

  const sendCoach = async () => {
    const text = q.trim(); if (!text || asking) return;
    const prev = chat;
    setChat([...chat, { role: "user", content: text }]); setQ(""); setAsking(true);
    try {
      const r = await fetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text }) });
      const d = await jget(r);
      if (r.ok) setChat(d.chat); else { setChat(prev); setQ(text); setError(d.error || "Coach is unavailable."); }
    } catch { setChat(prev); setQ(text); setError("Coach is unavailable — try again."); } finally { setAsking(false); }
  };
  const clearCoach = async () => {
    if (!chat.length) return;
    setChat([]);
    try { await fetch("/api/coach", { method: "DELETE" }); } catch {}
  };
  const [health, setHealth] = useState(null);
  const testConn = async () => {
    setHealth({ testing: true });
    try { const r = await fetch("/api/coach/health"); setHealth(await r.json()); }
    catch { setHealth({ ok: false, error: "Couldn't reach the server." }); }
  };
  const SUGG_LABEL = { ease_week: "Ease this week", rest_today: "Make today a rest day" };
  const [propDismissed, setPropDismissed] = useState(-1);
  const [loadDismissed, setLoadDismissed] = useState(false);
  const [ftpDismissed, setFtpDismissed] = useState(false);
  const applyFtp = (v) => { saveProfile({ ...profile, currentFTP: v }); setFtpDismissed(true); };
  const applyCoach = async (arg) => {
    setError("");
    const body = typeof arg === "string" ? { type: arg } : arg;
    try {
      const r = await fetch("/api/coach/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await jget(r); if (r.ok) { setBlock(d.block); if (d.chat) setChat(d.chat); setLoadDismissed(true); } else setError(d.error || "Couldn't apply that.");
    } catch { setError("Couldn't apply that — try again."); }
  };
  const [stravaUrl, setStravaUrl] = useState("");
  const [stravaBusy, setStravaBusy] = useState(false);
  const [stravaNote, setStravaNote] = useState("");
  const [lastScore, setLastScore] = useState(null);
  const analyzeStrava = async () => {
    if (!stravaUrl.trim() || stravaBusy) return;
    setStravaBusy(true); setStravaNote(""); setError("");
    try {
      const r = await fetch("/api/strava/activity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: stravaUrl.trim() }) });
      const d = await jget(r);
      if (r.ok) { setSessions(d.sessions); setStravaNote(d.note); setStravaUrl(""); } else setStravaNote(d.error || "Couldn't analyse that link.");
    } catch { setStravaNote("Couldn't analyse that link — try again."); } finally { setStravaBusy(false); }
  };
  const stravaPasteBox = (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input style={{ ...input, flex: 1, fontSize: 13.5 }} placeholder="Paste a Strava activity link to analyse…" value={stravaUrl} onChange={(e) => setStravaUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && analyzeStrava()} />
        <button onClick={analyzeStrava} disabled={stravaBusy} className="primary" style={{ ...primaryBtn, width: "auto", padding: "0 18px", fontSize: 13.5, opacity: stravaBusy ? 0.6 : 1 }}>{stravaBusy ? "Analysing…" : "Analyse"}</button>
      </div>
      {stravaNote && <div style={{ fontSize: 13, color: C.text, background: C.surfaceHi, borderRadius: 14, padding: "9px 12px", marginTop: 8, lineHeight: 1.5 }}>{stravaNote}</div>}
      {!strava.connected && <div style={{ fontSize: 11.5, color: C.faint, marginTop: 6 }}>Requires your Strava connection{strava.configured ? " — connect it below" : " (Strava keys not configured on this deployment)"}.</div>}
    </div>
  );
  const [genMealsBusy, setGenMealsBusy] = useState(false);
  const genMeals = async () => {
    setGenMealsBusy(true); setError("");
    try {
      const r = await fetch("/api/nutrition", { method: "POST" });
      const d = await jget(r); if (r.ok) setNutritionPlan(d.plan); else setError(d.error || "Couldn't generate meals.");
    } catch { setError("Couldn't generate meals — try again."); } finally { setGenMealsBusy(false); }
  };

  const uploadFiles = async (e) => {
    const files = [...(e.target.files || [])]; if (!files.length) return;
    setUploading(true); setError("");
    try {
      const fd = new FormData(); files.forEach((f) => fd.append("files", f));
      const r = await fetch("/api/sessions", { method: "POST", body: fd });
      const d = await jget(r); if (!r.ok) throw new Error(d.error || "Upload failed.");
      setSessions(d.sessions); if (d.score) { setLastScore(d.score); setStravaNote(`${d.score.score}/10 — ${d.score.verdict}${d.score.detail ? ` (${d.score.detail})` : ""}`); } if (d.errors?.length) setError(d.errors.join(" · "));
    } catch (err) { setError(err.message); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const uploadShot = async (e) => {
    const files = [...(e.target.files || [])]; if (!files.length) return;
    setShotting(true); setError(""); setStravaNote("");
    try {
      const fd = new FormData();
      files.slice(0, 6).forEach((f) => fd.append("image", f));
      const r = await fetch("/api/sessions/screenshot", { method: "POST", body: fd });
      const d = await jget(r); if (!r.ok) throw new Error(d.error || "Couldn't read screenshot.");
      setSessions(d.sessions);
      const s = d.session;
      const bits = [];
      if (s?.durationSec) bits.push(`${Math.round(s.durationSec / 60)}min`);
      if (s?.avgPower) bits.push(`${s.avgPower}W avg`);
      if (s?.best20) bits.push(`best 20-min ${s.best20}W`);
      let msg = `Read ${files.length > 1 ? files.length + " screenshots" : "your screenshot"} → "${s?.name || "ride"}"${bits.length ? " — " + bits.join(", ") : ""}.`;
      if (d.score) msg = `${d.score.score}/10 — ${d.score.verdict}${d.score.detail ? ` (${d.score.detail})` : ""}`;
      if (d.ftpRec?.suggestion) msg += ` Your power suggests FTP ${d.ftpRec.from} → ${d.ftpRec.suggestion}W — check the Today screen to apply.`;
      setStravaNote(msg);
      if (d.score) setLastScore(d.score);
    } catch (err) { setError(err.message); } finally { setShotting(false); if (shotRef.current) shotRef.current.value = ""; if (todayShotRef.current) todayShotRef.current.value = ""; }
  };

  const addManual = async (body) => {
    const r = await fetch("/api/sessions/manual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await jget(r); if (r.ok) { setSessions(d.sessions); setShowManual(false); if (d.score) { setLastScore(d.score); setStravaNote(`${d.score.score}/10 — ${d.score.verdict}${d.score.detail ? ` (${d.score.detail})` : ""}`); } }
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

  const downloadWorkout = (w, d, fmt = "fit") => {
    const a = document.createElement("a"); a.href = `/api/workout?week=${w}&day=${d}&fmt=${fmt}`; a.download = "";
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
  const setWeekHours = async (weekStart, hours) => {
    setError("");
    const r = await fetch("/api/week/hours", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weekStart, hours }) });
    const d = await jget(r); if (r.ok) setBlock(d.block); else setError(d.error);
  };
  const [feelMsg, setFeelMsg] = useState(null);
  const applyFeel = async (feel) => {
    setFeelMsg(null);
    if (feel === "ok") { setFeelMsg("Grand — today stays as planned."); return; }
    if (!block || !todayPos) { setFeelMsg("No session scheduled today to shuffle."); return; }
    const wk = block.weeks[todayPos.week];
    const sw = feelSwap(wk, todayPos.day, feel);
    if (!sw) { setFeelMsg(feel === "fresh" ? "Today's already your hardest session this week — go for it." : "Today's already an easy one — ideal for a tired day."); return; }
    await dayAction({ weekIndex: todayPos.week, dayIndex: todayPos.day, targetDayIndex: sw.targetDi, action: "swap" });
    setFeelMsg(`Done — today is now ${sw.to}; ${sw.from} moves to ${sw.targetDay}.`);
  };

  const todayIso = new Date().toISOString().slice(0, 10);
  const isoFromWeek = (start, di) => new Date(new Date(start + "T00:00:00Z").getTime() + di * 86400000).toISOString().slice(0, 10);
  let today = null, todayPos = null;
  if (block) block.weeks.forEach((w, wi) => w.days.forEach((d, di) => { if ((d.date || isoFromWeek(w.startDate, di)) === todayIso) { today = d; todayPos = { week: wi, day: di }; } }));
  const tz = today ? (ZONES[today.intensity] || ZONES.rest) : null;
  const todayType = classifyDay(today);
  const nutTargets = dailyTargets(profile, weights);
  const tnut = nutTargets[todayType] || nutTargets.rest;
  const todayPmc = computePMC(sessions, profile);
  const todayTsb = todayPmc && !todayPmc.empty ? todayPmc.current.tsb : null;
  const advice = dailyAdvice(todayType, todayTsb, today ? today.title : null);
  const loadRec = block ? assessLoad(todayPmc) : null;
  const ftpRec = estimateFtp(sessions, profile);
  const lastSession = [...(sessions || [])].sort((a, b) => new Date(b.date || b.addedAt) - new Date(a.date || a.addedAt))[0];
  const tssOf = (s) => (s?.avgPower && profile?.currentFTP && s?.durationSec) ? Math.round((s.durationSec * s.avgPower * (s.avgPower / profile.currentFTP)) / (profile.currentFTP * 3600) * 100) : null;

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
          <button onClick={() => shotRef.current?.click()} className="ghost" style={ghostBtn} disabled={shotting}>{shotting ? "Reading…" : "Log screenshots"}</button>
          <button onClick={() => fileRef.current?.click()} className="ghost" style={ghostBtn} disabled={uploading}>{uploading ? "Reading…" : "Log ride file"}</button>
          <button onClick={() => setShowManual((v) => !v)} className="ghost" style={ghostBtn}>Log manually</button>
          {strava.configured && (strava.connected
            ? <button onClick={syncStrava} className="ghost" style={ghostBtn} disabled={syncing}>{syncing ? "Syncing…" : "Sync Strava"}</button>
            : <a href="/api/strava/connect" className="ghost" style={{ ...ghostBtn, textDecoration: "none" }}>Connect Strava</a>)}
          <input ref={shotRef} type="file" accept="image/*" multiple onChange={uploadShot} style={{ display: "none" }} />
          <input ref={fileRef} type="file" accept=".fit,.tcx,.gpx" multiple onChange={uploadFiles} style={{ display: "none" }} />
        </div>
      </div>
      {showManual && <ManualForm onAdd={addManual} onCancel={() => setShowManual(false)} />}
      {stravaPasteBox}
      {strava.connected && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 12.5, color: C.muted }}>
          <input type="checkbox" checked={!!profile.useStravaForCoaching} onChange={(e) => saveProfile({ ...profile, useStravaForCoaching: e.target.checked })} />
          Use Strava activities for AI coaching (otherwise they're log-only — see Strava's API terms)
        </label>
      )}
      {sessions.length > 0 ? (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          {sessions.slice(0, 10).map((s) => (
            <div key={s.id} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 16, padding: "10px 12px" }}>
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
        <Head title={`${(h=>h<12?"Good morning":h<18?"Good afternoon":"Good evening")(new Date().getHours())}${me?.displayName || me?.username ? ", " + (me.displayName || me.username) : ""}`} sub={block?.riderLabel ? `Training you as a ${block.riderLabel}.` : "Here's where you stand today."} />
        <GlanceStrip profile={profile} weights={weights} events={events} pmc={todayPmc} />
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
                {today.steps?.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                      <Metric v={`${stepsTss(today.steps)}`} l="TSS" />
                      {mainSetText(today.steps, profile?.currentFTP) && <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 10.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Main set</div><div style={{ fontSize: 13.5, fontWeight: 700, fontFamily: C.mono }}>{mainSetText(today.steps, profile.currentFTP)}</div></div>}
                    </div>
                    <IntervalProfile steps={today.steps} />
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  {today.type === "ride" && today.steps?.length > 0 && <>
                    <button onClick={() => downloadWorkout(todayPos.week, todayPos.day, "fit")} className="ghost" style={ghostBtn}>Garmin (.FIT)</button>
                    <button onClick={() => downloadWorkout(todayPos.week, todayPos.day, "zwo")} className="ghost" style={ghostBtn}>Zwift (.ZWO)</button>
                  </>}
                  <button onClick={() => { setSelected(todayPos); setNav("calendar"); }} className="ghost" style={ghostBtn}>Open in calendar →</button>
                </div>
                <div style={{ marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                  <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 8 }}>Done your ride? Log it and I'll adapt:</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => todayShotRef.current?.click()} className="ghost" style={ghostBtn} disabled={shotting}>{shotting ? "Reading…" : "Log screenshots"}</button>
                    <button onClick={() => todayFileRef.current?.click()} className="ghost" style={ghostBtn} disabled={uploading}>{uploading ? "Reading…" : "Log ride file"}</button>
                  </div>
                  <input ref={todayShotRef} type="file" accept="image/*" multiple onChange={uploadShot} style={{ display: "none" }} />
                  <input ref={todayFileRef} type="file" accept=".fit,.tcx,.gpx" multiple onChange={uploadFiles} style={{ display: "none" }} />
                  {stravaPasteBox}
                </div>
              </div>
            ) : <p style={{ color: C.muted, marginTop: 8, marginBottom: 0 }}>Nothing scheduled today — enjoy the rest.</p>}
          </Card>
        ) : buildPrompt}

        <Card style={{ borderLeft: `4px solid ${C.brand}`, background: C.brandSoft }}>
          <Eyebrow>Coach's advice</Eyebrow>
          <p style={{ lineHeight: 1.6, margin: "8px 0 0", fontSize: 15 }}>{advice}</p>
        </Card>

        {block && today && (
          <Card>
            <Eyebrow>How do you feel today?</Eyebrow>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {[["fresh", "Fresh"], ["ok", "Normal"], ["tired", "Tired"]].map(([k, l]) => (
                <button key={k} onClick={() => applyFeel(k)} className="ghost" style={{ ...ghostBtn, fontSize: 13.5, padding: "8px 14px" }}>{l}</button>
              ))}
            </div>
            {feelMsg && <p style={{ fontSize: 13.5, color: C.text, margin: "10px 0 0", lineHeight: 1.5 }}>{feelMsg}</p>}
            <div style={{ fontSize: 11.5, color: C.faint, marginTop: 8 }}>Fresh swaps in this week's hardest session; Tired swaps in an easy one.</div>
          </Card>
        )}

        {loadRec && !loadDismissed && (
          <Card style={{ borderLeft: "4px solid #EF4444" }}>
            <Eyebrow>Adaptive check</Eyebrow>
            <p style={{ lineHeight: 1.6, margin: "8px 0 0", fontSize: 15 }}>{loadRec.headline}</p>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={() => applyCoach(loadRec.action)} className="primary" style={{ ...primaryBtn, width: "auto", padding: "8px 16px", fontSize: 13 }}>✓ Ease this week</button>
              <button onClick={() => setLoadDismissed(true)} className="ghost" style={{ ...ghostBtn, fontSize: 13 }}>Not now</button>
            </div>
          </Card>
        )}

        {ftpRec?.suggestion && !ftpDismissed && (
          <Card style={{ borderLeft: "4px solid #10B981" }}>
            <Eyebrow>FTP detection</Eyebrow>
            <p style={{ lineHeight: 1.6, margin: "8px 0 0", fontSize: 15 }}>
              Your rides suggest a new FTP: <b>{ftpRec.from}W → <span style={{ color: "#10B981" }}>{ftpRec.suggestion}W</span></b> ({ftpRec.deltaW > 0 ? "+" : ""}{ftpRec.deltaW}W), from {ftpRec.basis}. Updating rescales every upcoming workout and export.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={() => applyFtp(ftpRec.suggestion)} className="primary" style={{ ...primaryBtn, width: "auto", padding: "8px 16px", fontSize: 13 }}>✓ Update FTP to {ftpRec.suggestion}W</button>
              <button onClick={() => setFtpDismissed(true)} className="ghost" style={{ ...ghostBtn, fontSize: 13 }}>Not now</button>
            </div>
          </Card>
        )}
        {ftpRec?.needTest && !ftpDismissed && (
          <Card style={{ borderLeft: `4px solid ${C.brand}` }}>
            <Eyebrow>FTP check</Eyebrow>
            <p style={{ lineHeight: 1.6, margin: "8px 0 0", fontSize: 15 }}>I haven't seen a hard enough effort to read your FTP lately. A quick ramp or 20-min test keeps every workout target accurate.</p>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={() => setNav("workouts")} className="primary" style={{ ...primaryBtn, width: "auto", padding: "8px 16px", fontSize: 13 }}>See test workouts →</button>
              <button onClick={() => setFtpDismissed(true)} className="ghost" style={{ ...ghostBtn, fontSize: 13 }}>Not now</button>
            </div>
          </Card>
        )}

        {lastSession && (
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <Eyebrow>Last session</Eyebrow>
                <div style={{ fontSize: 16, fontWeight: 800, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lastSession.name}</div>
                <div style={{ fontSize: 11.5, color: C.muted, fontFamily: C.mono }}>{(lastSession.date || lastSession.addedAt || "").slice(0, 10)} · {lastSession.source}</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {tssOf(lastSession) != null && <Metric v={tssOf(lastSession)} l="TSS" />}
                <Metric v={fmtMins(lastSession.durationSec)} l="time" />
                {lastSession.avgPower != null && <Metric v={`${lastSession.avgPower}W`} l="avg" />}
              </div>
            </div>
            {lastSession.score != null && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, background: C.surfaceHi, borderRadius: 18, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 1, flexShrink: 0 }}>
                  <span style={{ fontSize: 30, fontWeight: 800, fontFamily: C.mono, color: lastSession.score >= 7 ? "#059669" : lastSession.score >= 5 ? C.brand : "#D97706", lineHeight: 1 }}>{lastSession.score}</span>
                  <span style={{ fontSize: 14, color: C.faint, fontWeight: 700 }}>/10</span>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, lineHeight: 1.45, color: C.text }}>{lastSession.scoreVerdict}</div>
                  {lastSession.scoreDetail && <div style={{ fontSize: 11.5, color: C.muted, fontFamily: C.mono, marginTop: 2 }}>{lastSession.scoreDetail}</div>}
                </div>
              </div>
            )}
            <p style={{ lineHeight: 1.6, margin: "12px 0 0", fontSize: 14.5 }}>{lastSessionRemark(lastSession, tssOf(lastSession))}</p>
            {!lastSession.feedback ? (
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12.5, color: C.muted }}>How'd it go?</span>
                {Object.keys(FB).map((k) => (
                  <button key={k} onClick={() => sendFeedback(lastSession.id, k)} className="ghost" style={{ ...ghostBtn, padding: "5px 11px", fontSize: 12.5, color: FB[k].color, borderColor: C.border }}>{FB[k].label}</button>
                ))}
              </div>
            ) : (
              <div style={{ marginTop: 10, fontSize: 12.5, color: C.muted }}>How it went: <span style={{ color: (FB[lastSession.feedback] || {}).color, fontWeight: 700 }}>{(FB[lastSession.feedback] || {}).label}</span></div>
            )}
          </Card>
        )}

        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Eyebrow>Today's fuel · {DAYTYPE_LABEL[todayType].toLowerCase()}</Eyebrow>
            <button onClick={() => setNav("nutrition")} className="ghost" style={{ ...ghostBtn, padding: "5px 11px", fontSize: 12.5 }}>Meal plan →</button>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <Stat label="Calories" value={tnut.kcal} unit="kcal" />
            <Stat label="Carbs" value={tnut.carbsG} unit="g" color={ZONES.endurance.color} />
            <Stat label="Protein" value={tnut.proteinG} unit="g" color={C.brand} />
            <Stat label="Fat" value={tnut.fatG} unit="g" color={ZONES.threshold.color} />
          </div>
          <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.5, margin: "12px 0 0" }}>On-bike fuelling: <b style={{ color: C.text }}>{fuelling(todayType).carbsPerHour}</b>. {fuelling(todayType).post}</p>
        </Card>

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
            downloadWorkout={downloadWorkout} prepareWeek={prepareWeek} preparing={preparing} events={events} dayAction={dayAction} onSetHours={setWeekHours}
          />
        ) : buildPrompt}
      </>)}

      {nav === "workouts" && (<>
        <Head title="Workouts" sub="Generate a fresh session on demand, or browse the library — all export to Garmin & Zwift." />
        <WorkoutGenerator />
        <LibraryCard riderType={profile?.riderType || "gc"} />
      </>)}

      {nav === "analytics" && (<>
        <Head title="Analytics" sub="Fitness, fatigue and form — plus your zone progression." />
        <AnalyticsCard sessions={sessions} profile={profile} />
        {block && <ProgressionCard progression={progression} ftpSuggestion={ftpSuggestion} onBumpFtp={bumpFtp} />}
        <WeightCard profile={profile} weights={weights} kg={kg} setKg={setKg} logWeight={logWeight} removeWeight={removeWeight} />
      </>)}

      {nav === "nutrition" && (<>
        <Head title="Nutrition" sub="Macros that match your training, plus family-friendly Lidl meal ideas." />
        <NutritionView profile={profile} weights={weights} today={today} plan={nutritionPlan} onGenerate={genMeals} busy={genMealsBusy} />
        <WeightCard profile={profile} weights={weights} kg={kg} setKg={setKg} logWeight={logWeight} removeWeight={removeWeight} />
      </>)}

      {nav === "activity" && (<>
        <Head title="Activity" sub="Log your rides — the coach reads them and adapts." />
        {sessionsCard}
      </>)}

      {nav === "coach" && (<>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
          <Head title="Coach" sub="Ask anything — it remembers your conversation and your training." />
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button onClick={testConn} className="ghost" style={{ ...ghostBtn, padding: "5px 11px", fontSize: 12.5 }}>Test connection</button>
            {chat.length > 0 && <button onClick={clearCoach} className="ghost" style={{ ...ghostBtn, padding: "5px 11px", fontSize: 12.5 }}>New chat</button>}
          </div>
        </div>
        {health && (
          <div style={{ borderRadius: 16, padding: "10px 14px", fontSize: 13.5, lineHeight: 1.5, background: health.testing ? C.surfaceHi : health.ok ? "#ECFDF5" : "#FEF2F2", border: `1px solid ${health.testing ? C.border : health.ok ? "#6EE7B7" : "#FCA5A5"}`, color: health.testing ? C.muted : health.ok ? "#065F46" : "#B91C1C" }}>
            {health.testing ? "Testing the coach connection…" : health.ok ? `✓ Coach connected — ${health.model} responded in ${health.ms}ms.` : `✕ Coach can't reach the model (${health.model}): ${health.error}`}
          </div>
        )}
        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: "min(58vh, 520px)", overflowY: "auto", paddingRight: 4 }}>
            {chat.length === 0 && !asking && (
              <div style={{ color: C.muted, fontSize: 14, padding: "6px 2px", lineHeight: 1.6 }}>
                Start a conversation — and follow up as much as you like. The coach remembers what you've said and knows your plan, FTP, weight and recent rides.<br /><br />
                <span style={{ color: C.faint }}>Try: "I'm 1.5kg down but Thursday's VO2 felt flat — should I ease off this week?"</span>
              </div>
            )}
            {chat.map((m, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start", gap: 6 }}>
                <div style={{ maxWidth: "84%", padding: "10px 13px", borderRadius: 20, fontSize: 14.5, lineHeight: 1.55, whiteSpace: "pre-wrap",
                  background: m.role === "user" ? C.brand : C.surfaceHi, color: m.role === "user" ? "#fff" : C.text,
                  borderBottomRightRadius: m.role === "user" ? 4 : 14, borderBottomLeftRadius: m.role === "user" ? 14 : 4 }}>{m.content}</div>
                {m.role === "assistant" && m.proposal && i === chat.length - 1 && propDismissed !== i && (
                  <div style={{ background: C.surface, border: `1px solid ${C.brand}`, borderRadius: 18, padding: "12px 14px", maxWidth: "94%" }}>
                    <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.brand, fontWeight: 700 }}>Proposed change</div>
                    <div style={{ fontSize: 14, marginTop: 6, lineHeight: 1.5 }}>{m.proposal.summary || "Adjust your plan"}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      <button onClick={() => applyCoach(m.proposal)} className="primary" style={{ ...primaryBtn, width: "auto", padding: "8px 16px", fontSize: 13 }}>✓ Confirm</button>
                      <button onClick={() => setPropDismissed(i)} className="ghost" style={{ ...ghostBtn, fontSize: 13 }}>Cancel</button>
                    </div>
                  </div>
                )}
                {m.role === "assistant" && m.suggestion && !m.proposal && i === chat.length - 1 && (
                  <button onClick={() => applyCoach(m.suggestion)} className="primary" style={{ ...primaryBtn, width: "auto", padding: "8px 16px", fontSize: 13 }}>✓ {SUGG_LABEL[m.suggestion] || "Apply"}</button>
                )}
              </div>
            ))}
            {asking && <div style={{ display: "flex", justifyContent: "flex-start" }}><div style={{ padding: "10px 13px", borderRadius: 14, background: C.surfaceHi }}><span className="pulse" style={{ color: C.muted, fontSize: 14 }}>Coach is thinking…</span></div></div>}
            <div ref={chatEndRef} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <input style={{ ...input, flex: 1 }} placeholder="Message your coach…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendCoach()} />
            <button onClick={sendCoach} disabled={asking} className="primary" style={{ ...primaryBtn, width: "auto", padding: "0 22px", opacity: asking ? 0.6 : 1 }}>{asking ? "…" : "Send"}</button>
          </div>
        </Card>
      </>)}
    </div>
  );
}

function NutritionView({ profile, weights, today, plan, onGenerate, busy }) {
  const targets = dailyTargets(profile, weights);
  const todayType = classifyDay(today);
  const [view, setView] = useState(todayType === "rest" ? "rest" : "training");
  const t = view === "training" ? targets.hard : targets.rest;
  const fuel = fuelling(view === "training" ? "hard" : "rest");
  const meals = plan?.meals?.[view === "training" ? "trainingDay" : "restDay"];

  const macroBar = (() => {
    const c = t.carbsG * 4, p = t.proteinG * 4, f = t.fatG * 9, tot = c + p + f || 1;
    return [["Carbs", c, ZONES.endurance.color], ["Protein", p, C.brand], ["Fat", f, ZONES.threshold.color]]
      .map(([l, v, col]) => ({ l, pct: Math.round((v / tot) * 100), col }));
  })();

  const Stat = ({ label, value, unit, color }) => (
    <div style={{ flex: 1, minWidth: 120, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: "14px 16px" }}>
      <div style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, fontFamily: C.mono, marginTop: 5, color: color || C.text }}>{value}<span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}> {unit}</span></div>
    </div>
  );
  const Meal = ({ slot, m }) => m ? (
    <Card style={{ marginTop: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <div><span style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: C.brand, fontWeight: 700 }}>{slot}</span><div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{m.name}</div></div>
        <div style={{ fontFamily: C.mono, fontSize: 11.5, color: C.muted }}>{m.kcal} kcal · {m.carbsG}C {m.proteinG}P {m.fatG}F</div>
      </div>
      {m.ingredients?.length > 0 && <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>{m.ingredients.map((ing, i) => <span key={i} style={{ fontSize: 12, background: C.surfaceHi, borderRadius: 20, padding: "3px 10px", color: C.text }}>{ing}</span>)}</div>}
      {m.method && <p style={{ fontSize: 13.5, lineHeight: 1.6, color: C.muted, margin: "10px 0 0" }}>{m.method}</p>}
    </Card>
  ) : null;

  return (
    <>
      <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
        {[["training", "Training day"], ["rest", "Rest day"]].map(([v, l]) => (
          <button key={v} onClick={() => setView(v)} className="ghost" style={{ ...ghostBtn, padding: "6px 14px", fontSize: 13, ...(view === v ? { borderColor: C.brand, color: C.brand, background: C.brandSoft } : {}) }}>{l}</button>
        ))}
        {todayType && <span style={{ alignSelf: "center", marginLeft: 6, fontSize: 12, color: C.muted }}>Today is a <b style={{ color: C.text }}>{DAYTYPE_LABEL[todayType].toLowerCase()}</b></span>}
      </div>

      <Card>
        <Eyebrow>{view === "training" ? "Training-day targets" : "Rest-day targets"}</Eyebrow>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
          <Stat label="Calories" value={t.kcal} unit="kcal" />
          <Stat label="Carbs" value={t.carbsG} unit="g" color={ZONES.endurance.color} />
          <Stat label="Protein" value={t.proteinG} unit="g" color={C.brand} />
          <Stat label="Fat" value={t.fatG} unit="g" color={ZONES.threshold.color} />
        </div>
        <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", marginTop: 14 }}>
          {macroBar.map((b, i) => <div key={i} style={{ width: `${b.pct}%`, background: b.col }} title={`${b.l} ${b.pct}%`} />)}
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 11.5, color: C.muted }}>
          {macroBar.map((b, i) => <span key={i}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: b.col, marginRight: 5 }} />{b.l} {b.pct}%</span>)}
        </div>
      </Card>

      <Card>
        <Eyebrow>Ride fuelling</Eyebrow>
        <div style={{ fontFamily: C.mono, fontSize: 14, color: C.brand, fontWeight: 700, marginTop: 8 }}>{fuel.carbsPerHour}</div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {[["Before", fuel.pre], ["During", fuel.during], ["After", fuel.post]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", gap: 10 }}><span style={{ fontSize: 12, fontWeight: 700, color: C.muted, minWidth: 52 }}>{k}</span><span style={{ fontSize: 13.5, lineHeight: 1.5 }}>{v}</span></div>
          ))}
        </div>
      </Card>

      <Card style={{ background: meals ? C.surface : C.brandSoft, border: `1px solid ${meals ? C.border : C.brand}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div><Eyebrow>Meal ideas</Eyebrow><div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Simple, family-friendly, Lidl-Ireland ingredients{plan?.generatedAt ? ` · updated ${plan.generatedAt.slice(0, 10)}` : ""}.</div></div>
          <button onClick={onGenerate} disabled={busy} className="primary" style={{ ...primaryBtn, width: "auto", padding: "10px 18px", opacity: busy ? 0.6 : 1 }}>{busy ? "Cooking up ideas…" : meals ? "↻ Refresh" : "Generate meal ideas"}</button>
        </div>
      </Card>

      {meals && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Meal slot="Breakfast" m={meals.breakfast} />
          <Meal slot="Lunch" m={meals.lunch} />
          <Meal slot="Dinner" m={meals.dinner} />
          <Meal slot="Snack" m={meals.snack} />
        </div>
      )}
    </>
  );
}

function GlanceStrip({ profile, weights, events, pmc }) {
  if (!profile) return null;
  const next = nextEventOf(events, profile);
  const days = next ? Math.max(0, Math.round((new Date(next.date) - new Date()) / 86400000)) : null;
  const cw = latestWeight(weights, profile);
  const wkg = cw ? (profile.currentFTP / cw).toFixed(2) : null;
  const tsb = pmc && !pmc.empty ? pmc.current.tsb : null;
  const form = tsb == null ? null : (tsb > 5 ? "Fresh" : tsb < -20 ? "Fatigued" : tsb < -5 ? "Building" : "Neutral");
  const formCol = tsb == null ? C.muted : (tsb > 5 ? "#059669" : tsb < -20 ? "#DC2626" : C.brand);
  const tiles = [
    days != null && { label: next.name?.length > 12 ? "Next race" : (next.name || "Next race"), value: days, unit: "days", color: C.brand },
    { label: "FTP", value: profile.currentFTP, unit: "W", color: C.text },
    wkg && { label: "Power/weight", value: wkg, unit: "w/kg", color: C.text },
    form && { label: "Form", value: form, unit: tsb > 0 ? `+${tsb}` : `${tsb}`, color: formCol },
  ].filter(Boolean);
  return (
    <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 2, margin: "0 -2px", WebkitOverflowScrolling: "touch" }}>
      {tiles.map((t, i) => (
        <div key={i} style={{ flex: "1 0 auto", minWidth: 92, background: C.surface, borderRadius: 20, padding: "13px 16px", boxShadow: "0 1px 2px rgba(17,24,39,.04), 0 6px 20px rgba(17,24,39,.05)" }}>
          <div style={{ fontSize: 10.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700, whiteSpace: "nowrap" }}>{t.label}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 5 }}>
            <span style={{ fontSize: 23, fontWeight: 800, color: t.color, fontFamily: C.mono, lineHeight: 1 }}>{t.value}</span>
            <span style={{ fontSize: 11.5, color: C.faint, fontWeight: 600 }}>{t.unit}</span>
          </div>
        </div>
      ))}
    </div>
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
            <span key={w.id} onClick={() => removeWeight(w.id)} title="Click to remove" style={{ cursor: "pointer", fontFamily: C.mono, fontSize: 12, color: C.muted, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 14, padding: "4px 8px" }}>
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
    <div style={{ marginTop: 14, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
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

const isoAdd = (startISO, d) => new Date(new Date(startISO + "T00:00:00Z").getTime() + d * 86400000).toISOString().slice(0, 10);
const fmtDayMon = (iso) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function WeekList({ block, focusWeek, setFocusWeek, curWeek, selected, setSelected, eventDates, onSetHours }) {
  const wi = Math.max(0, Math.min(block.weeks.length - 1, focusWeek));
  const wk = block.weeks[wi];
  const today = new Date().toISOString().slice(0, 10);
  const start = wk.startDate;
  const navBtn = (dir, disabled, onClick) => <button onClick={onClick} disabled={disabled} className="ghost" style={{ ...ghostBtn, padding: "8px 14px", fontSize: 16, opacity: disabled ? 0.4 : 1 }}>{dir}</button>;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        {navBtn("‹", wi === 0, () => setFocusWeek(wi - 1))}
        <div style={{ textAlign: "center", flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15.5 }}>Week {wk.weekNumber} · {wk.phase}</div>
          <div style={{ fontSize: 12, color: C.muted }}>{fmtDayMon(start)} – {fmtDayMon(isoAdd(start, 6))}{wi === curWeek ? " · this week" : ""}</div>
        </div>
        {navBtn("›", wi === block.weeks.length - 1, () => setFocusWeek(wi + 1))}
      </div>
      {wi !== curWeek && <button onClick={() => setFocusWeek(curWeek)} className="ghost" style={{ ...ghostBtn, fontSize: 12.5, marginBottom: 10, width: "100%" }}>Jump to this week</button>}
      {onSetHours && (
        <div style={{ background: C.surfaceHi, borderRadius: 18, padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ fontSize: 12.5, color: C.muted, textAlign: "center", marginBottom: 7 }}>{wk.hoursCap ? <>Fitted to <b style={{ color: C.text }}>{wk.hoursCap}h</b> this week</> : <><b style={{ color: C.text }}>{wk.targetHours}h</b> planned</>} — how much time do you have?</div>
          <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
            {[4, 6, 8, 10, 12].map((h) => <button key={h} onClick={() => onSetHours(start, h)} className="ghost" style={{ ...ghostBtn, padding: "5px 13px", fontSize: 12.5, ...(wk.hoursCap === h ? { borderColor: C.brand, color: C.brand, background: C.brandSoft } : {}) }}>{h}h</button>)}
            {wk.hoursCap && <button onClick={() => onSetHours(start, 0)} className="ghost" style={{ ...ghostBtn, padding: "5px 13px", fontSize: 12.5 }}>Reset</button>}
          </div>
          {wk.hoursCap && wk.hoursNote && <div style={{ fontSize: 12, color: C.brand, textAlign: "center", marginTop: 8, lineHeight: 1.4 }}>{wk.hoursNote}</div>}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {wk.days.map((d, di) => {
          const z = ZONES[d.intensity] || ZONES.rest;
          const date = d.date || isoAdd(start, di);
          const isToday = date === today, active = selected && selected.week === wi && selected.day === di;
          const off = d.status === "off", missed = d.status === "missed", rest = d.type === "rest";
          const ev = eventDates.has(date);
          return (
            <button key={di} onClick={() => setSelected(active ? null : { week: wi, day: di })}
              style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", width: "100%", padding: "12px 14px", borderRadius: 18, border: `1px solid ${active ? z.color : isToday ? C.brand : C.border}`, background: active ? C.brandSoft : C.surface, cursor: "pointer", color: C.text }}>
              <div style={{ width: 4, alignSelf: "stretch", borderRadius: 3, minHeight: 34, background: rest ? C.border : missed ? "#FB7185" : off ? C.faint : z.color }} />
              <div style={{ minWidth: 46 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: isToday ? C.brand : C.text }}>{d.day}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{fmtDayMon(date)}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, textDecoration: missed ? "line-through" : "none", color: missed ? C.muted : C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ev ? <span style={{ color: C.brand, marginRight: 5, verticalAlign: -1 }}>{ICONS.race}</span> : null}{off ? "Off" : rest ? "Rest" : d.title}</div>
                <div style={{ fontSize: 12, color: C.muted }}>{rest ? "Recover" : off ? "Time off" : `${z.label} · ${d.duration}`}</div>
              </div>
              <span style={{ color: C.faint, fontSize: 20, flexShrink: 0 }}>›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MonthGrid({ dateMap, monthCursor, setMonthCursor, selected, setSelected, eventDates }) {
  const today = new Date().toISOString().slice(0, 10);
  const { y, m } = monthCursor;
  const first = new Date(Date.UTC(y, m, 1));
  const monthName = first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const lead = (first.getUTCDay() + 6) % 7;
  const gridStart = first.getTime() - lead * 86400000;
  const cells = Array.from({ length: 42 }, (_, i) => new Date(gridStart + i * 86400000));
  const nowM = new Date(); const isCurMonth = nowM.getFullYear() === y && nowM.getMonth() === m;
  const navBtn = (dir, onClick) => <button onClick={onClick} className="ghost" style={{ ...ghostBtn, padding: "8px 14px", fontSize: 16 }}>{dir}</button>;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        {navBtn("‹", () => setMonthCursor(m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }))}
        <div style={{ fontWeight: 800, fontSize: 15.5 }}>{monthName}</div>
        {navBtn("›", () => setMonthCursor(m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }))}
      </div>
      {!isCurMonth && <button onClick={() => setMonthCursor({ y: nowM.getFullYear(), m: nowM.getMonth() })} className="ghost" style={{ ...ghostBtn, fontSize: 12.5, marginBottom: 10, width: "100%" }}>Back to today</button>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 6 }}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => <div key={i} style={{ fontSize: 10, color: C.muted, textAlign: "center", fontWeight: 700 }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
        {cells.map((c, i) => {
          const iso = c.toISOString().slice(0, 10);
          const inMonth = c.getUTCMonth() === m;
          const hit = dateMap[iso], d = hit?.d;
          const z = d ? (ZONES[d.intensity] || ZONES.rest) : null;
          const off = d?.status === "off", missed = d?.status === "missed", rest = d?.type === "rest";
          const isToday = iso === today, active = hit && selected && selected.week === hit.wi && selected.day === hit.di;
          const ev = eventDates.has(iso);
          return (
            <button key={i} onClick={() => hit && setSelected(active ? null : { week: hit.wi, day: hit.di })} disabled={!hit}
              style={{ aspectRatio: "1 / 1", minHeight: 42, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 4, border: `1px solid ${active ? z.color : isToday ? C.brand : C.border}`, borderRadius: 14, cursor: hit ? "pointer" : "default", background: active ? C.brandSoft : C.surface, opacity: inMonth ? 1 : 0.38, color: C.text }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: isToday ? C.brand : C.muted }}>{c.getUTCDate()}</span>
                {ev && <span style={{ color: C.brand }}>{ICONS.race}</span>}
              </div>
              {d && !rest && !off && <span style={{ height: 4, borderRadius: 2, background: missed ? "#FB7185" : z.color }} />}
              {d && <span style={{ fontSize: 8, color: C.muted, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{off ? "Off" : rest ? "Rest" : d.title}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BlockView({ block, curWeek, selected, setSelected, sel, selZone, onRegenerate, busy, downloadWorkout, prepareWeek, preparing, events, dayAction, onSetHours }) {
  const [moveOpen, setMoveOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [view, setView] = useState("week");
  const [focusWeek, setFocusWeek] = useState(() => curWeek);
  const [monthCursor, setMonthCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const selWeek = selected ? block.weeks[selected.week] : null;
  const dateMap = useMemo(() => { const m = {}; block.weeks.forEach((w, wi) => (w.days || []).forEach((d, di) => { m[d.date || isoAdd(w.startDate, di)] = { wi, di, d }; })); return m; }, [block]);
  const eventDates = useMemo(() => new Set((events || []).map((e) => e.date)), [events]);
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <div><Eyebrow>Training plan</Eyebrow><div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>{busy ? "Re-planning around your changes…" : `${block.weeks.length} weeks · rolling`}</div></div>
        <button onClick={onRegenerate} className="ghost" style={ghostBtn} disabled={busy}>{busy ? "…" : "Rebuild"}</button>
      </div>
      {block.summary && <p style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.5, margin: "0 0 12px" }}>{block.summary}</p>}
      {Array.isArray(block.phases) && block.phases.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {block.phases.map((p, i) => (
            <span key={i} style={{ fontSize: 11.5, color: C.muted, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "4px 9px" }}>
              <b style={{ color: C.text }}>{p.name}</b>{p.weeks ? ` · wk ${p.weeks}` : ""}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["week", "Week"], ["month", "Month"]].map(([v, l]) => (
          <button key={v} onClick={() => setView(v)} className="ghost" style={{ ...ghostBtn, padding: "7px 18px", fontSize: 13.5, fontWeight: 700, ...(view === v ? { borderColor: C.brand, color: C.brand, background: C.brandSoft } : {}) }}>{l}</button>
        ))}
      </div>

      {view === "week"
        ? <WeekList block={block} focusWeek={focusWeek} setFocusWeek={setFocusWeek} curWeek={curWeek} selected={selected} setSelected={setSelected} eventDates={eventDates} onSetHours={onSetHours} />
        : <MonthGrid dateMap={dateMap} monthCursor={monthCursor} setMonthCursor={setMonthCursor} selected={selected} setSelected={setSelected} eventDates={eventDates} />}

      {sel && selWeek && (
        <Card style={{ borderLeft: `4px solid ${sel.status === "missed" ? "#FB7185" : sel.status === "off" ? C.faint : selZone.color}`, marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 17, fontWeight: 800, textDecoration: sel.status === "missed" ? "line-through" : "none", color: sel.status === "missed" ? C.muted : C.text }}>Wk {selWeek.weekNumber} · {sel.day} · {sel.title}</div>
            <div style={{ fontFamily: C.mono, color: selZone.color, fontWeight: 700 }}>{selZone.label} · {sel.duration}</div>
          </div>
          {sel.status === "missed" && <div style={{ color: "#FB7185", fontSize: 12, fontWeight: 700, marginTop: 6 }}>✕ Marked missed</div>}
          <p style={{ lineHeight: 1.6, margin: "10px 0 0", fontSize: 15 }}>{sel.description}</p>
          {sel.steps?.length > 0 && sel.status !== "off" && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 4 }}>
                <Metric v={`${stepsTss(sel.steps)}`} l="TSS" />
                {mainSetText(sel.steps, null) && <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 10.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Main set</div><div style={{ fontSize: 13.5, fontWeight: 700, fontFamily: C.mono }}>{mainSetText(sel.steps, null)}</div></div>}
              </div>
              <IntervalProfile steps={sel.steps} />
            </div>
          )}
          {sel.type === "ride" && sel.status !== "off" && (sel.steps?.length > 0
            ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                <button onClick={() => downloadWorkout(selected.week, selected.day, "fit")} className="ghost" style={{ ...ghostBtn, color: C.text, borderColor: C.brand }}>Garmin (.FIT) · {sel.steps.length} steps</button>
                <button onClick={() => downloadWorkout(selected.week, selected.day, "zwo")} className="ghost" style={{ ...ghostBtn, color: C.text, borderColor: C.brand }}>Zwift (.ZWO)</button>
              </div>
            : <button onClick={() => prepareWeek(selected.week)} className="ghost" style={{ ...ghostBtn, marginTop: 14 }} disabled={preparing === selected.week}>{preparing === selected.week ? "Preparing week…" : "Prepare this week's intervals →"}</button>
          )}
          {sel.status !== "off" && (
            <div style={{ marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
              <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Adjust this session</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => { setMoveOpen((v) => !v); setReplaceOpen(false); }} className="ghost" style={{ ...ghostBtn, fontSize: 13 }}>Move day</button>
                {(sel.type === "ride" || sel.type === "rest") && <button onClick={() => { setReplaceOpen((v) => !v); setMoveOpen(false); }} className="ghost" style={{ ...ghostBtn, fontSize: 13 }}>{sel.type === "rest" ? "Add a ride…" : "Replace…"}</button>}
                {sel.type === "ride" && <>
                  <button onClick={() => dayAction({ weekIndex: selected.week, dayIndex: selected.day, action: "replace", replaceType: "easier" })} className="ghost" style={{ ...ghostBtn, fontSize: 13 }}>Make easier</button>
                  <button onClick={() => dayAction({ weekIndex: selected.week, dayIndex: selected.day, action: "replace", replaceType: "harder" })} className="ghost" style={{ ...ghostBtn, fontSize: 13 }}>Make harder</button>
                </>}
                {sel.type === "ride" && <button onClick={() => dayAction({ weekIndex: selected.week, dayIndex: selected.day, action: "replace", replaceType: "rest" })} className="ghost" style={{ ...ghostBtn, fontSize: 13 }}>Make rest day</button>}
                {sel.status === "missed"
                  ? <button onClick={() => dayAction({ weekIndex: selected.week, dayIndex: selected.day, action: "clear" })} className="ghost" style={{ ...ghostBtn, fontSize: 13 }}>Undo missed</button>
                  : sel.type === "ride" && <button onClick={() => dayAction({ weekIndex: selected.week, dayIndex: selected.day, action: "missed" })} className="ghost" style={{ ...ghostBtn, fontSize: 13, color: "#F43F5E", borderColor: "#FBCFE8" }}>Mark missed</button>}
              </div>
            </div>
          )}
          {replaceOpen && (
            <div style={{ marginTop: 10, background: C.surfaceHi, borderRadius: 16, padding: 12 }}>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>Replace with a different session:</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[["recovery", "Recovery"], ["endurance", "Endurance"], ["tempo", "Tempo"], ["sweetspot", "Sweet Spot"], ["threshold", "Threshold"], ["vo2", "VO2"], ["anaerobic", "Anaerobic"], ["sprint", "Sprint"]].map(([k, l]) => (
                  <button key={k} onClick={() => { dayAction({ weekIndex: selected.week, dayIndex: selected.day, action: "replace", replaceType: k }); setReplaceOpen(false); }} className="ghost" style={{ ...ghostBtn, padding: "6px 12px", fontSize: 12.5 }}>{l}</button>
                ))}
              </div>
            </div>
          )}
          {moveOpen && (
            <div style={{ marginTop: 10, background: C.surfaceHi, borderRadius: 16, padding: 12 }}>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>Swap with which day?</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {selWeek.days.map((d, ti) => ti !== selected.day && (
                  <button key={ti} onClick={() => { dayAction({ weekIndex: selected.week, dayIndex: selected.day, targetDayIndex: ti, action: "swap" }); setMoveOpen(false); }} className="ghost" style={{ ...ghostBtn, padding: "6px 11px", fontSize: 12.5 }}>{d.day} · {d.type === "rest" ? "rest" : d.title}</button>
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
    <div style={{ background: isCurrent ? C.surfaceHi : C.surface, border: `1px solid ${isCurrent ? C.brand : C.border}`, borderRadius: 18, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          Week {wk.weekNumber} <span style={{ color: C.muted, fontWeight: 600 }}>· {wk.phase}</span>
          {isCurrent && <span style={{ marginLeft: 8, fontSize: 10, color: C.brand, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>This week</span>}
        </div>
        <div style={{ fontSize: 11, color: C.muted, fontFamily: C.mono }}>{wk.startDate ? wk.startDate.slice(5) : ""}{wk.targetHours ? ` · ${wk.targetHours}h` : ""}</div>
      </div>
      {(wkEvents || []).map((e) => (
        <div key={e.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.bg, border: `1px solid ${PRIO[e.priority] || C.brand}`, borderRadius: 14, padding: "3px 9px", marginBottom: 8, marginRight: 6, fontSize: 11.5 }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: PRIO[e.priority] || C.brand }} />
          <b><span style={{ color: C.brand, marginRight: 4, verticalAlign: -1 }}>{ICONS.race}</span>{e.name}</b> <span style={{ color: C.muted }}>· {e.priority}</span>
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
          const label = off ? "Off" : d.type === "rest" ? "Rest" : d.title;
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
        <div style={{ marginTop: 14, background: C.brandSoft, border: `1px solid ${C.brand}`, borderRadius: 16, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
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
  threshold: "#F59E0B", vo2: "#EF4444", anaerobic: "#DB2777", sprint: "#9333EA", specialty: "#4338CA", test: "#0EA5E9",
};

function WorkoutGenerator() {
  const [type, setType] = useState("vo2");
  const [gen, setGen] = useState(null);
  const make = () => setGen(generateWorkout(type === "surprise" ? null : type, { seed: Math.floor(Math.random() * 1e9) }));
  const dl = (fmt) => { const a = document.createElement("a"); a.href = `/api/generate/workout?type=${gen.type}&seed=${gen.seed}&fmt=${fmt}`; a.download = ""; document.body.appendChild(a); a.click(); a.remove(); };
  const TYPES = [["vo2", "VO2"], ["threshold", "Threshold"], ["sweetspot", "Sweet Spot"], ["tempo", "Tempo"], ["endurance", "Endurance"], ["anaerobic", "Anaerobic"], ["sprint", "Sprint"], ["recovery", "Recovery"], ["surprise", "Surprise me"]];
  return (
    <Card style={{ borderLeft: `4px solid ${C.brand}` }}>
      <Eyebrow>Make me a workout</Eyebrow>
      <div style={{ color: C.muted, fontSize: 13, marginTop: 4, marginBottom: 12 }}>Pick a focus and I'll compose a fresh, coaching-sound session on the spot — effectively endless variety.</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {TYPES.map(([k, l]) => <button key={k} onClick={() => setType(k)} className="ghost" style={{ ...ghostBtn, padding: "6px 13px", fontSize: 12.5, ...(type === k ? { borderColor: C.brand, color: C.brand, background: C.brandSoft } : {}) }}>{l}</button>)}
      </div>
      <button onClick={make} className="primary" style={{ ...primaryBtn, width: "auto", padding: "10px 20px" }}>{gen ? "Generate another" : "Generate workout"}</button>
      {gen && (
        <div style={{ marginTop: 16, border: `1px solid ${C.border}`, borderRadius: 18, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{gen.name}</div>
            <div style={{ fontFamily: C.mono, color: C.muted, fontSize: 12.5 }}>{gen.durationMin}min · {gen.tss} TSS</div>
          </div>
          <p style={{ fontSize: 13.5, color: C.muted, margin: "6px 0 0" }}>{gen.description}</p>
          <IntervalProfile steps={gen.steps} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <button onClick={() => dl("fit")} className="ghost" style={{ ...ghostBtn, color: C.text, borderColor: C.brand }}>Garmin (.FIT)</button>
            <button onClick={() => dl("zwo")} className="ghost" style={{ ...ghostBtn, color: C.text, borderColor: C.brand }}>Zwift (.ZWO)</button>
          </div>
        </div>
      )}
    </Card>
  );
}

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

function LibraryCard({ riderType }) {
  const [filter, setFilter] = useState("all");
  const [forMe, setForMe] = useState(!!riderType);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);
  const [shown, setShown] = useState(30);
  const cats = CATEGORIES.filter((c) => LIBRARY.some((w) => w.cat === c.key));
  let list = filter === "all" ? LIBRARY : LIBRARY.filter((w) => w.cat === filter);
  if (forMe && riderType) list = list.filter((w) => (w.archetypes || []).includes(riderType));
  if (q.trim()) { const t = q.trim().toLowerCase(); list = list.filter((w) => w.name.toLowerCase().includes(t) || w.description.toLowerCase().includes(t)); }
  list = [...list].sort((a, b) => (a.level || 5) - (b.level || 5));
  const dl = (id, fmt = "fit") => {
    const a = document.createElement("a"); a.href = `/api/library/workout?id=${id}&fmt=${fmt}`; a.download = "";
    document.body.appendChild(a); a.click(); a.remove();
  };
  const riderLabel = riderType && ARCHETYPES[riderType] ? ARCHETYPES[riderType].label : null;
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <Eyebrow>Workout library · {LIBRARY.length} sessions</Eyebrow>
        {riderLabel && <button onClick={() => setForMe((v) => !v)} className="ghost" style={{ ...ghostBtn, padding: "4px 11px", fontSize: 12, ...(forMe ? { borderColor: C.brand, color: C.brand, background: C.brandSoft } : {}) }}>{forMe ? "✓ " : ""}For a {riderLabel}</button>}
      </div>
      <div style={{ color: C.muted, fontSize: 12.5, marginTop: 4, marginBottom: 12 }}>Sorted easiest → hardest (L1–L10). Tap one to see the full brief, preview the profile, and send to Garmin or Zwift.</div>
      <input style={{ ...input, marginBottom: 10 }} placeholder="Search workouts… (e.g. over-unders, 30/30, climb)" value={q} onChange={(e) => { setQ(e.target.value); setShown(30); }} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {[{ key: "all", label: "All" }, ...cats].map((c) => (
          <button key={c.key} onClick={() => { setFilter(c.key); setShown(30); }} className="ghost"
            style={{ ...ghostBtn, padding: "4px 10px", fontSize: 12, ...(filter === c.key ? { borderColor: C.brand, color: C.text } : {}) }}>{c.label}</button>
        ))}
      </div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>{list.length} match{list.length === 1 ? "" : "es"}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {list.slice(0, shown).map((w) => {
          const col = CAT_COLORS[w.cat] || C.brand; const isOpen = open === w.id;
          return (
            <div key={w.id} style={{ background: C.bg, border: `1px solid ${isOpen ? col : C.border}`, borderLeft: `4px solid ${col}`, borderRadius: 16, padding: "10px 12px" }}>
              <div onClick={() => setOpen(isOpen ? null : w.id)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{w.name}</div>
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: C.mono }}>{CATEGORIES.find((c) => c.key === w.cat)?.label} · {w.durationMin}min · {w.tss} TSS</div>
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 800, fontFamily: C.mono, color: col, border: `1px solid ${col}`, borderRadius: 6, padding: "2px 6px", flexShrink: 0 }}>L{w.level || 5}</span>
                <span style={{ color: C.muted, fontSize: 12 }}>{isOpen ? "▲" : "▼"}</span>
              </div>
              {isOpen && (
                <div>
                  <p style={{ fontSize: 13.5, lineHeight: 1.5, margin: "10px 0 0" }}>{w.description}</p>
                  <IntervalProfile steps={w.steps} />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    <button onClick={() => dl(w.id, "fit")} className="ghost" style={{ ...ghostBtn, color: C.text, borderColor: C.brand }}>Garmin (.FIT)</button>
                    <button onClick={() => dl(w.id, "zwo")} className="ghost" style={{ ...ghostBtn, color: C.text, borderColor: C.brand }}>Zwift (.ZWO)</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {list.length > shown && <button onClick={() => setShown(shown + 30)} className="ghost" style={{ ...ghostBtn, width: "100%", marginTop: 10 }}>Show {Math.min(30, list.length - shown)} more of {list.length}</button>}
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
        <div style={{ marginTop: 10, background: C.surfaceHi, borderRadius: 16, padding: "10px 12px", fontSize: 13, lineHeight: 1.5 }}>
          Holding current load you'll reach <b style={{ color: C.brand }}>~{Math.round(pmc.projection.eventCtl)} fitness</b> on event day at form <b style={{ color: pmc.projection.eventTsb > 0 ? "#34D399" : "#FBBF24" }}>{fmt(pmc.projection.eventTsb)}</b> ({pmc.daysToEvent} days out). {pmc.projection.eventTsb < 5 ? "Ease the final 1–2 weeks so form swings positive and you arrive fresh." : "That's race-ready freshness — protect the taper."}
        </div>
      )}
      <button onClick={getRead} disabled={loading} className="ghost" style={{ ...ghostBtn, marginTop: 12, borderColor: C.brand, color: C.text }}>{loading ? "Reading…" : "Coach's read on my form"}</button>
      {read && <p style={{ lineHeight: 1.6, marginTop: 12, fontSize: 14.5 }}>{read}</p>}
    </Card>
  );
}

const EV_PRIO = { A: "#FB7185", B: "#FBBF24", C: "#A3E635" };
const EV_RATING = { strong: { label: "Strong", color: "#34D399" }, solid: { label: "Solid", color: "#A3E635" }, off: { label: "Off-day", color: "#FBBF24" } };

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
              <div key={e.id} style={{ background: C.bg, border: `1px solid ${C.border}`, borderLeft: `4px solid ${EV_PRIO[e.priority] || C.brand}`, borderRadius: 16, padding: "10px 12px" }}>
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
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 16, padding: "10px 12px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{a.type === "illness" ? "Illness" : "Holiday"}{a.notes ? ` · ${a.notes}` : ""}</div>
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
                      {hasEvent && <span style={{ color: C.brand }}>{ICONS.race}</span>}
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
