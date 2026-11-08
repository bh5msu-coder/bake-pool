import { describe, expect, it } from "vitest";
import hist from "./history.json";
import {
  agreement, allGames, awards, consensus, market, profit, rec, seasonGrid, soloRecords, SPLITS, streaks, teamRecords, tendencies, trajectory,
  weekRecords, type HistoryFile, type SG,
} from "./stats";
import type { Season } from "./scoring";

const H = hist as HistoryFile;
const g = (o: Partial<SG>): SG => ({ season: "2025-26", week: "Week 1", wi: 0, lg: "NFL", away: "A", home: "B", fav: "B", spread: 3.5, result: "B", picks: {}, ...o });

describe("history.json", () => {
  const all = allGames(H);
  it("covers both past seasons", () => {
    expect(all.length).toBe(1060);
    expect(all.filter((x) => x.season === "2024-25").length).toBe(527);
    expect(all.filter((x) => x.season === "2025-26").length).toBe(533);
  });
  it("matches the records rebuilt from the sheets", () => {
    const s25 = all.filter((x) => x.season === "2025-26");
    expect(rec(s25, "eric")).toEqual({ w: 283, l: 250, p: 0 });
    expect(rec(s25, "entry")).toEqual({ w: 272, l: 261, p: 0 });
    expect(rec(all.filter((x) => x.season === "2024-25"), "brad")).toEqual({ w: 279, l: 248, p: 0 });
  });
  it("every game has a valid favourite and result", () => {
    for (const x of all) {
      expect([x.away, x.home]).toContain(x.fav);
      expect([x.away, x.home, "PUSH"]).toContain(x.result);
    }
  });
  it("splits add up", () => {
    const home = rec(all, "brad", SPLITS[0].test), road = rec(all, "brad", SPLITS[1].test), tot = rec(all, "brad");
    expect(home.w + road.w).toBe(tot.w);
    const fav = rec(all, "brad", SPLITS[2].test), dog = rec(all, "brad", SPLITS[3].test);
    expect(fav.l + dog.l).toBe(tot.l);
  });
  it("never includes Claude", () => {
    expect(all.some((x) => "claude" in x.picks)).toBe(false);
  });
  it("blind market strategies are mirror images", () => {
    const m = market(all);
    expect(m[0].rec.w).toBe(m[1].rec.l);
    expect(m[2].rec.w).toBe(m[3].rec.l);
  });
  it("produces awards with stats", () => {
    const a = awards(all);
    expect(a.length).toBeGreaterThan(5);
    for (const x of a) { expect(x.stat).toMatch(/\d/); expect(x.n).toBeGreaterThan(0); }
  });
  it("trajectory ends at net wins", () => {
    const t = trajectory(all, [{ id: "brad", name: "Brad" }]);
    const r = rec(all, "brad");
    expect(t.series[0].values.at(-1)).toBe(r.w - r.l);
    expect(seasonGrid(all, [{ id: "kevin", name: "Kevin" }]).rows[0].cells[0].rec).toBeNull();
  });
});

describe("helpers", () => {
  it("streaks skip pushes", () => {
    const gs = [g({ picks: { x: "B" } }), g({ result: "PUSH", picks: { x: "A" } }), g({ picks: { x: "B" } }), g({ picks: { x: "A" } })];
    const s = streaks(gs, "x");
    expect(s.best.len).toBe(2);
    expect(s.worst.len).toBe(1);
    expect(s.current).toEqual({ kind: "L", len: 1 });
  });
  it("profit at -110", () => {
    expect(profit({ w: 11, l: 10, p: 0 })).toBe(0);
    expect(profit({ w: 0, l: 1, p: 0 })).toBe(-100);
  });
  it("consensus, solos, agreement", () => {
    const four = { brad: "B", andrew: "B", kevin: "B", eric: "A" };
    const gs = [g({ picks: four }), g({ picks: { brad: "A", andrew: "A", kevin: "B", eric: "B" } }), g({ picks: { brad: "B", andrew: "B", kevin: "B", eric: "B" }, result: "A" })];
    const c = consensus(gs);
    expect(c["3-1"]).toEqual({ w: 1, l: 0, p: 0 });
    expect(c["4-0"]).toEqual({ w: 0, l: 1, p: 0 });
    expect(c.n22).toBe(1);
    expect(soloRecords(gs).find((s) => s.id === "eric")!.rec).toEqual({ w: 0, l: 1, p: 0 });
    expect(agreement(gs).find((a) => a.id === "brad-andrew")).toMatchObject({ same: 3, n: 3 });
  });
  it("teams, weeks, tendencies", () => {
    const gs = Array.from({ length: 10 }, (_, i) => g({ wi: 0, picks: { x: "B" }, result: i < 7 ? "B" : "A" }));
    expect(teamRecords(gs, "x", 8)[0]).toMatchObject({ team: "B", rec: { w: 7, l: 3, p: 0 } });
    expect(weekRecords(gs, ["x"], 10)[0].rec.w).toBe(7);
    expect(tendencies(gs, [{ id: "x", name: "X" }])[0]).toMatchObject({ dog: 0, home: 1, n: 10 });
  });
  it("adds the live season with the submitted pick", () => {
    const live = {
      season: 2026, players: [{ id: "brad", name: "Brad", initial: "B", kind: "human", isAdmin: true }, { id: "claude", name: "Claude", initial: "C", kind: "bot", isAdmin: false }],
      weeks: [{ week: 1, label: "Week 1", deadline: null, entryFee: 0, winnings: 0, elim: { picks: {} }, games: [
        { num: 1, league: "NFL", away: "A", home: "B", fav: "B", spread: 3.5, line: "B -3.5", result: "B", picks: { brad: "B", claude: "A" } },
        { num: 2, league: "NFL", away: "C", home: "D", fav: "D", spread: 3.5, line: "D -3.5", result: null, picks: { brad: "C" } },
      ] }],
    } as unknown as Season;
    const all = allGames({ seasons: [], games: [] }, live);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ season: "2026-27", picks: { brad: "B", entry: "B" } });
  });
});
