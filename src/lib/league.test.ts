import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseChamp, parseElim, parseMoney, rankBy, seedFrom, simulate, weeklyField } from "./league";
import { parseCsv } from "./sheet";

const tab = (t: string) => parseCsv(readFileSync(path.join(__dirname, "../fixtures/league", `${t}.csv`), "utf8"));

describe("THE POOL sheet (export of 17 Oct 2026)", () => {
  const champ = parseChamp(tab("Champ"));
  it("reads the championship table", () => {
    expect(champ.rows).toHaveLength(45);
    expect(champ.periods.slice(0, 6)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(champ.periods).toContain("B");
    expect(champ.pot).toBe(4500);
    expect(champ.places).toEqual([2500, 1250, 500, 250]);
    const bake = champ.rows.find((r) => r.entry === "BAKE")!;
    expect(bake).toMatchObject({ total: 88, rankText: "T7" });
    expect([1, 2, 3, 4, 5].map((w) => bake.weekly[String(w)])).toEqual([14, 16, 17, 16, 19]); // same as the app's Entry records
  });
  it("ranks with ties the way the sheet does", () => {
    const ranks = rankBy(champ.rows, (r) => r.total);
    const bake = champ.rows.find((r) => r.entry === "BAKE")!;
    expect(ranks.get(bake)).toEqual({ rank: 7, tied: true });
  });
  it("summarises a week's field", () => {
    const f = weeklyField(champ, "5")!;
    expect(f.n).toBe(45);
    expect(f.min).toBeLessThanOrEqual(f.median);
    expect(f.max).toBeGreaterThanOrEqual(19);
  });
  it("reads money and elimination", () => {
    const money = parseMoney(tab("Money"));
    expect(money.find((m) => m.entry === "BAKE")).toMatchObject({ total: 200, byWeek: { "5": 200 } });
    const elim = parseElim(tab("Elim"));
    expect(elim).toMatchObject({ alive: 15, noLoss: 2, oneLoss: 13, eliminated: 31, pot: 7700, places: [4200, 2000, 1000, 500] });
    expect(elim.rows.find((r) => r.entry === "BAKE")).toMatchObject({ alive: true, losses: 1, rebuy: true });
    expect(new Set(elim.rows.map((r) => r.entry)).size).toBe(elim.rows.length);
  });
});

describe("Monte Carlo", () => {
  const entries = [{ entry: "A", wins: 100 }, { entry: "B", wins: 95 }, { entry: "C", wins: 90 }, { entry: "D", wins: 85 }, { entry: "E", wins: 60 }];
  const run = (rem: number, seed = 7) => simulate({ entries, gradedGames: 180, remainingGames: rem, places: [100, 50], sims: 4000, seed });

  it("is deterministic for a seed and sums sensibly", () => {
    const r = run(300);
    expect(run(300)).toEqual(r);
    expect(r.reduce((s, x) => s + x.pFirst, 0)).toBeCloseTo(1, 6);
    expect(r.reduce((s, x) => s + x.expPayout, 0)).toBeCloseTo(150, 6);
  });
  it("favours the leader and narrows as the season ends", () => {
    const early = run(400), late = run(10);
    expect(early[0].pFirst).toBeGreaterThan(early[1].pFirst);
    expect(early[4].pMoney).toBeLessThan(0.05);
    expect(late[0].pFirst).toBeGreaterThan(early[0].pFirst);
  });
  it("with nothing left to play, the standings are final", () => {
    const r = run(0);
    expect(r.map((x) => x.pFirst)).toEqual([1, 0, 0, 0, 0]);
    expect(r.map((x) => x.pMoney)).toEqual([1, 1, 0, 0, 0]);
  });
  it("seeds stably from the standings", () => {
    expect(seedFrom(entries)).toBe(seedFrom([...entries]));
    expect(seedFrom(entries)).not.toBe(seedFrom([{ ...entries[0], wins: 101 }, ...entries.slice(1)]));
  });
});
