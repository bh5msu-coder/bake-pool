import { describe, expect, it } from "vitest";
import { nextDeadline } from "./deadline";

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
