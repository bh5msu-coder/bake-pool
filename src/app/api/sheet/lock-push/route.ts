import { NextResponse } from "next/server";
import { loadSeason } from "@/lib/data";
import { pushWeek } from "@/lib/push";
import { groupLocked, isOpen } from "@/lib/scoring";
import { adminClient, userClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Called by the app when the last person locks: the group entry is final, so write it to the sheet now
// instead of waiting for the deadline. Members only; does nothing unless the whole group really has locked,
// and only once per set of locks.
export async function POST(req: Request) {
  const sb = await userClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { data: me } = await sb.from("players").select("id").ilike("email", user.email).maybeSingle();
  if (!me) return NextResponse.json({ error: "Members only." }, { status: 403 });

  const weekId = Number((await req.json().catch(() => ({}))).weekId);
  if (!Number.isInteger(weekId)) return NextResponse.json({ error: "Missing weekId." }, { status: 400 });
  const sheetId = process.env.SHEET_ID;
  if (!sheetId) return NextResponse.json({ error: "SHEET_ID is not set." }, { status: 500 });

  try {
    const admin = adminClient();
    const season = await loadSeason(admin);
    const week = season.weeks.find((w) => w.id === weekId);
    if (!week || !isOpen(week) || !groupLocked(week, season.players)) return NextResponse.json({ pushed: [] });

    const [{ data: w }, { data: last }] = await Promise.all([
      admin.from("weeks").select("sheet_pushed_at").eq("id", weekId).single(),
      admin.from("pick_locks").select("locked_at").eq("week_id", weekId).order("locked_at", { ascending: false }).limit(1).single(),
    ]);
    if (w?.sheet_pushed_at && last && Date.parse(w.sheet_pushed_at) >= Date.parse(last.locked_at)) return NextResponse.json({ pushed: [] });
    return NextResponse.json({ pushed: [await pushWeek(admin, sheetId, weekId)] });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
