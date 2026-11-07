// Works out which cells of the shared sheet to fill with the app's picks.
// Pure: takes the current tab contents and returns cell writes, so it can be tested.
import { humans, labelOf, type Season, type Week } from "./scoring";
import { matchTeam, type Grid, type Period } from "./sheet";

export interface CellWrite { range: string; values: string[][] }

/**
 * Picks tab columns (A = 1). Display order: Brad G, Andrew H, Kevin I, Eric J, Humans K (formula: the 3-of-4 majority
 * only), Claude L, Submitted M (formula: N if set, else K, else L), Human call N, Result O.
 * The sheet's own formulas (Humans, Submitted, Win/Loss…) are never touched.
 */
export const COL = { away: "A", home: "B", line: "C", brad: "G", andrew: "H", kevin: "I", eric: "J", claude: "L", override: "N", result: "O" } as const;
const OVERRIDE_IDX = 13;
export const PICKERS = ["brad", "andrew", "kevin", "eric", "claude"] as const;

export const cell = (g: Grid, r: number, c: number) => (g[r - 1]?.[c] ?? "").trim(); // r is the 1-based sheet row

/** Which sheet row holds each of the week's games (by game number), matched by team names. */
export function weekRows(picksTab: Grid, period: Period, week: Week) {
  const start = period.start;
  const rows = new Map<number, number>();
  if (!start) return { rows, empty: false, first: 0, last: -1 };
  const size = Math.max(period.games, week.games.length);
  const blockRows = Array.from({ length: size }, (_, i) => start + i);
  const empty = blockRows.every((r) => !cell(picksTab, r, 0) && !cell(picksTab, r, 1));
  for (const g of week.games) {
    const row = empty ? start + week.games.indexOf(g) : blockRows.find((r) => ![...rows.values()].includes(r)
      && matchTeam(cell(picksTab, r, 0), g.away, g.home) === g.away
      && matchTeam(cell(picksTab, r, 1), g.away, g.home) === g.home);
    if (row) rows.set(g.num, row);
  }
  return { rows, empty, first: start, last: start + size - 1 };
}

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
    const sheetCall = cell(picksTab, row, OVERRIDE_IDX);
    if (g.entryOverride) { if (sheetCall !== g.entryOverride) writes.push({ range: `Picks!${COL.override}${row}`, values: [[g.entryOverride]] }); }
    // A call cleared in the app clears the sheet's Human call cell (the only blank the app ever writes).
    else if (g.entryOverrideAt && sheetCall) writes.push({ range: `Picks!${COL.override}${row}`, values: [[""]] });
    if (g.result && g.result !== "PUSH") writes.push({ range: `Picks!${COL.result}${row}`, values: [[g.result]] });
  });
  // Safety net: a week's write never reaches another week's rows (past or future) and never blanks a cell.
  const first = start, last = start + size - 1;
  for (const w of writes) {
    const r = Number(/(\d+)$/.exec(w.range)?.[1]);
    const clearsCall = w.range.startsWith(`Picks!${COL.override}`);
    if (!(r >= first && r <= last) || (!clearsCall && w.values.flat().some((v) => !v))) throw new Error(`Refusing to write ${w.range}: outside ${labelOf(week)}'s rows ${first}-${last}.`);
  }
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

export interface SheetCall { gameId: number; team: string }

/**
 * Human calls typed straight into the sheet's Human call column (N) that the app doesn't have yet.
 * Only taken when the app has never set or cleared a call for that game, so the app's own choice always wins.
 */
export function planCalls(picksTab: Grid, period: Period, week: Week): { calls: SheetCall[]; skipped: string[] } {
  const { rows } = weekRows(picksTab, period, week);
  const calls: SheetCall[] = [], skipped: string[] = [];
  for (const g of week.games) {
    const row = rows.get(g.num);
    if (!row || !g.id || g.entryOverride || g.entryOverrideAt || g.result) continue;
    const raw = cell(picksTab, row, OVERRIDE_IDX);
    if (!raw) continue;
    const team = matchTeam(raw, g.away, g.home);
    if (!team) { skipped.push(`G${g.num} human call: "${raw}" isn't ${g.away} or ${g.home}`); continue; }
    calls.push({ gameId: g.id, team });
  }
  return { calls, skipped };
}
