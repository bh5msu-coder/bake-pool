import { NextResponse } from "next/server";
import { syncAts } from "@/lib/atsSync";
import { adminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Scheduled every 3 hours (Supabase timer): store newly finished NFL/FBS games for the ATS records.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = adminClient();
    const { data } = await sb.from("settings").select("value").eq("key", "season").maybeSingle();
    return NextResponse.json(await syncAts(sb, Number(data?.value ?? new Date().getFullYear())));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
