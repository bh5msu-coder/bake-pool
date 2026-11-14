import { describe, expect, it } from "vitest";
import { weekRecap } from "./analytics";
import { fixtureSeason } from "./fixture";
import { recapCardModel } from "./recapImage";
import { fmtRec } from "./scoring";

const s = fixtureSeason();

describe("recapCardModel", () => {
  const r = weekRecap(s, 5);
  const m = recapCardModel(r);

  it("leads with the week, the entry record and its tone", () => {
    expect(m.title).toBe("Week 5 recap");
    expect(m.entry).toBe(fmtRec(r.entry));
    expect(m.tone).toBe(r.entry.w > r.entry.l ? "up" : r.entry.l > r.entry.w ? "down" : "");
    expect(m.sub.startsWith("Entry")).toBe(true);
    expect(m.sub.includes("won $")).toBe(r.winnings > 0);
  });
  it("lists every picker with a record, best first", () => {
    expect(m.people.map((p) => p.id)).toEqual(r.people.map((p) => p.id));
    expect(m.people).toHaveLength(s.players.length);
    expect(m.people[0].rec).toBe(fmtRec(r.best[0].rec));
  });
  it("has the six facts from the recap card", () => {
    expect(m.stats.map((x) => x.label)).toEqual(["Best", "Worst", "All four agreed", "3-1 splits", "Claude tie-breaks", "Eliminator"]);
    expect(m.stats[0].value).toBe(r.best.map((p) => p.name).join(", "));
    expect(m.stats[5].note).toMatch(/\d+ (life|lives) left$/);
  });
  it("ends with one season line and names the file after the week", () => {
    expect(m.season).toMatch(/^Season entry \d+-\d+(-\d+)? \((\.\d{3}|1\.000|—)\)/);
    expect(m.fileName).toBe("bake-pool-week-5.png");
  });
});

describe("weekRecap season winnings", () => {
  it("adds up winnings through that week only", () => {
    const upTo = (n: number) => s.weeks.filter((w) => w.week <= n).reduce((t, w) => t + w.winnings, 0);
    expect(weekRecap(s, 3).seasonWon).toBe(upTo(3));
    expect(weekRecap(s, 5).seasonWon).toBe(upTo(5));
  });
});
