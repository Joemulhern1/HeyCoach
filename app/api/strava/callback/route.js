import { exchangeCode } from "../../../../lib/strava.js";
import { patchStore } from "../../../../lib/store.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return Response.redirect(`${url.origin}/?strava=denied`);
  try {
    const tok = await exchangeCode(code);
    await patchStore({
      strava: {
        access_token: tok.access_token,
        refresh_token: tok.refresh_token,
        expires_at: tok.expires_at,
        athlete: tok.athlete ? { id: tok.athlete.id, name: `${tok.athlete.firstname || ""} ${tok.athlete.lastname || ""}`.trim() } : null,
      },
    });
    return Response.redirect(`${url.origin}/?strava=connected`);
  } catch {
    return Response.redirect(`${url.origin}/?strava=error`);
  }
}
