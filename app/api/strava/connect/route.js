import { authorizeUrl } from "../../../../lib/strava.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!process.env.STRAVA_CLIENT_ID) {
    return Response.json({ error: "Strava is not configured (set STRAVA_CLIENT_ID)." }, { status: 400 });
  }
  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/strava/callback`;
  return Response.redirect(authorizeUrl(redirectUri));
}
