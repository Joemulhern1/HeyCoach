import crypto from "node:crypto";
import { kvGet, kvSet, currentUserId, deleteUserState } from "./store.js";

const USERS_KEY = "hc:users";

export async function getUsers() { return (await kvGet(USERS_KEY)) || {}; }
async function saveUsers(u) { return kvSet(USERS_KEY, u); }
export async function userCount() { return Object.keys(await getUsers()).length; }

function hash(password, salt) { return crypto.scryptSync(password, salt, 64).toString("hex"); }
function pub(u) { return { id: u.id, username: u.username, displayName: u.displayName, role: u.role, active: u.active, createdAt: u.createdAt }; }

export async function createUser({ username, password, role = "user" }) {
  const uname = (username || "").trim().toLowerCase();
  if (!uname || !password || password.length < 6) throw new Error("Username and a 6+ character password are required.");
  const users = await getUsers();
  if (Object.values(users).some((u) => u.username === uname)) throw new Error("That username is already taken.");
  const id = crypto.randomUUID();
  const salt = crypto.randomBytes(16).toString("hex");
  users[id] = { id, username: uname, displayName: (username || "").trim(), salt, hash: hash(password, salt), role, active: true, createdAt: new Date().toISOString() };
  await saveUsers(users);
  return pub(users[id]);
}

export async function verifyCredentials(username, password) {
  const users = await getUsers();
  const u = Object.values(users).find((x) => x.username === (username || "").trim().toLowerCase());
  if (!u || !u.active) return null;
  const h = hash(password || "", u.salt);
  if (h.length !== u.hash.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(h), Buffer.from(u.hash))) return null;
  return pub(u);
}

export async function getCurrentUser() {
  const uid = await currentUserId();
  if (!uid) return null;
  const u = (await getUsers())[uid];
  return u && u.active ? pub(u) : null;
}

export async function listUsers() { return Object.values(await getUsers()).map(pub).sort((a, b) => a.createdAt.localeCompare(b.createdAt)); }

export async function setActive(id, active) {
  const users = await getUsers();
  if (users[id]) { users[id].active = !!active; await saveUsers(users); }
  return listUsers();
}

export async function removeUser(id) {
  const users = await getUsers();
  delete users[id];
  await saveUsers(users);
  await deleteUserState(id);
  return listUsers();
}

export async function adminCount() { return Object.values(await getUsers()).filter((u) => u.role === "admin" && u.active).length; }
