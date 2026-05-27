import { describe, expect, it } from "vitest";
import { normalizeMakeCase, normalizeVehicleTextCase } from "../src/casing.js";

describe("vehicle display casing", () => {
  it("normalizes stored make case", () => {
    expect(normalizeMakeCase("TOYOTA")).toBe("Toyota");
    expect(normalizeMakeCase("bmw")).toBe("BMW");
    expect(normalizeMakeCase("mercedes benz")).toBe("Mercedes-Benz");
  });

  it("normalizes stored model and title case", () => {
    expect(normalizeVehicleTextCase("camry hybrid rx350 3.5 sc package")).toBe(
      "Camry Hybrid RX350 3.5 SC Package",
    );
  });
});
