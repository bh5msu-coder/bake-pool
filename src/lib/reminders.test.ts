import { describe, expect, it } from "vitest";
import { fixtureSeason } from "./fixture";
import { reminderPlan } from "./reminders";
import type { Season } from "./scoring";

// An open week locking Thu Oct 22 2:30 PM CDT (19:30 UTC), so picks are due at noon (17:00 UTC).
function season(patch: Partial<Season["weeks"][number]> = {}): Season {
  const s = fixtureSeason();
  const w = s.weeks[5];
  s.weeks = [{ ...w, id: 99, deadline: "2026-10-22T19:30:00Z", games: w.games.map((g) => ({ ...g, result: null })), locks: [], ...patch }];
  return s;
}
const at = (utc: string) => Date.parse(`2026-10-22T${utc}Z`);

describe("Thursday reminders", () => {
  it("says nothing more than 3 hours before picks are due", () => {
    expect(reminderPlan(season(), at("13:30:00"))).toEqual([]);
  });

  it("reminds everyone who hasn't locked from 3 hours out, and gives a last call at 45 minutes", () => {
    const s = season({ locks: ["kevin"] });
    const keys = reminderPlan(s, at("14:30:00")).map((p) => p.key);
    expect(keys).toEqual(["due3h:99:brad", "due3h:99:andrew", "due3h:99:eric"]);
    const late = reminderPlan(s, at("16:20:00")).map((p) => p.key);
    expect(late).toContain("due45:99:andrew");
    expect(late.some((k) => k.endsWith(":kevin"))).toBe(false);
  });

  it("alerts Brad 30 minutes before when Claude's picks are missing, and not when they're in", () => {
    const missing = season();
    missing.weeks[0].games = missing.weeks[0].games.map((g, i) => (i ? g : { ...g, picks: { ...g.picks, claude: undefined as unknown as string } }));
    const alert = reminderPlan(missing, at("16:40:00")).find((p) => p.key === "claude:99");
    expect(alert?.players).toEqual(["brad"]);
    expect(alert?.note.body).toMatch(/^1 of 30 games/);
    expect(reminderPlan(season(), at("16:40:00")).some((p) => p.key === "claude:99")).toBe(false);
  });

  it("stops once the week has locked", () => {
    expect(reminderPlan(season(), at("19:31:00"))).toEqual([]);
  });
});
