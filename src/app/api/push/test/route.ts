import { NextResponse } from "next/server";
import { notify } from "@/lib/notify";
import { adminClient, userClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// "Send me a test" from the menu: a notification to every device of the signed-in player.
export async function POST() {
  const sb = await userClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const admin = adminClient();
  const { data: p } = await admin.from("players").select("id").ilike("email", user.email).maybeSingle();
  if (!p) return NextResponse.json({ error: "Members only." }, { status: 403 });
  try {
    const sent = await notify(admin, [p.id], { title: "BAKE Pool", body: "Notifications are working on this device.", url: "/" });
    return NextResponse.json({ sent });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
