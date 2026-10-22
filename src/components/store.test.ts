import { describe, expect, it } from "vitest";
import type { Season, Week } from "@/lib/scoring";
import { defaultWeekIdx } from "./store";

const week = (n: number, deadline: string | null): Week => ({
  id: n, week: n, label: `Week ${n}`, deadline, entryFee: 0, winnings: 0, games: [], elim: { picks: {}, override: null, outcome: null },
});
const season = (...weeks: Week[]) => ({ weeks } as Season);
const now = Date.parse("2026-10-24T12:00:00Z"); // Saturday after Week 7 locked

describe("defaultWeekIdx", () => {
  it("stays on the latest week after it locks, until the next week's lines arrive", () => {
    const s = season(week(6, "2026-10-15T17:00:00Z"), week(7, "2026-10-22T19:30:00Z"));
    expect(defaultWeekIdx(s, now)).toBe(1);
  });
  it("moves forward to the newly posted open week", () => {
    const s = season(week(6, "2026-10-15T17:00:00Z"), week(7, "2026-10-22T19:30:00Z"), week(8, "2026-10-29T19:30:00Z"));
    expect(defaultWeekIdx(s, now)).toBe(2);
  });
  it("treats a week with no deadline as open", () => {
    const s = season(week(7, "2026-10-22T19:30:00Z"), week(8, null));
    expect(defaultWeekIdx(s, now)).toBe(1);
  });
  it("is 0 with no weeks", () => {
    expect(defaultWeekIdx(season(), now)).toBe(0);
  });
});
