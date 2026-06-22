import { readStore, patchStore } from "../../../lib/store.js";
import { parseRideFile } from "../../../lib/parse.js";

export const maxDuration = 60;

export async function POST(req) {
  const form = await req.formData();
  const files = form.getAll("files");
  if (!files.length) {
    return Response.json({ error: "No files uploaded." }, { status: 400 });
  }
  const store = await readStore();
  const added = [];
  const errors = [];
  for (const file of files) {
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      added.push(await parseRideFile(file.name, buf));
    } catch (e) {
      errors.push(`${file.name}: ${e.message}`);
    }
  }
  const sessions = [...added, ...(store.sessions || [])];
  const next = await patchStore({ sessions });
  return Response.json({ ...next, added: added.length, errors });
}

export async function DELETE(req) {
  const { id } = await req.json();
  const store = await readStore();
  const sessions = (store.sessions || []).filter((s) => s.id !== id);
  return Response.json(await patchStore({ sessions }));
}
