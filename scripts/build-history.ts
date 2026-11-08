// One-off: turns the 2024-25 and 2025-26 Picks tabs (exported as JSON grids) into src/lib/history.json.
// Usage: npx tsx scripts/build-history.ts /tmp/24_Picks.json /tmp/25_Picks.json
import { readFileSync, writeFileSync } from "node:fs";
import { matchTeam, NFL_TEAMS, normLabel, parseLine, resolveFav } from "../src/lib/sheet";

const PERIOD_RE = /^(Week\s+\d+|Bowl|CFP|Playoffs?)$/i;
type Cols = { pickers: Record<string, number>; result: number; entry?: number; league: number };
const SEASONS: { season: string; file: string; cols: Cols; names: Record<string, string> }[] = [
  { season: "2024-25", file: process.argv[2], names: { brad: "Brad", andrew: "Andrew" },
    cols: { pickers: { brad: 6, andrew: 7 }, result: 10, league: 34 } },
  { season: "2025-26", file: process.argv[3], names: { brad: "Brad", andrew: "Andrew", kevin: "Kevin", eric: "Eric" },
    cols: { pickers: { brad: 6, andrew: 7, kevin: 8, eric: 9 }, entry: 10, result: 13, league: 33 } },
];
const FAV_FIX: Record<string, string> = {
  "2024-25|South Florida|San Jose State": "San Jose State",
  "2025-26|Iowa State|Iowa": "Iowa State",
  "2025-26|Kansas State|Kansas": "Kansas",
  "2025-26|Virginia Tech|Virginia": "Virginia",
}; // "season|away|home" -> fav, for lines the resolver can't read
const out: unknown[] = [];
const problems: string[] = [];
for (const s of SEASONS) {
  const grid: string[][] = JSON.parse(readFileSync(s.file, "utf8")).values;
  const c = (r: number, i: number) => (grid[r]?.[i] ?? "").trim();
  let week = "";
  for (let r = 0; r < grid.length; r++) {
    const a = c(r, 0);
    if (PERIOD_RE.test(a)) { week = normLabel(a); continue; }
    if (!week || a === "Away" || a === "Game" || !a) continue;
    const away = a, home = c(r, 1), line = c(r, 2), p = parseLine(line);
    if (!home || !p) continue;
    const result = matchTeam(c(r, s.cols.result), away, home);
    if (!result) continue; // ungraded or empty row
    const fav = FAV_FIX[`${s.season}|${away}|${home}`] ?? resolveFav(p.abbr, away, home);
    if (!fav) { problems.push(`${s.season} ${week} ${away} @ ${home} "${line}"`); continue; }
    const picks: Record<string, string> = {};
    for (const [id, col] of Object.entries(s.cols.pickers)) {
      const raw = c(r, col);
      const t = matchTeam(raw, away, home);
      if (t) picks[id] = t; else if (raw) problems.push(`${s.season} ${week} ${id} "${raw}" for ${away}/${home}`);
    }
    const lg = c(r, s.cols.league);
    // The sheets' own league column drifts (2025-26 tags many NFL games NCAA), so go by team names.
    void lg;
    const league = NFL_TEAMS.has(away) && NFL_TEAMS.has(home) ? "NFL" : "NCAA";
    const entry = s.cols.entry !== undefined ? matchTeam(c(r, s.cols.entry), away, home) : null;
    out.push({ s: s.season, w: week, lg: league, a: away, h: home, f: fav, sp: p.spread, r: result, p: picks, ...(entry ? { e: entry } : {}) });
  }
}
writeFileSync("src/lib/history.json", JSON.stringify({ seasons: SEASONS.map((s) => ({ id: s.season, players: s.names })), games: out }));
console.log(out.length, "games");
for (const p of problems) console.log("PROBLEM", p);
