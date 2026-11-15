import { describe, expect, it } from "vitest";
import { coverMargin, coverText } from "./cover";

const g = { away: "Buffalo", home: "Las Vegas", fav: "Buffalo", spread: 6.5 };

describe("coverMargin", () => {
  it("is positive for the underdog while the favourite leads by less than the spread", () => {
    expect(coverMargin(g, "Las Vegas", 24, 20)).toBe(2.5);
    expect(coverMargin(g, "Buffalo", 24, 20)).toBe(-2.5);
  });
  it("is positive for the favourite once it leads by more than the spread", () => {
    expect(coverMargin(g, "Buffalo", 31, 20)).toBe(4.5);
    expect(coverMargin(g, "Las Vegas", 31, 20)).toBe(-4.5);
  });
  it("handles a home favourite and an underdog winning outright", () => {
    const h = { away: "NY Jets", home: "New England", fav: "New England", spread: 7.5 };
    expect(coverMargin(h, "NY Jets", 17, 21)).toBe(3.5);
    expect(coverMargin(h, "NY Jets", 24, 21)).toBe(10.5);
    expect(coverMargin(h, "New England", 24, 21)).toBe(-10.5);
  });
  it("is zero on a push", () => {
    expect(coverMargin({ ...g, spread: 3 }, "Buffalo", 23, 20)).toBe(0);
  });
});

describe("coverText", () => {
  it("says which way and by how much", () => {
    expect(coverText(2.5)).toBe("Covering by 2.5");
    expect(coverText(-3)).toBe("Behind by 3");
    expect(coverText(0)).toBe("On the number");
  });
});
