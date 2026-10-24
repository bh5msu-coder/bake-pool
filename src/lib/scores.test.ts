import { describe, expect, it } from "vitest";
import events from "@/fixtures/espn-week6.json";
import { fixtureRaw } from "./fixture";
import type { Game } from "./scoring";
import { coverer, liveFor, matchGame, teamMatches, weekDays, type ScoreEvent } from "./scores";

const evs = events as ScoreEvent[];
const wk6 = fixtureRaw.weeks.find((w) => w.week === 6)!.games as unknown as Game[];

describe("matching the sheet's names to ESPN", () => {
  it("finds every Week 6 game on ESPN's scoreboard", () => {
    const missing = wk6.filter((g) => !matchGame(g, evs)).map((g) => `${g.away} at ${g.home}`);
    expect(missing).toEqual([]);
  });
  it("handles the sheet's school spellings", () => {
    const t = (names: string[]) => ({ names, score: null });
    expect(teamMatches("UTennessee", "NCAA", t(["Tennessee", "Volunteers", "Tennessee Volunteers", "TENN"]))).toBe(true);
    expect(teamMatches("Miami (FL)", "NCAA", t(["Miami", "Hurricanes", "Miami Hurricanes", "MIA"]))).toBe(true);
    expect(teamMatches("Miami (FL)", "NCAA", t(["Miami (OH)", "RedHawks", "Miami (OH) RedHawks", "M-OH"]))).toBe(false);
    expect(teamMatches("Texas", "NCAA", t(["Texas Tech", "Red Raiders", "Texas Tech Red Raiders", "TTU"]))).toBe(false);
    expect(teamMatches("UNC", "NCAA", t(["North Carolina", "Tar Heels", "North Carolina Tar Heels", "UNC"]))).toBe(true);
    expect(teamMatches("Central Florida", "NCAA", t(["UCF", "Knights", "UCF Knights", "UCF"]))).toBe(true);
    expect(teamMatches("LA Rams", "NFL", t(["Los Angeles", "Rams", "Los Angeles Rams", "LAR"]))).toBe(true);
    expect(teamMatches("LA Rams", "NFL", t(["Los Angeles", "Chargers", "Los Angeles Chargers", "LAC"]))).toBe(false);
  });
});

describe("against the spread", () => {
  const g = { away: "Seattle", home: "Denver", fav: "Seattle", spread: 2.5 };
  it("needs the favourite to win by more than the spread", () => {
    expect(coverer(g, 21, 17)).toBe("Seattle");
    expect(coverer(g, 14, 17)).toBe("Denver");
    expect(coverer(g, 20, 18)).toBe("Denver");
    expect(coverer({ ...g, spread: 3 }, 20, 17)).toBe("PUSH");
  });
  it("grades Thursday's real game the way the sheet did (Denver covered)", () => {
    const sea = wk6[0];
    const live = liveFor(sea, matchGame(sea, evs))!;
    expect(live).toMatchObject({ state: "post", completed: true, awayScore: 14, homeScore: 17, covering: "Denver", start: "2026-10-16T00:15Z" });
  });
  it("covers the Thursday-to-Monday window in Central time", () => {
    expect(weekDays("2026-10-22T19:30:00Z")).toEqual(["20261021", "20261022", "20261023", "20261024", "20261025", "20261026", "20261027"]);
  });
});

describe("elimOutcome", () => {
  const ev = (away: [string, number], home: [string, number], completed = true) => ({
    id: "1", league: "NFL" as const, date: "", state: completed ? "post" as const : "in" as const, detail: "", completed,
    away: { names: [away[0]], score: away[1] }, home: { names: [home[0]], score: home[1] },
  });
  it("survives when the group's team loses or ties, dies when it wins, waits until final", async () => {
    const { elimOutcome } = await import("./scores");
    expect(elimOutcome("NY Jets", [ev(["NYJ", 19], ["NE", 26])])).toBe("survived");
    expect(elimOutcome("NY Jets", [ev(["NYJ", 27], ["NE", 26])])).toBe("died");
    expect(elimOutcome("NY Jets", [ev(["NYJ", 20], ["NE", 20])])).toBe("survived");
    expect(elimOutcome("NY Jets", [ev(["NYJ", 3], ["NE", 26], false)])).toBeNull();
    expect(elimOutcome("NY Jets", [ev(["MIA", 3], ["NE", 26])])).toBeNull();
  });
});
