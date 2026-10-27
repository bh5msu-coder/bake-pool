import { describe, expect, it } from "vitest";
import { atsCover, atsRecords, teamIdFor } from "./ats";

describe("against-the-spread records", () => {
  it("decides covers from the home line (negative = home favoured)", () => {
    expect(atsCover(27, 20, -4.5)).toBe("home");   // home -4.5 won by 7
    expect(atsCover(23, 20, -4.5)).toBe("away");   // won by 3, didn't cover
    expect(atsCover(20, 23, 2.5)).toBe("away");    // home +2.5 lost by 3
    expect(atsCover(20, 23, 3)).toBe("push");
    expect(atsCover(20, 23, null)).toBeNull();
  });

  it("totals W-L(-P) per team and skips games without a line", () => {
    const r = atsRecords([
      { home_id: "1", away_id: "2", cover: "home" },
      { home_id: "2", away_id: "1", cover: "push" },
      { home_id: "1", away_id: "3", cover: "away" },
      { home_id: "1", away_id: "2", cover: null },
    ]);
    expect(r.get("1")).toBe("1-1-1");
    expect(r.get("2")).toBe("0-1-1");
    expect(r.get("3")).toBe("1-0");
  });

  it("finds ESPN's team for the sheet's spelling", () => {
    const nfl = [{ team_id: "20", names: ["New York", "Jets", "New York Jets", "NYJ", "Jets"] }, { team_id: "19", names: ["New York", "Giants", "New York Giants", "NYG", "Giants"] }];
    expect(teamIdFor("NY Jets", "NFL", nfl)).toBe("20");
    const cfb = [{ team_id: "2633", names: ["Tennessee", "Tennessee", "Tennessee Volunteers", "TENN", "Volunteers"] }];
    expect(teamIdFor("UTennessee", "NCAA", cfb)).toBe("2633");
  });
});
