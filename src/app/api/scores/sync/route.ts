import { NextResponse } from "next/server";
import { loadSeason } from "@/lib/data";
import { gradeFinals } from "@/lib/live";
import { resultPushes } from "@/lib/notify";
import { adminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Scheduled every 10 minutes (Supabase timer): record results for games that have gone final.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = adminClient();
    const { finals, ...graded } = await gradeFinals(sb);
    // Then tell people what happened: picks revealed, week recap, eliminator result, and (for those who asked) each final.
    // A notification problem never fails the grading run.
    const notified = await loadSeason(sb).then((season) => resultPushes(sb, season, finals)).catch((e: Error) => ({ error: e.message }));
    return NextResponse.json({ ...graded, notified });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
