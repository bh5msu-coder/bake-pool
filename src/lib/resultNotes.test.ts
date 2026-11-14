import { describe, expect, it } from "vitest";
import { fixtureSeason } from "./fixture";
import { finalNotes, resultNotes, wants } from "./resultNotes";
import type { Season } from "./scoring";

// One week that locked Thu Oct 22 2:30 PM CDT (19:30 UTC).
function season(patch: Partial<Season["weeks"][number]> = {}): Season {
  const s = fixtureSeason();
  const w = s.weeks[4];
  s.weeks = [{ ...w, id: 7, deadline: "2026-10-22T19:30:00Z", locks: [], ...patch }];
  return s;
}
const day = (d: number, utc = "20:00:00") => Date.parse(`2026-10-${d}T${utc}Z`);

describe("result notifications", () => {
  it("sends each person the week's recap once every game is graded", () => {
    const notes = resultNotes(season(), day(26)).filter((n) => n.kind === "recap");
    expect(notes.map((n) => n.key)).toEqual(["recap:7:brad", "recap:7:andrew", "recap:7:kevin", "recap:7:eric"]);
    expect(notes[0].note.title).toMatch(/final: entry \d+-\d+/);
    expect(notes[0].note.url).toBe(`/week/${season().weeks[0].week}`);
  });

  it("holds the recap while a game is still ungraded", () => {
    const s = season();
    s.weeks[0].games[3] = { ...s.weeks[0].games[3], result: null };
    expect(resultNotes(s, day(26)).some((n) => n.kind === "recap")).toBe(false);
  });

  it("says nothing about a week that locked more than six days ago", () => {
    expect(resultNotes(season(), Date.parse("2026-11-02T20:00:00Z"))).toEqual([]);
  });

  it("reports the eliminator outcome to everyone", () => {
    const s = season();
    s.weeks[0].elim = { picks: { brad: "NY Jets", andrew: "NY Jets", kevin: "NY Jets", eric: "Miami" }, outcome: "died" };
    const n = resultNotes(s, day(26)).find((x) => x.kind === "elim");
    expect(n?.players).toEqual(["brad", "andrew", "kevin", "eric"]);
    expect(n?.note.body).toMatch(/^NY Jets won/);
  });

  it("announces the reveal when everyone locks before the deadline", () => {
    const open = season({ locks: ["brad", "andrew", "kevin", "eric"] });
    const notes = resultNotes(open, day(22, "15:00:00"));
    expect(notes.map((n) => n.key)).toEqual(["reveal:7"]);
    expect(resultNotes(season({ locks: ["brad"] }), day(22, "15:00:00"))).toEqual([]);
  });

  it("tells each picker whether a finished game covered for them", () => {
    const notes = finalNotes({ week: 7, label: "Week 7", away: "Seattle", home: "Denver", awayScore: 14, homeScore: 17, covering: "Denver",
      picks: { brad: "Denver", andrew: "Seattle" } }, ["brad", "andrew", "kevin"]);
    expect(notes.map((n) => [n.players[0], n.note.title])).toEqual([["brad", "Covered: Denver"], ["andrew", "Missed: Seattle"]]);
  });

  it("treats every-game finals as off unless switched on, and the rest as on unless switched off", () => {
    expect(wants({}, "final")).toBe(false);
    expect(wants({ final: true }, "final")).toBe(true);
    expect(wants(null, "recap")).toBe(true);
    expect(wants({ recap: false }, "recap")).toBe(false);
  });
});
