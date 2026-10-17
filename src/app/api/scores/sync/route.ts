import { NextResponse } from "next/server";
import { gradeFinals } from "@/lib/live";
import { adminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Scheduled every 10 minutes (Supabase timer): record results for games that have gone final.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await gradeFinals(adminClient()));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
