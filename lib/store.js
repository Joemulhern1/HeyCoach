import fs from "fs";
import path from "path";
import { Redis } from "@upstash/redis";

// Single-user state store with two backends, auto-selected:
//  - Upstash Redis when its env vars are present (serverless / Vercel)
//  - a local JSON file otherwise (local dev, or a host with a disk like Railway)
// All functions are async so both backends share one interface.

const EMPTY = { profile: null, plan: null, sessions: [], weights: [], strava: null };
const KEY = "heycoach:state";

let _redis = null;
function redis() {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) _redis = new Redis({ url, token });
  return _redis;
}

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "store.json");

export async function readStore() {
  const r = redis();
  if (r) {
    try {
      const data = await r.get(KEY);
      return { ...EMPTY, ...(data || {}) };
    } catch {
      return { ...EMPTY };
    }
  }
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(FILE)) return { ...EMPTY };
    return { ...EMPTY, ...JSON.parse(fs.readFileSync(FILE, "utf8")) };
  } catch {
    return { ...EMPTY };
  }
}

export async function writeStore(next) {
  const r = redis();
  if (r) { await r.set(KEY, next); return next; }
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function patchStore(patch) {
  return writeStore({ ...(await readStore()), ...patch });
}
