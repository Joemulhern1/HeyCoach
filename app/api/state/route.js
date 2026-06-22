import { readStore } from "../../../lib/store.js";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await readStore());
}
