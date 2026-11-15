import { describe, expect, it } from "vitest";
import { shortName } from "./teams";

describe("shortName", () => {
  it("uses the listed short spelling", () => {
    expect(shortName("Mississippi State")).toBe("Miss St");
    expect(shortName("Jacksonville")).toBe("Jax");
  });
  it("shortens State on long names that are not listed", () => {
    expect(shortName("Appalachian State")).toBe("Appalachian St");
  });
  it("leaves short and unknown names alone", () => {
    expect(shortName("Kentucky")).toBe("Kentucky");
    expect(shortName("Ohio State")).toBe("Ohio State");
    expect(shortName("Some New Team")).toBe("Some New Team");
  });
});
