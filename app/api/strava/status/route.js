import { readStore } from "../../../../lib/store.js";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = await readStore();
  return Response.json({
    configured: !!process.env.STRAVA_CLIENT_ID,
    connected: !!store.strava,
    athlete: store.strava?.athlete || null,
  });
}
