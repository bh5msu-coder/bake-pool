import "server-only";
// Live scores for a week, and the job that records finished games as results.
import type { SupabaseClient } from "@supabase/supabase-js";
import { pushDue } from "./push";
import type { Game } from "./scoring";
import { fetchScoreboard, liveFor, matchGame, weekDays, type League, type LiveGame, type ScoreEvent } from "./scores";

async function eventsFor(games: Pick<Game, "league">[], deadline: string, revalidate: number) {
  const leagues = [...new Set(games.map((g) => g.league))] as League[];
  const days = weekDays(deadline);
  const lists = await Promise.all(leagues.flatMap((l) => days.map((d) => fetchScoreboard(l, d, revalidate).catch(() => [] as ScoreEvent[]))));
  return lists.flat();
}

export async function liveScores(games: Game[], deadline: string, revalidate = 30): Promise<LiveGame[]> {
  const events = await eventsFor(games, deadline, revalidate);
  return games.flatMap((g) => { const l = liveFor(g, matchGame(g, events)); return l ? [l] : []; });
}

/** Weeks whose games are being played now: from a day before the deadline to 8 days after. */
const inWindow = (deadline: string | null, now: number) =>
  !!deadline && now >= Date.parse(deadline) - 864e5 && now <= Date.parse(deadline) + 8 * 864e5;

/**
 * Records the cover winner for every finished game that has no result yet.
 * Never overwrites a result someone already entered. Then refreshes the sheet if anything changed.
 */
export async function gradeFinals(sb: SupabaseClient, now = Date.now()) {
  const { data: weeks, error } = await sb.from("weeks").select("id,week,label,deadline");
  if (error) throw new Error(error.message);
  const report: { week: string; graded: string[]; unmatched: string[] }[] = [];
  for (const w of (weeks ?? []).filter((x) => inWindow(x.deadline, now))) {
    const { data: rows } = await sb.from("games").select("id,num,league,away,home,fav,spread,line,result").eq("week_id", w.id);
    const games = (rows ?? []).map((r) => ({ ...r, spread: Number(r.spread), picks: {} })) as (Game & { id: number })[];
    const open = games.filter((g) => !g.result);
    if (!open.length) continue;
    const events = await eventsFor(open, w.deadline!, 0);
    const graded: string[] = [], unmatched: string[] = [];
    for (const g of open) {
      const m = matchGame(g, events);
      if (!m) { unmatched.push(`${g.away} at ${g.home}`); continue; }
      const live = liveFor(g, m);
      if (!live?.completed || !live.covering) continue;
      const { error: uErr } = await sb.from("games").update({ result: live.covering }).eq("id", g.id).is("result", null);
      if (!uErr) graded.push(`${g.away} at ${g.home} → ${live.covering} (${live.awayScore}-${live.homeScore})`);
    }
    report.push({ week: w.label ?? `Week ${w.week}`, graded, unmatched });
  }
  const changed = report.some((r) => r.graded.length);
  const pushed = changed && process.env.GOOGLE_SERVICE_ACCOUNT_KEY && process.env.SHEET_ID
    ? await pushDue(sb, process.env.SHEET_ID).then((p) => p.map((x) => `${x.week}: ${x.cells} cells`)).catch((e: Error) => e.message)
    : null;
  return { report, pushed };
}
