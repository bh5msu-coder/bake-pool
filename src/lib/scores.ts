// Live scores from ESPN's public scoreboard feed, matched to the pool's games,
// and the against-the-spread maths. Parsing and matching are pure (tested);
// only fetchScoreboard touches the network.
import type { Game } from "./scoring";

export type League = "NFL" | "NCAA";
export interface ScoreTeam { names: string[]; score: number | null }
export interface ScoreEvent {
  id: string; league: League; date: string;
  state: "pre" | "in" | "post"; detail: string; completed: boolean;
  home: ScoreTeam; away: ScoreTeam;
}

const URL: Record<League, string> = {
  NFL: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",
  NCAA: "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard",
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export function parseScoreboard(json: any, league: League): ScoreEvent[] {
  return (json?.events ?? []).flatMap((e: any): ScoreEvent[] => {
    const c = e?.competitions?.[0];
    const t = c?.status?.type ?? e?.status?.type;
    const side = (h: "home" | "away"): ScoreTeam | null => {
      const x = c?.competitors?.find((k: any) => k.homeAway === h);
      if (!x?.team) return null;
      const tm = x.team;
      const score = x.score === undefined || x.score === "" ? null : Number(x.score);
      return {
        names: [tm.location, tm.shortDisplayName, tm.displayName, tm.abbreviation, tm.name].filter(Boolean),
        score: Number.isFinite(score) ? score : null,
      };
    };
    const home = side("home"), away = side("away");
    if (!home || !away || !t) return [];
    return [{
      id: String(e.id), league, date: e.date, home, away,
      state: t.state === "in" || t.state === "post" ? t.state : "pre",
      detail: t.shortDetail ?? t.detail ?? "", completed: !!t.completed,
    }];
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** One day of a league's scoreboard (ESPN refuses date ranges). Cached briefly by Next's fetch cache. */
export async function fetchScoreboard(league: League, yyyymmdd: string, revalidate = 30): Promise<ScoreEvent[]> {
  const q = league === "NCAA" ? `?dates=${yyyymmdd}&groups=80&limit=300` : `?dates=${yyyymmdd}`;
  const res = await fetch(URL[league] + q, { next: { revalidate } } as RequestInit);
  if (!res.ok) throw new Error(`ESPN ${league} ${yyyymmdd}: ${res.status}`);
  return parseScoreboard(await res.json(), league);
}

// ---------- matching the sheet's team names to ESPN's ----------

/** NFL names as written on the sheet → ESPN abbreviation. */
const NFL_ABBR: Record<string, string> = {
  Arizona: "ARI", Atlanta: "ATL", Baltimore: "BAL", Buffalo: "BUF", Carolina: "CAR", Chicago: "CHI", Cincinnati: "CIN",
  Cleveland: "CLE", Dallas: "DAL", Denver: "DEN", Detroit: "DET", "Green Bay": "GB", Houston: "HOU", Indianapolis: "IND",
  Jacksonville: "JAX", "Kansas City": "KC", "Las Vegas": "LV", "LA Chargers": "LAC", "LA Rams": "LAR", Miami: "MIA",
  Minnesota: "MIN", "New England": "NE", "New Orleans": "NO", "NY Giants": "NYG", "NY Jets": "NYJ", Philadelphia: "PHI",
  Pittsburgh: "PIT", "San Francisco": "SF", Seattle: "SEA", "Tampa Bay": "TB", Tennessee: "TEN", Washington: "WSH",
};

/** College spellings the sheet uses that ESPN writes differently. */
const NCAA_ALIAS: Record<string, string> = {
  "Miami (FL)": "Miami", Pitt: "Pittsburgh", UNC: "North Carolina", Cal: "California", "Ole Miss": "Ole Miss",
  UConn: "UConn", "NC State": "NC State", USC: "USC", UCF: "UCF", UCLA: "UCLA", UAB: "UAB", UTSA: "UTSA", UTEP: "UTEP",
  SMU: "SMU", BYU: "BYU", TCU: "TCU", LSU: "LSU",
};

const norm = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

/** "UTennessee" → "Tennessee": the sheet prefixes some schools with U to tell them apart from NFL cities. */
function collegeName(sheet: string) {
  if (NCAA_ALIAS[sheet]) return NCAA_ALIAS[sheet];
  return /^U[A-Z][a-z]/.test(sheet) ? sheet.slice(1) : sheet;
}

export function teamMatches(sheetName: string, league: League, t: ScoreTeam): boolean {
  if (league === "NFL") {
    const abbr = NFL_ABBR[sheetName];
    return abbr ? t.names.includes(abbr) : t.names.some((n) => norm(n) === norm(sheetName));
  }
  const want = norm(collegeName(sheetName));
  // Location first ("Tennessee"), then the other names, exact after normalising. Exact keeps
  // "Miami" from matching "Miami (OH)" and "Texas" from matching "Texas Tech".
  return t.names.some((n) => norm(n) === want);
}

export interface Matched { event: ScoreEvent; flipped: boolean }

/** Finds the ESPN event for a pool game: both teams must match (either orientation, for neutral sites). */
export function matchGame(g: Pick<Game, "away" | "home" | "league">, events: ScoreEvent[]): Matched | null {
  for (const e of events) {
    if (e.league !== g.league) continue;
    if (teamMatches(g.away, g.league, e.away) && teamMatches(g.home, g.league, e.home)) return { event: e, flipped: false };
    if (teamMatches(g.away, g.league, e.home) && teamMatches(g.home, g.league, e.away)) return { event: e, flipped: true };
  }
  return null;
}

// ---------- against the spread ----------

export interface LiveGame {
  num: number; state: ScoreEvent["state"]; detail: string; completed: boolean;
  awayScore: number | null; homeScore: number | null;
  /** Team currently covering (or that covered), "PUSH", or null before kickoff. */
  covering: string | null;
}

/** Who covers given the scores: the favourite must win by more than the spread. */
export function coverer(g: Pick<Game, "away" | "home" | "fav" | "spread">, awayScore: number, homeScore: number): string {
  const favMargin = g.fav === g.home ? homeScore - awayScore : awayScore - homeScore;
  if (favMargin > g.spread) return g.fav;
  if (favMargin < g.spread) return g.fav === g.home ? g.away : g.home;
  return "PUSH";
}

export function liveFor(g: Game, m: Matched | null): LiveGame | null {
  if (!m) return null;
  const e = m.event;
  const awayScore = m.flipped ? e.home.score : e.away.score;
  const homeScore = m.flipped ? e.away.score : e.home.score;
  const started = e.state !== "pre" && awayScore !== null && homeScore !== null;
  return {
    num: g.num, state: e.state, detail: e.detail, completed: e.completed, awayScore, homeScore,
    covering: started ? coverer(g, awayScore!, homeScore!) : null,
  };
}

/** The calendar days (Central time) to fetch for a week: from the day before the deadline through the following Tuesday. */
export function weekDays(deadlineIso: string): string[] {
  const out: string[] = [];
  const start = Date.parse(deadlineIso) - 864e5;
  for (let i = 0; i < 7; i++) {
    const d = new Date(start + i * 864e5);
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    out.push(parts.replace(/-/g, ""));
  }
  return [...new Set(out)];
}
