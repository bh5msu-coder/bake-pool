import { describe, expect, it } from "vitest";
import { nextDeadline } from "./deadline";

describe("nextDeadline", () => {
  it("is Thursday noon Central during daylight time", () => {
    expect(nextDeadline(new Date("2026-10-16T20:00:00Z")).toISOString()).toBe("2026-10-22T17:00:00.000Z");
  });
  it("rolls to next week once Thursday noon has passed", () => {
    expect(nextDeadline(new Date("2026-10-22T17:00:00Z")).toISOString()).toBe("2026-10-29T17:00:00.000Z");
  });
  it("uses standard time after the November change", () => {
    expect(nextDeadline(new Date("2026-11-10T12:00:00Z")).toISOString()).toBe("2026-11-12T18:00:00.000Z");
  });
});
