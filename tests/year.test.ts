import { describe, expect, it } from "vitest";
import { normalizeYear } from "../src/year.js";

describe("normalizeYear", () => {
  it("accepts empty year", () => {
    expect(normalizeYear("")).toBeUndefined();
    expect(normalizeYear(undefined)).toBeUndefined();
  });

  it("accepts valid integer year strings", () => {
    expect(normalizeYear("2023")).toBe(2023);
  });

  it("rejects invalid years", () => {
    expect(() => normalizeYear("2023.5")).toThrow("Invalid year");
    expect(() => normalizeYear("1899")).toThrow("Invalid year");
  });
});
