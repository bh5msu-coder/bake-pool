import { NextResponse } from "next/server";
import { syncOpenWeek } from "@/lib/sheetSync";
import { adminClient, requireAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const sheetId = () => {
  const id = process.env.SHEET_ID;
  if (!id) throw new Error("SHEET_ID is not set.");
  return id;
};

// Scheduled every 10 minutes (Supabase timer): two-way picks sync for the open week, latest change wins.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await syncOpenWeek(adminClient(), sheetId(), "auto"));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Admin buttons: { mode: "import" } takes the sheet's picks, { mode: "export" } writes the app's.
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const mode = (await req.json().catch(() => ({}))).mode;
  if (mode !== "import" && mode !== "export") return NextResponse.json({ error: "mode must be import or export." }, { status: 400 });
  try {
    return NextResponse.json(await syncOpenWeek(adminClient(), sheetId(), mode));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
