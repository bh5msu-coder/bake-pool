import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fixtureSeason } from "./fixture";
import type { Week } from "./scoring";
import { parseCsv, parsePicksTab, parseSummaryTab } from "./sheet";
import { planElim, planPicks } from "./sheetWrite";

const tab = (t: string) => parseCsv(readFileSync(path.join(__dirname, "../fixtures/sheet", `${t}.csv`), "utf8"));
const picksTab = tab("Picks"), elimTab = tab("Eliminator");
const { periods } = parseSummaryTab(tab("Summary"));
const season = fixtureSeason();

describe("writing picks to the real sheet layout", () => {
  it("only ever touches its own week's rows, never earlier or later weeks", () => {
    const sheetW6 = parsePicksTab(picksTab).get("Week 6")!;
    const week: Week = { ...season.weeks[5], label: "Week 6", games: sheetW6.map((g) => ({ ...g, result: null, entryOverride: null })) };
    const rows = planPicks(picksTab, periods[5], week).writes.map((w) => Number(/(\d+)$/.exec(w.range)![1]));
    expect(Math.min(...rows)).toBeGreaterThanOrEqual(periods[5].start!);
    expect(Math.max(...rows)).toBeLessThan(periods[6].start!);
  });

  it("matches an existing week's rows by team and writes each picker's column", () => {
    const sheetW6 = parsePicksTab(picksTab).get("Week 6")!;
    const week: Week = { ...season.weeks[5], label: "Week 6", games: sheetW6.map((g) => ({ ...g, result: null, entryOverride: null })) };
    const plan = planPicks(picksTab, periods[5], week);
    expect(plan.unmatched).toEqual([]);
    expect(plan.filledGames).toBe(false);
    expect(plan.rows).toBe(30);
    expect(plan.writes.find((w) => w.range === "Picks!G169")?.values).toEqual([["Seattle"]]); // Brad, game 1
    expect(plan.writes.find((w) => w.range === "Picks!L169")?.values).toEqual([["Seattle"]]); // Claude, game 1
    expect(plan.writes.some((w) => /^Picks![ABC]/.test(w.range))).toBe(false); // games already there: untouched
  });

  it("still finds the right row when the app's order differs from the sheet's", () => {
    const sheetW6 = parsePicksTab(picksTab).get("Week 6")!;
    const games = [...sheetW6].reverse().map((g, i) => ({ ...g, num: i + 1, result: null, entryOverride: null }));
    const plan = planPicks(picksTab, periods[5], { ...season.weeks[5], label: "Week 6", games });
    expect(plan.writes.find((w) => w.range === "Picks!G169")?.values).toEqual([["Seattle"]]);
  });

  it("fills an empty week block with games, lines and picks in app order", () => {
    const week: Week = {
      ...season.weeks[5], week: 7, label: "Week 7",
      games: season.weeks[5].games.map((g) => ({ ...g, picks: { brad: g.home, kevin: g.away }, result: null })),
    };
    const plan = planPicks(picksTab, periods[6], week);
    expect(periods[6]).toMatchObject({ label: "Week 7", start: 202 });
    expect(plan.filledGames).toBe(true);
    expect(plan.writes.find((w) => w.range === "Picks!A202:C202")?.values).toEqual([["Seattle", "Denver", "SEA -2.5"]]);
    expect(plan.writes.find((w) => w.range === "Picks!G202")?.values).toEqual([["Denver"]]);
    expect(plan.writes.find((w) => w.range === "Picks!I202")?.values).toEqual([["Seattle"]]);
    expect(plan.writes.some((w) => w.range === "Picks!H202")).toBe(false); // Andrew hasn't picked: leave it alone
  });

  it("writes eliminator votes on the week's row", () => {
    const week: Week = { ...season.weeks[5], week: 7, label: "Week 7", elim: { picks: { brad: "Miami", eric: "Arizona" } } };
    expect(planElim(elimTab, season, week)).toEqual([
      { range: "Eliminator!B9", values: [["Miami"]] },
      { range: "Eliminator!E9", values: [["Arizona"]] },
    ]);
    expect(planElim(elimTab, season, { ...week, label: "Bowl" })).toEqual([]);
  });
});
