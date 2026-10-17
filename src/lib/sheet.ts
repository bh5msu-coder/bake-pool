// Reads the shared BAKE Google Sheet. The sheet must be shared
// "Anyone with the link can view"; tabs are pulled as CSV.
import Papa from "papaparse";
import fixture from "@/fixtures/season2026.json";
import type { Game } from "./scoring";

export type Grid = string[][];
/** Returns one tab of the sheet as a grid of strings. */
export type TabReader = (tab: string) => Promise<Grid>;
/** Reads tabs of a link-shared sheet, looking up tab ids once per reader. */
export const publicSheet = (sheetId: string): TabReader => {
  let ids: Promise<Map<string, string>> | null = null;
  return async (tab) => {
    ids ??= tabIds(sheetId);
    const gid = (await ids).get(tab);
    if (gid === undefined) throw new Error(`The sheet has no tab named "${tab}".`);
    return fetchTab(sheetId, tab, gid);
  };
};

const PERIOD_RE = /^(Week\s+\d+|Bowl|CFP|Playoffs?)$/i;
/** "Week 7" stays as is; "Playoff" and "Playoffs" both become "Playoffs". */
export const normLabel = (s: string) => {
  const t = s.trim().replace(/\s+/g, " ");
  if (/^week \d+$/i.test(t)) return "Week " + t.split(" ")[1];
  if (/^playoffs?$/i.test(t)) return "Playoffs";
  return t.toUpperCase() === "CFP" ? "CFP" : t[0].toUpperCase() + t.slice(1).toLowerCase();
};

export const NFL_TEAMS = new Set([
  "Arizona", "Atlanta", "Baltimore", "Buffalo", "Carolina", "Chicago", "Cincinnati", "Cleveland",
  "Dallas", "Denver", "Detroit", "Green Bay", "Houston", "Indianapolis", "Jacksonville", "Kansas City",
  "Las Vegas", "LA Chargers", "LA Rams", "Miami", "Minnesota", "New England", "New Orleans", "NY Giants",
  "NY Jets", "Philadelphia", "Pittsburgh", "San Francisco", "Seattle", "Tampa Bay", "Tennessee", "Washington",
]);

export const GAMES_PER_WEEK = 30;

const NOT_SHARED = "The sheet isn't shared publicly. In Google Sheets: Share → General access → Anyone with the link → Viewer.";
const base = (sheetId: string) => `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}`;

/** Tab name → gid, read from the sheet's public HTML view. */
export async function tabIds(sheetId: string, init?: RequestInit): Promise<Map<string, string>> {
  const res = await fetch(`${base(sheetId)}/htmlview`, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? NOT_SHARED : `Google Sheets returned ${res.status}.`);
  const ids = new Map<string, string>();
  for (const m of (await res.text()).matchAll(/name: "((?:[^"\\]|\\.)+)", pageUrl: "[^"]*?gid=(\d+)/g))
    ids.set(JSON.parse(`"${m[1]}"`), m[2]);
  if (!ids.size) throw new Error(NOT_SHARED);
  return ids;
}

/**
 * Downloads one tab as CSV via the export link, which keeps every row in place.
 * (Google's quicker "gviz" CSV reshuffles header-like rows on this sheet, so it isn't used.)
 */
export async function fetchTab(sheetId: string, tab: string, gid?: string, init?: RequestInit): Promise<Grid> {
  const id = gid ?? (await tabIds(sheetId, init)).get(tab);
  if (id === undefined) throw new Error(`The sheet has no tab named "${tab}".`);
  const res = await fetch(`${base(sheetId)}/export?format=csv&gid=${id}`, { cache: "no-store", ...init });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.includes("csv"))
    throw new Error(res.status === 401 || type.includes("html") ? NOT_SHARED : `Google Sheets returned ${res.status} for tab "${tab}".`);
  return parseCsv(await res.text());
}

export function parseCsv(text: string): Grid {
  const out = Papa.parse<string[]>(text, { skipEmptyLines: false });
  return out.data.map((r) => r.map((c) => (c ?? "").trim()));
}

const cell = (g: Grid, r: number, c: number) => g[r]?.[c]?.trim() ?? "";
const LINE_RE = /^(.+?)\s+([-+]?\d+(?:\.\d+)?)$/;

/** Parses "SEA -2.5" into its abbreviation and absolute spread. */
export function parseLine(line: string): { abbr: string; spread: number } | null {
  const m = LINE_RE.exec(line.trim());
  return m ? { abbr: m[1].trim(), spread: Math.abs(parseFloat(m[2])) } : null;
}

// Abbreviations already used on this season's sheet, e.g. "BAMA" → "Alabama".
const KNOWN_ABBR = new Map<string, string>();
for (const w of (fixture as { weeks: { games: { line: string; fav: string }[] }[] }).weeks)
  for (const g of w.games) {
    const p = parseLine(g.line);
    if (p) KNOWN_ABBR.set(p.abbr.toUpperCase(), g.fav);
  }

const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const isSubseq = (needle: string, hay: string) => {
  let i = 0;
  for (const ch of hay) if (ch === needle[i]) i++;
  return i === needle.length;
};

/** Works out which team an abbreviation like "LAR" or "BAMA" names. */
export function resolveFav(abbr: string, away: string, home: string): string | null {
  const known = KNOWN_ABBR.get(abbr.toUpperCase());
  if (known === away || known === home) return known;
  const a = letters(abbr);
  for (const key of [a, a.replace(/^u/, "")]) {
    const hits = [away, home].filter((t) => isSubseq(key, letters(t)));
    if (hits.length === 1) return hits[0];
    if (hits.length === 2) {
      const first = hits.filter((t) => letters(t)[0] === key[0]);
      if (first.length === 1) return first[0];
    }
  }
  const byFirst = [away, home].filter((t) => letters(t)[0] === a[0]);
  return byFirst.length === 1 ? byFirst[0] : null;
}

function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Matches a typed team name to one of the game's teams, forgiving case and small typos ("Virgina Tech"). */
export function matchTeam(typed: string, away: string, home: string): string | null {
  const t = typed.trim();
  if (!t) return null;
  if (t === away || t === home) return t;
  const scored = [away, home].map((team) => ({ team, d: distance(letters(t), letters(team)) })).sort((x, y) => x.d - y.d);
  return scored[0].d <= 2 && scored[0].d < scored[1].d ? scored[0].team : null;
}

export interface ParsedGame extends Omit<Game, "picks" | "result"> {
  problem?: string;
}

/**
 * Converter tab: one game per column. Row 1 away, row 2 home, row 3 favourite,
 * row 4 spread, row 5 the line as printed ("SEA -2.5"). The first 30 complete
 * columns are the week's slate; anything after that is scratch space.
 */
export function parseConverter(grid: Grid, count = GAMES_PER_WEEK): ParsedGame[] {
  const games: ParsedGame[] = [];
  const width = Math.max(0, ...grid.slice(0, 5).map((r) => r.length));
  for (let c = 0; c < width && games.length < count; c++) {
    const away = cell(grid, 0, c), home = cell(grid, 1, c);
    if (!away || !home || away === home) continue;
    let fav = cell(grid, 2, c);
    const line = cell(grid, 4, c);
    const parsed = parseLine(line);
    const spreadCell = parseFloat(cell(grid, 3, c));
    const spread = Number.isFinite(spreadCell) ? Math.abs(spreadCell) : parsed?.spread ?? NaN;
    if (fav !== away && fav !== home) fav = (parsed && resolveFav(parsed.abbr, away, home)) ?? "";
    const league = NFL_TEAMS.has(away) && NFL_TEAMS.has(home) ? "NFL" : "NCAA";
    const problem = !fav ? "Can't tell which team is favoured" : !Number.isFinite(spread) ? "No spread" : undefined;
    games.push({ num: games.length + 1, league, away, home, fav: fav || home, spread: Number.isFinite(spread) ? spread : 0, line, problem });
  }
  return games;
}

// ---------- history tabs ----------

const PICK_COLS = { away: 0, home: 1, line: 2, brad: 6, andrew: 7, kevin: 8, eric: 9, majority: 10, claude: 11, lock: 12, override: 13, result: 14, league: 34 };

export interface HistoryGame extends ParsedGame {
  picks: Record<string, string>;
  result: string | null;
  sheetMajority: string | null;
  override: string | null;
}

/** Picks tab: blocks starting with a "Week N" / "Bowl" / "CFP" row, then two header rows, then the games. Keyed by label. */
export function parsePicksTab(grid: Grid): Map<string, HistoryGame[]> {
  const out = new Map<string, HistoryGame[]>();
  let week = "";
  for (let r = 0; r < grid.length; r++) {
    const a = cell(grid, r, 0);
    if (PERIOD_RE.test(a)) { week = normLabel(a); out.set(week, []); continue; }
    if (!week || a === "Away" || a === "Game") continue;
    const away = a, home = cell(grid, r, PICK_COLS.home), line = cell(grid, r, PICK_COLS.line);
    const parsed = parseLine(line);
    if (!away || !home || !parsed) continue;
    const v = (k: keyof typeof PICK_COLS) => matchTeam(cell(grid, r, PICK_COLS[k]), away, home);
    const picks: Record<string, string> = {};
    for (const p of ["brad", "andrew", "kevin", "eric", "claude"] as const) { const x = v(p); if (x) picks[p] = x; }
    const fav = resolveFav(parsed.abbr, away, home);
    const lg = cell(grid, r, PICK_COLS.league);
    const games = out.get(week)!;
    games.push({
      num: games.length + 1,
      league: lg === "NFL" || lg === "NCAA" ? lg : NFL_TEAMS.has(away) ? "NFL" : "NCAA",
      away, home, fav: fav ?? home, spread: parsed.spread, line,
      problem: fav ? undefined : "Can't tell which team is favoured",
      picks, result: v("result"), sheetMajority: v("majority"), override: v("override"),
    });
  }
  for (const [w, g] of out) if (!g.length) out.delete(w);
  return out;
}

/** Eliminator tab: Week | Brad | Andrew | Kevin | Eric | Majority. */
export function parseEliminatorTab(grid: Grid) {
  const out = new Map<number, { picks: Record<string, string>; majority: string | null }>();
  for (const row of grid) {
    const w = parseInt(row[0] ?? "", 10);
    if (!Number.isFinite(w) || String(w) !== (row[0] ?? "").trim()) continue;
    const picks: Record<string, string> = {};
    ["brad", "andrew", "kevin", "eric"].forEach((p, i) => { if (row[i + 1]?.trim()) picks[p] = row[i + 1].trim(); });
    if (Object.keys(picks).length || row[5]?.trim()) out.set(w, { picks, majority: row[5]?.trim() || null });
  }
  return out;
}

const dollars = (s: string) => {
  const n = parseFloat(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export interface Period { order: number; label: string; games: number; winnings: number; start?: number } // start = first game row on the Picks tab

/**
 * Summary tab: Week | Entry | $ Won | Line Start | Line End, one row per period in season order
 * (1-15, Bowl, 16-18, CFP, Playoff), then a Total row whose Entry cell is the season fee.
 */
export function parseSummaryTab(grid: Grid) {
  const periods: Period[] = [];
  let seasonFee: number | null = null;
  for (const row of grid) {
    const a = (row[0] ?? "").trim();
    if (/^total$/i.test(a)) { seasonFee = dollars(row[1] ?? ""); continue; }
    if (!(/^\d+$/.test(a) || PERIOD_RE.test(a)) || !row[1]?.includes("$")) continue;
    const start = parseInt(row[3] ?? "", 10), end = parseInt(row[4] ?? "", 10);
    periods.push({
      order: periods.length + 1, label: normLabel(/^\d+$/.test(a) ? `Week ${a}` : a),
      games: Number.isFinite(start) && Number.isFinite(end) ? end - start + 1 : GAMES_PER_WEEK,
      winnings: dollars(row[2] ?? ""),
      ...(Number.isFinite(start) ? { start } : {}),
    });
  }
  return { periods, seasonFee };
}
