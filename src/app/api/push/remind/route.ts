import { NextResponse } from "next/server";
import { loadSeason } from "@/lib/data";
import { thursdayReminders } from "@/lib/notify";
import { adminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Scheduled every 15 minutes on Thursdays (Supabase timer): picks-due reminders and the Claude safety-net alert.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = adminClient();
    return NextResponse.json(await thursdayReminders(sb, await loadSeason(sb)));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
