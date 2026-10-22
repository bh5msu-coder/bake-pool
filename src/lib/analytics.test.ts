import { describe, expect, it } from "vitest";
import { categoryGrid, consensus, headToHeadGrid, soloRecords, trajectory, weeklyGrid } from "./analytics";
import { fixtureSeason } from "./fixture";

const s = fixtureSeason();

describe("analytics", () => {
  it("trajectory ends at each picker's season net", () => {
    const t = trajectory(s);
    expect(t.labels).toEqual(["Start", "W1", "W2", "W3", "W4", "W5"]);
    const end = Object.fromEntries(t.series.map((x) => [x.id, x.values.at(-1)]));
    expect(end).toMatchObject({ brad: 0, andrew: 20, kevin: -4, eric: 8, claude: 22, entry: 14 });
  });
  it("weekly grid matches week 5", () => {
    const g = weeklyGrid(s);
    expect(g.cols).toHaveLength(5);
    expect(g.rows.find((r) => r.id === "andrew")!.cells[4].rec).toMatchObject({ w: 20, l: 10 });
  });
  it("category grid splits every graded game between favourites and underdogs", () => {
    const g = categoryGrid(s);
    const brad = g.rows.find((r) => r.id === "brad")!;
    const [fav, dog] = brad.cells;
    expect(fav.rec!.w + fav.rec!.l + dog.rec!.w + dog.rec!.l).toBe(150);
  });
  it("head to head is symmetric", () => {
    const g = headToHeadGrid(s);
    const bi = g.rows.findIndex((r) => r.id === "brad"), ci = g.rows.findIndex((r) => r.id === "claude");
    expect(g.rows[bi].cells[ci].rec).toMatchObject({ w: 39, l: 50 });
    expect(g.rows[ci].cells[bi].rec).toMatchObject({ w: 50, l: 39 });
    expect(g.rows[bi].cells[bi].pct).toBeNull();
  });
  it("consensus covers every graded game once", () => {
    const c = consensus(s);
    expect(c.reduce((n, x) => n + x.rec.w + x.rec.l, 0)).toBe(150);
  });
  it("solo records add up across players", () => {
    expect(soloRecords(s).reduce((n, x) => n + x.rec.w + x.rec.l, 0)).toBeGreaterThan(0);
  });
});

describe("compareGrid", () => {
  it("gives win-% gaps against players and the group, by type and by week", async () => {
    const { compareGrid } = await import("./analytics");
    const { ENTRY, MAJORITY, pct, record } = await import("./scoring");
    const s = fixtureSeason();
    const ids = ["brad", "andrew", "kevin", "eric"];
    const g = compareGrid(s, "brad", ["kevin", ENTRY, MAJORITY], "type");
    expect(g.cols).toEqual(["Kevin", "Entry", "Majority"]);
    expect(g.rows[0].name).toBe("Overall");
    const games = s.weeks.flatMap((w) => w.games).filter((x) => x.result);
    const want = Math.round((pct(record(games, "brad", ids))! - pct(record(games, "kevin", ids))!) * 100);
    expect(g.rows[0].cells[0].diff).toBe(want);
    // "When you differed": the two records come from the same games, so they're mirror images.
    const d = g.rows[1].cells[0];
    expect(d.a.w).toBe(d.b.l);
    expect(d.a.l).toBe(d.b.w);
    const wk = compareGrid(s, "brad", ["kevin"], "week");
    expect(wk.rows.length).toBe(s.weeks.filter((w) => w.games.some((x) => x.result)).length);
  });
});
