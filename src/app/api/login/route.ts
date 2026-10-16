import { NextResponse } from "next/server";
import { adminClient, userClient } from "@/lib/supabase/server";

// Sends a sign-in link, but only to emails that belong to a pool member.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });

  // Fail closed: without the secret key we can't check the pool list, so don't send anything.
  if (!process.env.SUPABASE_SECRET_KEY)
    return NextResponse.json({ error: "Sign-in isn't set up yet (missing server key)." }, { status: 503 });
  const { data } = await adminClient().from("players").select("id").ilike("email", email).maybeSingle();
  if (!data) return NextResponse.json({ error: "That email isn't on the pool list. Ask Brad to add it." }, { status: 403 });
  const origin = new URL(req.url).origin;
  const sb = await userClient();
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${origin}/auth/callback` } });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
