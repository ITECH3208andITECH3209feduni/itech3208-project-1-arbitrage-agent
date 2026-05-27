import { describe, expect, it } from "vitest";
import { milesToKm, normalizeMileageToKm, parseMileageToKm } from "../src/mileage.js";

describe("mileage utilities", () => {
  it("converts miles to km", () => {
    expect(milesToKm(100)).toBe(161);
  });

  it("normalizes supported units", () => {
    expect(normalizeMileageToKm(1000, "km")).toBe(1000);
    expect(normalizeMileageToKm(1000, "kilometers")).toBe(1000);
    expect(normalizeMileageToKm(100, "miles")).toBe(161);
  });

  it("rejects unknown units", () => {
    expect(() => normalizeMileageToKm(1, "league")).toThrow("Unsupported mileage unit");
  });

  it("parses generic and source-specific strings through one utility", () => {
    expect(parseMileageToKm("3.5万km")).toBe(35000);
    expect(parseMileageToKm("35,000 km")).toBe(35000);
    expect(parseMileageToKm("0km")).toBe(0);
    expect(parseMileageToKm("走行距離 3.5万km以下")).toBe(35000);
    expect(parseMileageToKm("10 miles")).toBe(16);
    expect(parseMileageToKm("10 mile")).toBe(16);
  });
});
