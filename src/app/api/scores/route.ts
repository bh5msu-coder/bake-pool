import { NextResponse } from "next/server";
import { liveScores } from "@/lib/live";
import type { Game } from "@/lib/scoring";
import { userClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Live scores and who's covering for one week. Members only (the games are read through RLS).
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  // Local demo only: real scores for a week of the bundled sheet data, no sign-in.
  if (process.env.NODE_ENV !== "production" && q.get("demoWeek")) {
    const { fixtureSeason } = await import("@/lib/fixture");
    const w = fixtureSeason().weeks.find((x) => x.week === Number(q.get("demoWeek")));
    if (!w?.deadline) return NextResponse.json({ games: [] });
    return NextResponse.json({ games: await liveScores(w.games, w.deadline) });
  }
  const weekId = Number(q.get("weekId"));
  if (!Number.isInteger(weekId)) return NextResponse.json({ error: "Missing weekId." }, { status: 400 });
  const sb = await userClient();
  const { data: week } = await sb.from("weeks").select("id,deadline").eq("id", weekId).maybeSingle();
  if (!week) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!week.deadline) return NextResponse.json({ games: [] });
  const { data: rows } = await sb.from("games").select("num,league,away,home,fav,spread,line,result").eq("week_id", weekId);
  const games = (rows ?? []).map((r) => ({ ...r, spread: Number(r.spread), picks: {} })) as Game[];
  try {
    return NextResponse.json({ games: await liveScores(games, week.deadline), at: new Date().toISOString() },
      { headers: { "cache-control": "private, max-age=20" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
