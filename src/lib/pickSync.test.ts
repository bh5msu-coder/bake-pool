import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fixtureSeason } from "./fixture";
import { planSync, syncKey } from "./pickSync";
import type { Week } from "./scoring";
import { parseCsv, parsePicksTab, parseSummaryTab, type Grid } from "./sheet";

const tab = (t: string) => parseCsv(readFileSync(path.join(__dirname, "../fixtures/sheet", `${t}.csv`), "utf8"));
const picksTab = tab("Picks");
const { periods } = parseSummaryTab(tab("Summary"));
const season = fixtureSeason();

// Week 6 as the app would hold it, ids 1..30, with the sheet's own picks.
const sheetW6 = parsePicksTab(picksTab).get("Week 6")!;
const week = (picks: (g: (typeof sheetW6)[number]) => Record<string, string>): Week => ({
  ...season.weeks[5], label: "Week 6",
  games: sheetW6.map((g, i) => ({ ...g, id: i + 1, num: i + 1, result: null, entryOverride: null, picks: picks(g) })),
});
const withCell = (g: Grid, row: number, col: number, v: string) => g.map((r, i) => (i === row - 1 ? r.map((c, j) => (j === col ? v : c)) : r));
const G1 = 169, BRAD = 6; // Week 6 game 1 row, Brad's column (G)

describe("two-way picks sync", () => {
  it("does nothing when both sides already agree", () => {
    const plan = planSync(picksTab, periods[5], week((g) => g.picks), new Map(), new Set(), "auto");
    expect(plan.toApp).toEqual([]);
    expect(plan.toSheet).toEqual([]);
    expect(plan.unmatched).toBe(0);
  });

  it("takes a change made in the sheet when the app hasn't changed since the last sync", () => {
    const w = week((g) => g.picks);
    const g1 = w.games[0];
    const other = g1.picks.brad === g1.away ? g1.home : g1.away;
    const sheet = withCell(picksTab, G1, BRAD, other);
    const base = new Map([[syncKey(1, "brad"), g1.picks.brad]]);
    const plan = planSync(sheet, periods[5], w, base, new Set(), "auto");
    expect(plan.toApp).toEqual([{ gameId: 1, player: "brad", team: other }]);
    expect(plan.toSheet).toEqual([]);
  });

  it("sends an app change to the sheet, and the app wins when both changed", () => {
    const w0 = week((g) => g.picks);
    const g1 = w0.games[0];
    const other = g1.picks.brad === g1.away ? g1.home : g1.away;
    const w = week((g) => (g === sheetW6[0] ? { ...g.picks, brad: other } : g.picks));
    const base = new Map([[syncKey(1, "brad"), g1.picks.brad]]);
    expect(planSync(picksTab, periods[5], w, base, new Set(), "auto").toSheet)
      .toEqual([{ range: `Picks!G${G1}`, values: [[other]] }]);
    // Both changed: sheet says the original, app says other, base is something else → app wins.
    const both = planSync(picksTab, periods[5], w, new Map([[syncKey(1, "brad"), "nobody"]]), new Set(), "auto");
    expect(both.toSheet).toEqual([{ range: `Picks!G${G1}`, values: [[other]] }]);
    expect(both.toApp).toEqual([]);
  });

  it("fills blanks both ways, keeps locked players' app picks, and skips names that aren't in the game", () => {
    const w = week((g) => ({ brad: g.picks.brad! }));               // app has only Brad
    const plan = planSync(picksTab, periods[5], w, new Map(), new Set(), "auto");
    expect(plan.toApp.filter((c) => c.player === "kevin")).toHaveLength(30); // sheet → app
    const blankBrad = withCell(picksTab, G1, BRAD, "");
    expect(planSync(blankBrad, periods[5], w, new Map(), new Set(), "auto").toSheet).toContainEqual({ range: `Picks!G${G1}`, values: [[w.games[0].picks.brad]] });
    const junk = withCell(picksTab, G1, 7, "Hawaii");
    expect(planSync(junk, periods[5], w, new Map(), new Set(), "auto").skipped[0]).toMatch(/G1 andrew: "Hawaii"/);
    const other = w.games[0].picks.brad === w.games[0].away ? w.games[0].home : w.games[0].away;
    const changed = withCell(picksTab, G1, BRAD, other);
    const base = new Map([[syncKey(1, "brad"), w.games[0].picks.brad]]);
    expect(planSync(changed, periods[5], w, base, new Set(["brad"]), "auto").toApp.find((c) => c.player === "brad")).toBeUndefined();
  });

  it("Import takes the sheet, Export takes the app, and nothing leaves the week's rows", () => {
    const w0 = week((g) => g.picks);
    const other = w0.games[0].picks.brad === w0.games[0].away ? w0.games[0].home : w0.games[0].away;
    const w = week((g) => (g === sheetW6[0] ? { ...g.picks, brad: other } : g.picks));
    expect(planSync(picksTab, periods[5], w, new Map(), new Set(), "import").toApp).toEqual([{ gameId: 1, player: "brad", team: w0.games[0].picks.brad }]);
    const exp = planSync(picksTab, periods[5], w, new Map(), new Set(), "export");
    expect(exp.toApp).toEqual([]);
    const rows = exp.toSheet.map((x) => Number(/(\d+)$/.exec(x.range)![1]));
    expect(rows.every((r) => r >= periods[5].start! && r < periods[6].start!)).toBe(true);
  });
});
