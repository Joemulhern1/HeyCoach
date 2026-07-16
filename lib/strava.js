// Strava integration. Standard Tier (personal use) — requires the app owner to have
// an active Strava subscription as of 2026. Tokens are stored server-side only.
// NOTE on terms: Strava restricts using API data in AI models. Activities imported here
// populate your log; whether they feed the AI coach is gated by profile.useStravaForCoaching.

const BASE = "https://www.strava.com";

export function authorizeUrl(redirectUri) {
  const p = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID || "",
    response_type: "code",
    redirect_uri: redirectUri,
    approval_prompt: "auto",
    scope: "activity:read_all",
  });
  return `${BASE}/oauth/authorize?${p}`;
}

export async function exchangeCode(code) {
  const res = await fetch(`${BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error("Strava token exchange failed.");
  return res.json();
}

async function refresh(refreshToken) {
  const res = await fetch(`${BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error("Strava token refresh failed.");
  return res.json();
}

// Returns a valid access token, refreshing + persisting via saveTokens if expired.
export async function getValidToken(tokens, saveTokens) {
  const now = Math.floor(Date.now() / 1000);
  if (tokens.expires_at && tokens.expires_at > now + 60) return tokens.access_token;
  const refreshed = await refresh(tokens.refresh_token);
  const next = { ...tokens, ...refreshed };
  await saveTokens(next);
  return next.access_token;
}

export async function fetchActivities(accessToken, perPage = 30) {
  const res = await fetch(`${BASE}/api/v3/athlete/activities?per_page=${perPage}`, {
    headers: { Authorization: `Bearer ${accessToken}` }, // 2026: token in header
  });
  if (res.status === 401) throw new Error("Strava authorization expired — reconnect.");
  if (!res.ok) throw new Error(`Strava API error (${res.status}).`);
  return res.json();
}

const RIDE_TYPES = new Set(["Ride", "VirtualRide", "GravelRide", "MountainBikeRide", "EBikeRide"]);

export function mapActivity(a) {
  return {
    id: `strava-${a.id}`,
    name: a.name || "Strava activity",
    source: "STRAVA",
    sportType: a.sport_type || a.type,
    isRide: RIDE_TYPES.has(a.sport_type || a.type),
    addedAt: new Date().toISOString(),
    date: a.start_date,
    durationSec: a.moving_time ?? null,
    distanceKm: a.distance != null ? Number((a.distance / 1000).toFixed(1)) : null,
    avgPower: a.average_watts != null ? Math.round(a.average_watts) : null,
    maxPower: a.max_watts != null ? Math.round(a.max_watts) : null,
    avgHr: a.average_heartrate != null ? Math.round(a.average_heartrate) : null,
    maxHr: a.max_heartrate != null ? Math.round(a.max_heartrate) : null,
    avgCadence: a.average_cadence != null ? Math.round(a.average_cadence) : null,
    elevationGainM: a.total_elevation_gain != null ? Math.round(a.total_elevation_gain) : null,
  };
}

export async function fetchActivity(accessToken, id) {
  const res = await fetch(`${BASE}/api/v3/activities/${id}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 404) throw new Error("That activity wasn't found on your Strava account — the link must be one of your own rides.");
  if (!res.ok) throw new Error("Couldn't fetch that activity from Strava.");
  return res.json();
}

export async function fetchStreams(accessToken, id) {
  const res = await fetch(`${BASE}/api/v3/activities/${id}/streams?keys=watts,time&key_by_type=true`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null; // streams are optional (no power meter, etc.)
  return res.json();
}

export function parseActivityUrl(url) {
  const m = String(url || "").match(/strava\.com\/activities\/(\d+)/i) || String(url || "").match(/^(\d{6,})$/);
  return m ? m[1] : null;
}
