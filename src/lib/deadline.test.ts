import { describe, expect, it } from "vitest";
import { estimateDeadline, nextDeadline, phaseOf, softDeadline } from "./deadline";

describe("nextDeadline", () => {
  it("is Thursday 2:30 PM Central during daylight time (CDT)", () => {
    expect(nextDeadline(new Date("2026-10-16T20:00:00Z")).toISOString()).toBe("2026-10-22T19:30:00.000Z");
  });
  it("rolls to next week once the deadline has passed", () => {
    expect(nextDeadline(new Date("2026-10-22T19:30:00Z")).toISOString()).toBe("2026-10-29T19:30:00.000Z");
    expect(nextDeadline(new Date("2026-10-22T19:29:00Z")).toISOString()).toBe("2026-10-22T19:30:00.000Z");
  });
  it("uses standard time (CST) after the November change", () => {
    expect(nextDeadline(new Date("2026-11-10T12:00:00Z")).toISOString()).toBe("2026-11-12T20:30:00.000Z");
  });
  it("still supports the old noon deadline for past weeks", () => {
    expect(nextDeadline(new Date("2026-10-14T12:00:00Z"), 4, 12, 0).toISOString()).toBe("2026-10-15T17:00:00.000Z");
  });
});

describe("soft deadline and grace period", () => {
  const lock = "2026-10-22T19:30:00.000Z"; // Thu Oct 22, 2:30 PM CDT

  it("puts picks due at noon Central with a 150-minute grace", () => {
    expect(softDeadline(lock, 150)).toBe("2026-10-22T17:00:00.000Z");
  });

  it("is open before noon, in grace until 2:30, then locked", () => {
    expect(phaseOf(lock, 150, Date.parse("2026-10-22T16:59:00Z"))).toBe("open");
    expect(phaseOf(lock, 150, Date.parse("2026-10-22T17:00:00Z"))).toBe("grace");
    expect(phaseOf(lock, 150, Date.parse("2026-10-22T19:29:59Z"))).toBe("grace");
    expect(phaseOf(lock, 150, Date.parse("2026-10-22T19:30:00Z"))).toBe("locked");
  });

  it("has no grace when it is set to zero, and stays open with no deadline", () => {
    expect(phaseOf(lock, 0, Date.parse("2026-10-22T19:00:00Z"))).toBe("open");
    expect(phaseOf(null, 150)).toBe("open");
  });
});

describe("estimateDeadline", () => {
  const week1 = "2026-09-10T17:00:00.000Z"; // Thu Sep 10
  it("puts numbered weeks on their Thursday at 2:30 PM CT, across the clock change", () => {
    expect(estimateDeadline("Week 7", week1)).toBe("2026-10-22T19:30:00.000Z"); // CDT
    expect(estimateDeadline("Week 15", week1)).toBe("2026-12-17T20:30:00.000Z"); // CST
    expect(estimateDeadline("Week 18", week1)).toBe("2027-01-07T20:30:00.000Z");
  });
  it("leaves Bowl, CFP and Playoff undated", () => {
    expect(estimateDeadline("Bowl", week1)).toBeNull();
    expect(estimateDeadline("CFP", week1)).toBeNull();
  });
});
