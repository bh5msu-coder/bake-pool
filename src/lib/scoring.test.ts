import { describe, expect, it } from "vitest";
import { fixtureRaw, fixtureSeason } from "./fixture";
import {
  band, elimSummary, entryLines, entryPick, ENTRY, fmtPct, grade, headToHead, majority, MAJORITY,
  money, record, soloPicker, split, type Game,
} from "./scoring";

const HUMANS = ["brad", "andrew", "kevin", "eric"];
const s = fixtureSeason();
const graded = s.weeks.filter((w) => w.week <= 5).flatMap((w) => w.games);

const g = (picks: Record<string, string>, extra: Partial<Game> = {}): Game => ({
  num: 1, league: "NFL", away: "A", home: "H", fav: "H", spread: 3.5, line: "H -3.5", result: null, picks, ...extra,
});

describe("majority and entry", () => {
  it("needs 3 of 4", () => {
    expect(majority(g({ brad: "A", andrew: "A", kevin: "A", eric: "H" }), HUMANS)).toBe("A");
    expect(majority(g({ brad: "A", andrew: "A", kevin: "H", eric: "H" }), HUMANS)).toBeNull();
  });
  it("breaks a 2-2 tie with Claude, and nothing can force the entry", () => {
    const tie = g({ brad: "A", andrew: "A", kevin: "H", eric: "H", claude: "H" });
    expect(entryPick(tie, HUMANS)).toBe("H");
    expect(entryPick({ ...tie, entryOverride: "A" }, HUMANS)).toBe("H");
  });
  it("reports splits only once everyone has picked", () => {
    expect(split(g({ brad: "A", andrew: "H", kevin: "H", eric: "H" }), HUMANS)).toBe("3-1");
    expect(split(g({ brad: "A" }), HUMANS)).toBeNull();
  });
  it("finds the solo picker in a 3-1", () => {
    expect(soloPicker(g({ brad: "A", andrew: "H", kevin: "H", eric: "H" }), HUMANS)).toBe("brad");
  });
});

describe("matches the shared sheet for weeks 1-5", () => {
  const all = fixtureRaw.weeks.filter((w) => w.week <= 5).flatMap((w) => w.games);
  it.each(all.map((x, i) => [i, x] as const))("game %i", (_i, x) => {
    const game = x as unknown as Game;
    expect(majority(game, HUMANS)).toBe(x.expect.majority);
    expect(entryPick(game, HUMANS)).toBe(x.expect.entry);
    expect(split(game, HUMANS)).toBe(x.expect.split);
  });
  it("season records", () => {
    const want: Record<string, [number, number]> = {
      brad: [75, 75], andrew: [85, 65], kevin: [73, 77], eric: [79, 71],
      majority: [58, 50], claude: [86, 64], entry: [82, 68],
    };
    for (const [who, [w, l]] of Object.entries(want)) {
      const id = who === "majority" ? MAJORITY : who === "entry" ? ENTRY : who;
      expect(record(graded, id, HUMANS), who).toMatchObject({ w, l });
    }
  });
  it("week 5 records match the summary tab", () => {
    const wk5 = s.weeks[4].games;
    expect(record(wk5, "brad", HUMANS)).toMatchObject({ w: 13, l: 17 });
    expect(record(wk5, "andrew", HUMANS)).toMatchObject({ w: 20, l: 10 });
    expect(record(wk5, ENTRY, HUMANS)).toMatchObject({ w: 19, l: 11 });
  });
  it("head to head counts disagreements only", () => {
    expect(headToHead(graded, "claude", "brad", HUMANS)).toEqual({ a: 50, b: 39, games: 89 });
  });
});

describe("helpers", () => {
  it("grades", () => {
    expect(grade("A", "A")).toBe("W");
    expect(grade("A", "H")).toBe("L");
    expect(grade("A", "PUSH")).toBe("P");
    expect(grade(null, "A")).toBeNull();
  });
  it("bands spreads", () => {
    expect([1.5, 3, 3.5, 7.5, 10.5, 14, 14.5].map(band)).toEqual(["0-3", "0-3", "3.5-7", "7.5-10", "10.5-14", "10.5-14", ">14"]);
  });
  it("formats percentages", () => {
    expect(fmtPct({ w: 86, l: 64, p: 0 })).toBe(".573");
    expect(fmtPct({ w: 0, l: 0, p: 0 })).toBe("—");
  });
  it("fixture deadlines land on Thursdays", () => {
    expect(s.weeks[0].deadline).toBe("2026-09-10T17:00:00.000Z");
    expect(s.weeks[5].deadline).toBe("2026-10-15T17:00:00.000Z");
  });
  it("money: season fee up front, plus buy-backs and other money", () => {
    expect(money(s)).toMatchObject({ weekly: 1250, buybacks: 100, fees: 1350, won: 200, net: -1150, each: -287.5 });
    expect(money({ ...s, elimBuybacks: 0 })).toMatchObject({ net: -1050, each: -262.5 }); // the sheet's own total
    expect(money({ ...s, ledger: [{ label: "Side bet", amount: -100 }] }).net).toBe(-1250);
  });
  it("eliminator burns teams and counts lives", () => {
    const e = elimSummary(s, Date.parse("2026-10-14T12:00:00Z"));
    expect(e.burned.map((b) => b.team)).toEqual(["New Orleans", "Miami", "Arizona", "Tennessee", "Tampa Bay"]);
    expect(elimSummary(s, Date.parse("2026-10-16T12:00:00Z")).burned).toHaveLength(6);
    expect(e.lives).toBe(2);
    expect(e.livesLeft).toBe(1);
    expect(elimSummary({ ...s, elimBuybacks: 0 }, Date.parse("2026-10-14T12:00:00Z")).alive).toBe(false);
  });
  it("entry payload flags blanks", () => {
    const w = { ...s.weeks[0], games: [g({}), g({ claude: "A" })] };
    expect(entryLines(w, HUMANS)).toMatchObject({ blanks: 1, text: "\nA" });
  });
});

describe("personal locks and hidden picks", () => {
  const s = fixtureSeason();
  const open = (patch: Partial<import("./scoring").Week>) => ({
    ...s.weeks[0], deadline: "2099-01-01T00:00:00Z",
    games: s.weeks[0].games.map((g) => ({ ...g, picks: { claude: g.picks.claude ?? g.away } })), ...patch,
  });

  it("counts picks from the hidden-pick totals when teams aren't loaded", async () => {
    const { pickedCount } = await import("./scoring");
    expect(pickedCount(open({ counts: { kevin: 7 } }), "kevin")).toBe(7);
    expect(pickedCount(open({}), "claude")).toBe(s.weeks[0].games.length);
  });

  it("locks the group only when all four have locked and Claude is in", async () => {
    const { groupLocked, revealed } = await import("./scoring");
    const all = ["brad", "andrew", "kevin", "eric"];
    expect(groupLocked(open({ locks: all.slice(0, 3) }), s.players)).toBe(false);
    expect(groupLocked(open({ locks: all }), s.players)).toBe(true);
    const noClaude = open({ locks: all });
    noClaude.games = noClaude.games.map((g, i) => (i ? g : { ...g, picks: {} }));
    expect(groupLocked(noClaude, s.players)).toBe(false);
    expect(revealed(open({ locks: [] }), s.players)).toBe(false);
    expect(revealed({ ...open({}), deadline: "2000-01-01T00:00:00Z" }, s.players)).toBe(true);
  });
});
