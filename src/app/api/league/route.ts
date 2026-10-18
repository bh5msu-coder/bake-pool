import { NextResponse } from "next/server";
import { loadSeason } from "@/lib/data";
import { leagueView } from "@/lib/leagueData";
import { userClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// THE POOL standings, money, elimination and championship odds, from BAKE's point of view. Members only.
export async function GET(req: Request) {
  try {
    if (process.env.NODE_ENV !== "production" && new URL(req.url).searchParams.has("demo")) {
      const { fixtureSeason } = await import("@/lib/fixture");
      return NextResponse.json(await leagueView(fixtureSeason()));
    }
    const sb = await userClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    return NextResponse.json(await leagueView(await loadSeason(sb)), { headers: { "cache-control": "private, max-age=120" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
