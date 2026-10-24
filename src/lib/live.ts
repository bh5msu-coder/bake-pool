import "server-only";
// Live scores for a week, and the job that records finished games as results.
import type { SupabaseClient } from "@supabase/supabase-js";
import { pushDue } from "./push";
import { elimTeam, type Game } from "./scoring";
import { elimOutcome, fetchScoreboard, liveFor, matchGame, weekDays, type League, type LiveGame, type ScoreEvent } from "./scores";

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
  const elim = await gradeElim(sb, (weeks ?? []).filter((x) => inWindow(x.deadline, now) && Date.parse(x.deadline!) <= now));
  const changed = report.some((r) => r.graded.length) || elim.length > 0;
  const pushed = changed && process.env.GOOGLE_SERVICE_ACCOUNT_KEY && process.env.SHEET_ID
    ? await pushDue(sb, process.env.SHEET_ID).then((p) => p.map((x) => `${x.week}: ${x.cells} cells`)).catch((e: Error) => e.message)
    : null;
  return { report, elim, pushed };
}

/** Records the eliminator outcome (survived / life lost) for locked weeks once the group's team has played. */
async function gradeElim(sb: SupabaseClient, weeks: { id: number; week: number; label: string | null; deadline: string | null }[]) {
  if (!weeks.length) return [];
  const ids = weeks.map((w) => w.id);
  const [{ data: players }, { data: votes }, { data: settled }] = await Promise.all([
    sb.from("players").select("id").eq("kind", "human"),
    sb.from("elim_picks").select("week_id,player_id,team").in("week_id", ids),
    sb.from("elim_weeks").select("week_id,override_team,outcome").in("week_id", ids),
  ]);
  const humanIds = (players ?? []).map((p) => p.id as string);
  const done: string[] = [];
  for (const w of weeks) {
    const ew = (settled ?? []).find((x) => x.week_id === w.id);
    if (ew?.outcome) continue; // never overwrite a result someone already entered
    const picks = Object.fromEntries((votes ?? []).filter((v) => v.week_id === w.id).map((v) => [v.player_id, v.team]));
    const team = elimTeam({ picks, override: ew?.override_team ?? null }, humanIds);
    if (!team) continue;
    const outcome = elimOutcome(team, await eventsFor([{ league: "NFL" }], w.deadline!, 0));
    if (!outcome) continue;
    const { error } = await sb.from("elim_weeks").upsert({ week_id: w.id, outcome });
    if (!error) done.push(`${w.label ?? `Week ${w.week}`}: ${team} → ${outcome}`);
  }
  return done;
}
