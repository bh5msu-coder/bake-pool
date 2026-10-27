import "server-only";
// Fills ats_games with every finished NFL and FBS game of the season, a few dozen at a time, and serves ATS
// records for the pool's games.
import type { SupabaseClient } from "@supabase/supabase-js";
import { atsCover, atsRecords, teamIdFor, type AtsGame } from "./ats";
import type { League } from "./scores";

const BASE: Record<League, string> = {
  NFL: "https://site.api.espn.com/apis/site/v2/sports/football/nfl",
  NCAA: "https://site.api.espn.com/apis/site/v2/sports/football/college-football",
};
const WEEKS: Record<League, number> = { NFL: 18, NCAA: 16 };

/* eslint-disable @typescript-eslint/no-explicit-any */
const names = (t: any) => [t.location, t.shortDisplayName, t.displayName, t.abbreviation, t.name].filter(Boolean) as string[];

/** One run: finds finished games not stored yet and stores them with their closing line. `budget` caps summary requests. */
export async function syncAts(sb: SupabaseClient, season: number, budget = 120) {
  let used = 0;
  const added: Record<League, number> = { NFL: 0, NCAA: 0 };
  for (const league of ["NFL", "NCAA"] as League[]) {
    const { data: have } = await sb.from("ats_games").select("event_id").eq("league", league).eq("season", season);
    const known = new Set((have ?? []).map((r) => r.event_id as string));
    for (let week = 1; week <= WEEKS[league] && used < budget; week++) {
      const q = `seasontype=2&week=${week}&dates=${season}` + (league === "NCAA" ? "&groups=80&limit=400" : "");
      const res = await fetch(`${BASE[league]}/scoreboard?${q}`, { cache: "no-store" });
      if (!res.ok) break;
      const events = ((await res.json()).events ?? []) as any[];
      const finished = events.filter((e) => e.competitions?.[0]?.status?.type?.completed);
      if (!finished.length) break; // reached the weeks still to be played
      const teams: { league: League; team_id: string; names: string[] }[] = [];
      const rows: AtsGame[] = [];
      for (const e of finished) {
        if (known.has(String(e.id)) || used >= budget) continue;
        const c = e.competitions[0];
        const home = c.competitors.find((x: any) => x.homeAway === "home"), away = c.competitors.find((x: any) => x.homeAway === "away");
        if (!home?.team || !away?.team) continue;
        used++;
        const sum = await fetch(`${BASE[league]}/summary?event=${e.id}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        const line = Number(sum?.pickcenter?.[0]?.spread);
        const homeSpread = Number.isFinite(line) ? line : null;
        const hs = Number(home.score), as = Number(away.score);
        rows.push({
          event_id: String(e.id), league, season, week, home_id: String(home.team.id), away_id: String(away.team.id),
          home_score: hs, away_score: as, home_spread: homeSpread, cover: atsCover(hs, as, homeSpread),
        });
        teams.push({ league, team_id: String(home.team.id), names: names(home.team) }, { league, team_id: String(away.team.id), names: names(away.team) });
      }
      if (rows.length) {
        const r1 = await sb.from("ats_games").upsert(rows);
        if (r1.error) throw new Error(r1.error.message);
        const unique = [...new Map(teams.map((t) => [`${t.league}:${t.team_id}`, t])).values()];
        const r2 = await sb.from("ats_teams").upsert(unique);
        if (r2.error) throw new Error(r2.error.message);
        added[league] += rows.length;
      }
    }
  }
  return { added, requests: used };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** ATS record ("4-3") for each team name of these games, by league. Unknown teams are left out. */
export async function atsForGames(sb: SupabaseClient, season: number, games: { league: League; away: string; home: string }[]) {
  const out = new Map<string, string>();
  for (const league of [...new Set(games.map((g) => g.league))]) {
    const [{ data: rows }, { data: teams }] = await Promise.all([
      sb.from("ats_games").select("home_id,away_id,cover").eq("league", league).eq("season", season),
      sb.from("ats_teams").select("team_id,names").eq("league", league),
    ]);
    const recs = atsRecords((rows ?? []) as AtsGame[]);
    for (const g of games.filter((x) => x.league === league)) {
      for (const name of [g.away, g.home]) {
        const id = teamIdFor(name, league, (teams ?? []) as { team_id: string; names: string[] }[]);
        if (id && recs.has(id)) out.set(`${league}:${name}`, recs.get(id)!);
      }
    }
  }
  return out;
}
