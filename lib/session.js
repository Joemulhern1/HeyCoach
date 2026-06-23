// Signed session tokens via HMAC-SHA256 (Web Crypto — works in both Edge middleware and
// Node route handlers). Token = base64url(payload).base64url(signature).

const enc = new TextEncoder();

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey() {
  const secret = process.env.SESSION_SECRET || "dev-insecure-secret-change-me";
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSession({ uid, role }, days = 30) {
  const payload = { uid, role, exp: Date.now() + days * 86400000 };
  const data = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(data));
  return `${data}.${b64url(new Uint8Array(sig))}`;
}

export async function verifySession(token) {
  if (!token || !token.includes(".")) return null;
  const [data, sigStr] = token.split(".");
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(), unb64url(sigStr), enc.encode(data));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(unb64url(data)));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "hc_session";
