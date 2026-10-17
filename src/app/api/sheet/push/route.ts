import { NextResponse } from "next/server";
import { pushDue, pushWeek } from "@/lib/push";
import { adminClient, requireAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const sheetId = () => {
  const id = process.env.SHEET_ID;
  if (!id) throw new Error("SHEET_ID is not set.");
  return id;
};

// Scheduled (Supabase timer right after the deadline, plus the daily job): write any week that just locked.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ pushed: await pushDue(adminClient(), sheetId()) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Admin "Push to sheet now": { weekId }.
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const weekId = Number(body.weekId);
  if (!Number.isInteger(weekId)) return NextResponse.json({ error: "Missing weekId." }, { status: 400 });
  try {
    return NextResponse.json({ pushed: [await pushWeek(adminClient(), sheetId(), weekId)] });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
