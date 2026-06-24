"use client";
import { useEffect, useState } from "react";

const T = { bg: "#F4F6FA", surface: "#FFFFFF", border: "#E4E9F0", text: "#18212F", muted: "#64748B", brand: "#6366F1", mono: "ui-monospace, Menlo, monospace" };
const inp = { background: "#F8FAFC", border: `1px solid ${T.border}`, color: T.text, borderRadius: 10, padding: "10px 12px", fontSize: 14, outline: "none", width: "100%" };
const btn = { background: T.brand, color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer" };
const ghost = { background: "transparent", border: `1px solid ${T.border}`, color: T.muted, borderRadius: 8, padding: "5px 10px", fontSize: 12, cursor: "pointer", fontWeight: 600 };

export default function Admin() {
  const [me, setMe] = useState(undefined);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ username: "", password: "", role: "user" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      setMe(d.user || null);
      if (!d.user || d.user.role !== "admin") { window.location.href = "/"; return; }
      load();
    });
  }, []);
  const load = () => fetch("/api/admin/users").then((r) => r.json()).then((d) => d.users && setUsers(d.users));

  const add = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Failed.");
      setUsers(d.users); setForm({ username: "", password: "", role: "user" });
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const toggle = async (id, active) => { const r = await fetch("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, active }) }); const d = await r.json(); if (r.ok) setUsers(d.users); else setErr(d.error); };
  const del = async (id, name) => { if (!confirm(`Delete ${name}? Their training data is removed too.`)) return; const r = await fetch("/api/admin/users", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); const d = await r.json(); if (r.ok) setUsers(d.users); else setErr(d.error); };

  if (me === undefined) return <div style={{ minHeight: "100vh", background: T.bg }} />;

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "system-ui,sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 20px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
          <span style={{ width: 10, height: 10, background: T.brand, borderRadius: 3, transform: "rotate(45deg)" }} />
          <span style={{ fontSize: 18, fontWeight: 800 }}><span style={{ color: T.muted }}>Hey</span>Coach</span>
          <span style={{ marginLeft: 6, fontSize: 11, color: T.muted, fontFamily: T.mono, letterSpacing: 1 }}>ADMIN</span>
          <a href="/" style={{ marginLeft: "auto", ...ghost, textDecoration: "none" }}>← Back to app</a>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 16px" }}>Members</h2>
        {err && <div style={{ background: "rgba(251,113,133,0.12)", border: "1px solid #FB7185", borderRadius: 10, padding: "9px 12px", fontSize: 13.5, marginBottom: 14 }}>{err}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
          {users.map((u) => (
            <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 12, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{u.displayName || u.username} {u.role === "admin" && <span style={{ fontSize: 10, color: T.brand, fontWeight: 800, letterSpacing: 1 }}>ADMIN</span>} {!u.active && <span style={{ fontSize: 10, color: T.muted }}>(disabled)</span>}</div>
                <div style={{ fontSize: 11, color: T.muted, fontFamily: T.mono }}>@{u.username} · joined {u.createdAt.slice(0, 10)}</div>
              </div>
              {u.id !== me.id && (
                <>
                  <button onClick={() => toggle(u.id, !u.active)} style={ghost}>{u.active ? "Disable" : "Enable"}</button>
                  <button onClick={() => del(u.id, u.displayName || u.username)} style={{ ...ghost, color: "#FB7185", borderColor: "#FB7185" }}>Delete</button>
                </>
              )}
              {u.id === me.id && <span style={{ fontSize: 11, color: T.muted }}>you</span>}
            </div>
          ))}
        </div>

        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Add a member</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: 8, alignItems: "center" }}>
            <input style={inp} placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            <input style={inp} type="password" placeholder="Temp password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <select style={{ ...inp, width: "auto" }} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="user">Member</option><option value="admin">Admin</option>
            </select>
            <button style={{ ...btn, opacity: busy ? 0.6 : 1 }} onClick={add} disabled={busy}>{busy ? "Adding…" : "Add"}</button>
          </div>
          <div style={{ fontSize: 11.5, color: T.muted, marginTop: 10 }}>Share the username + temp password with your friend. They sign in and start fresh — their data is fully separate from yours.</div>
        </div>
      </div>
    </div>
  );
}
