import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { adminClient, userClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Tap-your-name sign-in, with no email link and no PIN (Brad's call on 2026-10-22, knowing anyone with the link can
// act as anyone). Each player still gets their own session, so "your picks", locks and hidden picks keep working
// per person. The account password is derived on the server from the secret key and never leaves it.
const secretFor = (playerId: string) =>
  createHmac("sha256", process.env.SUPABASE_SECRET_KEY!).update(`bake-pool-enter:${playerId}`).digest("hex");

// The names on the sign-in screen.
export async function GET() {
  if (!process.env.SUPABASE_SECRET_KEY) return NextResponse.json({ error: "Sign-in isn't set up yet (missing server key)." }, { status: 503 });
  const { data, error } = await adminClient().from("players").select("id,name,initial").eq("kind", "human").order("sort");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ players: data ?? [] });
}

// Sign in as { player }.
export async function POST(req: Request) {
  if (!process.env.SUPABASE_SECRET_KEY) return NextResponse.json({ error: "Sign-in isn't set up yet (missing server key)." }, { status: 503 });
  const player = String((await req.json().catch(() => ({}))).player ?? "");
  const admin = adminClient();
  const { data: p } = await admin.from("players").select("id,email,kind").eq("id", player).maybeSingle();
  if (!p || p.kind !== "human") return NextResponse.json({ error: "Pick your name." }, { status: 400 });
  if (!p.email) return NextResponse.json({ error: "Brad needs to add your email in the menu first." }, { status: 403 });

  const password = secretFor(p.id);
  const sb = await userClient();
  let { error } = await sb.auth.signInWithPassword({ email: p.email, password });
  if (error) {
    // First time (the account only had email links, or doesn't exist yet): give it the derived password.
    let id: string | undefined;
    for (let page = 1; !id; page++) {
      const { data, error: e } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (e) return NextResponse.json({ error: e.message }, { status: 500 });
      id = data.users.find((u) => u.email?.toLowerCase() === p.email!.toLowerCase())?.id;
      if (data.users.length < 200) break;
    }
    const res = id
      ? await admin.auth.admin.updateUserById(id, { password })
      : await admin.auth.admin.createUser({ email: p.email, password, email_confirm: true });
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
    ({ error } = await sb.auth.signInWithPassword({ email: p.email, password }));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
