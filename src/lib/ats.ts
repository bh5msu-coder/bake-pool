// Against-the-spread records from ESPN. The scoreboard gives scores; each game's summary has the closing line
// (pickcenter, DraftKings): `spread` is the home team's line, negative when the home team is favoured.
import type { League, ScoreTeam } from "./scores";
import { teamMatches } from "./scores";

export interface AtsGame {
  event_id: string; league: League; season: number; week: number;
  home_id: string; away_id: string; home_score: number; away_score: number;
  home_spread: number | null; cover: "home" | "away" | "push" | null;
}

/** Who covered: the home margin plus the home line decides it. Null without a line. */
export function atsCover(homeScore: number, awayScore: number, homeSpread: number | null): AtsGame["cover"] {
  if (homeSpread === null || !Number.isFinite(homeSpread)) return null;
  const m = homeScore - awayScore + homeSpread;
  return m > 0 ? "home" : m < 0 ? "away" : "push";
}

/** "4-3" or "4-2-1" per ESPN team id, from the stored games. */
export function atsRecords(games: Pick<AtsGame, "home_id" | "away_id" | "cover">[]) {
  const rec = new Map<string, { w: number; l: number; p: number }>();
  const get = (id: string) => rec.get(id) ?? (rec.set(id, { w: 0, l: 0, p: 0 }), rec.get(id)!);
  for (const g of games) {
    if (!g.cover) continue;
    const h = get(g.home_id), a = get(g.away_id);
    if (g.cover === "push") { h.p++; a.p++; } else if (g.cover === "home") { h.w++; a.l++; } else { a.w++; h.l++; }
  }
  return new Map([...rec].map(([id, r]) => [id, `${r.w}-${r.l}${r.p ? `-${r.p}` : ""}`]));
}

/** The ESPN team id for a team name as the sheet writes it. */
export function teamIdFor(sheetName: string, league: League, teams: { team_id: string; names: string[] }[]) {
  return teams.find((t) => teamMatches(sheetName, league, { names: t.names, score: null } as ScoreTeam))?.team_id ?? null;
}
