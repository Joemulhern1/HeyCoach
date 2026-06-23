import fs from "fs";
import path from "path";
import { Redis } from "@upstash/redis";
import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE } from "./session.js";

// Key-value store with two backends (Upstash Redis on serverless, JSON files locally),
// now keyed PER USER so every account's training data is fully isolated.

const EMPTY = { profile: null, plan: null, block: null, sessions: [], weights: [], strava: null, progression: { recovery: 5, endurance: 5, tempo: 5, threshold: 5, vo2: 5, strength: 5 } };

let _redis = null;
function redis() {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) _redis = new Redis({ url, token });
  return _redis;
}
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const fileFor = (key) => path.join(DATA_DIR, key.replace(/[^a-zA-Z0-9_-]/g, "_") + ".json");
function ensureDir() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }

// ---- low-level KV (used for the user registry too) ----
export async function kvGet(key) {
  const r = redis();
  if (r) { try { return (await r.get(key)) ?? null; } catch { return null; } }
  try { ensureDir(); const f = fileFor(key); if (!fs.existsSync(f)) return null; return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; }
}
export async function kvSet(key, val) {
  const r = redis();
  if (r) { await r.set(key, val); return val; }
  ensureDir(); fs.writeFileSync(fileFor(key), JSON.stringify(val, null, 2)); return val;
}

// ---- current user from the session cookie ----
export async function currentUserId() {
  const tok = cookies().get(SESSION_COOKIE)?.value;
  if (!tok) return null;
  const s = await verifySession(tok);
  return s?.uid || null;
}

// ---- per-user state (auto-scoped; data routes call these unchanged) ----
const stateKey = (uid) => `hc:state:${uid}`;

export async function readStore() {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not authenticated.");
  const data = await kvGet(stateKey(uid));
  return { ...EMPTY, ...(data || {}) };
}
export async function writeStore(next) {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not authenticated.");
  await kvSet(stateKey(uid), next);
  return next;
}
export async function patchStore(patch) {
  return writeStore({ ...(await readStore()), ...patch });
}
export async function deleteUserState(uid) { await kvSet(stateKey(uid), null); }
