import { NextResponse } from "next/server";
import { NOTE_KINDS } from "@/lib/resultNotes";
import { adminClient, userClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function me() {
  const sb = await userClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email) return null;
  const { data } = await adminClient().from("players").select("id").ilike("email", user.email).maybeSingle();
  return data?.id as string | undefined ?? null;
}

// Turn notifications on for this device: { endpoint, keys: { p256dh, auth } } (a browser PushSubscription).
export async function POST(req: Request) {
  const player = await me();
  if (!player) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const sub = await req.json().catch(() => ({}));
  const endpoint = String(sub.endpoint ?? ""), p256dh = String(sub.keys?.p256dh ?? ""), auth = String(sub.keys?.auth ?? "");
  if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) return NextResponse.json({ error: "That isn't a push subscription." }, { status: 400 });
  const { error } = await adminClient().from("push_subs").upsert({ endpoint, player_id: player, p256dh, auth });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Choose which kinds of notification this device gets: { endpoint, prefs: { recap: true, final: false, … } }.
export async function PUT(req: Request) {
  const player = await me();
  if (!player) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const prefs = Object.fromEntries(NOTE_KINDS.map((k) => [k.kind, typeof body.prefs?.[k.kind] === "boolean" ? body.prefs[k.kind] : k.byDefault]));
  const { error } = await adminClient().from("push_subs").update({ prefs }).eq("endpoint", String(body.endpoint ?? "")).eq("player_id", player);
  if (error) return NextResponse.json({ error: "Notification choices aren't available yet. Try again after the next update." }, { status: 503 });
  return NextResponse.json({ ok: true, prefs });
}

// Turn them off for this device: { endpoint }.
export async function DELETE(req: Request) {
  const player = await me();
  if (!player) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { endpoint } = await req.json().catch(() => ({}));
  await adminClient().from("push_subs").delete().eq("endpoint", String(endpoint ?? "")).eq("player_id", player);
  return NextResponse.json({ ok: true });
}
