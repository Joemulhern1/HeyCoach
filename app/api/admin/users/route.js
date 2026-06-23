import { getCurrentUser, listUsers, createUser, setActive, removeUser, adminCount, getUsers } from "../../../../lib/users.js";

async function requireAdmin() { const me = await getCurrentUser(); return me && me.role === "admin" ? me : null; }

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdmin())) return Response.json({ error: "Forbidden" }, { status: 403 });
  return Response.json({ users: await listUsers() });
}

export async function POST(req) {
  if (!(await requireAdmin())) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { username, password, role } = await req.json();
  try {
    await createUser({ username, password, role: role === "admin" ? "admin" : "user" });
    return Response.json({ users: await listUsers() });
  } catch (e) { return Response.json({ error: e.message }, { status: 400 }); }
}

export async function PATCH(req) {
  const me = await requireAdmin();
  if (!me) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id, active } = await req.json();
  const users = await getUsers();
  if (users[id]?.role === "admin" && !active && (await adminCount()) <= 1) return Response.json({ error: "Can't deactivate the last admin." }, { status: 400 });
  return Response.json({ users: await setActive(id, active) });
}

export async function DELETE(req) {
  const me = await requireAdmin();
  if (!me) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await req.json();
  if (id === me.id) return Response.json({ error: "You can't delete your own account." }, { status: 400 });
  const users = await getUsers();
  if (users[id]?.role === "admin" && (await adminCount()) <= 1) return Response.json({ error: "Can't delete the last admin." }, { status: 400 });
  return Response.json({ users: await removeUser(id) });
}
