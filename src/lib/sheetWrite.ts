// Works out which cells of the shared sheet to fill with the app's picks.
// Pure: takes the current tab contents and returns cell writes, so it can be tested.
import { humans, type Season, type Week } from "./scoring";
import { matchTeam, type Grid, type Period } from "./sheet";

export interface CellWrite { range: string; values: string[][] }

/** Picks tab columns (A = 1). The sheet's own formulas (Majority, Win/Loss…) are never touched. */
const COL = { away: "A", home: "B", line: "C", brad: "G", andrew: "H", kevin: "I", eric: "J", claude: "L", override: "N", result: "O" } as const;
const PICKERS = ["brad", "andrew", "kevin", "eric", "claude"] as const;

const cell = (g: Grid, r: number, c: number) => (g[r - 1]?.[c] ?? "").trim(); // r is the 1-based sheet row

export interface PicksPlan { writes: CellWrite[]; rows: number; unmatched: string[]; filledGames: boolean }

/**
 * Picks for one week. The week's block starts at `period.start` (from the Summary tab).
 * If the block has no games yet, the games and lines are written too, in app order.
 * Otherwise each app game is matched to its row by team names, so a different row order is fine.
 * Only non-empty values are written: a pick nobody made never blanks out the sheet.
 */
export function planPicks(picksTab: Grid, period: Period, week: Week): PicksPlan {
  const start = period.start;
  if (!start) return { writes: [], rows: 0, unmatched: week.games.map((g) => `${g.away} at ${g.home}`), filledGames: false };
  const size = Math.max(period.games, week.games.length);
  const blockRows = Array.from({ length: size }, (_, i) => start + i);
  const empty = blockRows.every((r) => !cell(picksTab, r, 0) && !cell(picksTab, r, 1));

  const writes: CellWrite[] = [];
  const unmatched: string[] = [];
  const used = new Set<number>();
  week.games.forEach((g, i) => {
    let row: number | undefined;
    if (empty) row = start + i;
    else row = blockRows.find((r) => !used.has(r)
      && matchTeam(cell(picksTab, r, 0), g.away, g.home) === g.away
      && matchTeam(cell(picksTab, r, 1), g.away, g.home) === g.home);
    if (!row) { unmatched.push(`${g.away} at ${g.home}`); return; }
    used.add(row);
    if (empty) writes.push({ range: `Picks!${COL.away}${row}:${COL.line}${row}`, values: [[g.away, g.home, g.line]] });
    for (const p of PICKERS) if (g.picks[p]) writes.push({ range: `Picks!${COL[p]}${row}`, values: [[g.picks[p]]] });
    if (g.entryOverride) writes.push({ range: `Picks!${COL.override}${row}`, values: [[g.entryOverride]] });
    if (g.result && g.result !== "PUSH") writes.push({ range: `Picks!${COL.result}${row}`, values: [[g.result]] });
  });
  return { writes, rows: week.games.length - unmatched.length, unmatched, filledGames: empty };
}

/** Eliminator tab: Week | Brad | Andrew | Kevin | Eric. Only numbered weeks have a row. */
export function planElim(elimTab: Grid, season: Season, week: Week): CellWrite[] {
  const m = /^Week (\d+)$/.exec(week.label ?? `Week ${week.week}`);
  if (!m) return [];
  const r = elimTab.findIndex((row) => (row[0] ?? "").trim() === m[1]);
  if (r < 0) return [];
  const cols = ["B", "C", "D", "E"];
  return humans(season.players).slice(0, 4).flatMap((p, i) =>
    week.elim.picks[p.id] ? [{ range: `Eliminator!${cols[i]}${r + 1}`, values: [[week.elim.picks[p.id]]] }] : []);
}
