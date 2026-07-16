"use client";
import { useState } from "react";
const T = { bg: "#F4F6FA", surface: "#FFFFFF", border: "#E4E9F0", text: "#18212F", muted: "#64748B", brand: "#4338CA" };
const inp = { background: "#F8FAFC", border: `1px solid ${T.border}`, color: T.text, borderRadius: 10, padding: "11px 12px", fontSize: 15, outline: "none", width: "100%" };
const btn = { background: T.brand, color: "#fff", border: "none", borderRadius: 12, padding: "13px 0", fontSize: 16, fontWeight: 700, cursor: "pointer", width: "100%" };

export default function Setup() {
  const [u, setU] = useState(""); const [p, setP] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/auth/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: p }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Setup failed.");
      window.location.href = "/";
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui,sans-serif", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
          <span style={{ width: 11, height: 11, background: T.brand, borderRadius: 3, transform: "rotate(45deg)" }} />
          <span style={{ fontSize: 20, fontWeight: 800 }}><span style={{ color: T.muted }}>Hey</span>Coach</span>
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>Create the admin account</h2>
        <p style={{ color: T.muted, fontSize: 13.5, margin: "0 0 18px" }}>This first account owns the admin console and can add your friends.</p>
        {err && <div style={{ background: "rgba(251,113,133,0.12)", border: "1px solid #FB7185", borderRadius: 10, padding: "9px 12px", fontSize: 13.5, marginBottom: 14 }}>{err}</div>}
        <input style={{ ...inp, marginBottom: 10 }} placeholder="Username" value={u} onChange={(e) => setU(e.target.value)} />
        <input style={{ ...inp, marginBottom: 16 }} type="password" placeholder="Password (6+ characters)" value={p} onChange={(e) => setP(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        <button style={{ ...btn, opacity: busy ? 0.6 : 1 }} onClick={submit} disabled={busy}>{busy ? "Creating…" : "Create admin & continue"}</button>
      </div>
    </div>
  );
}
