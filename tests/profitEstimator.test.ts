import { describe, expect, it } from "vitest";
import { applyEstimatedProfitAud, estimateProfitAud, estimateResaleAud } from "../src/profitEstimator.js";
import type { VehicleRecord } from "../src/types.js";

const car = (overrides: Partial<VehicleRecord>): VehicleRecord => ({
  url: "https://example.test/car", title: "car", titleRaw: "car", price: 20_000,
  priceRaw: "$20,000", currency: "AUD", market: "AU", mileage: 50_000,
  mileageRaw: "50,000 km", year: 2022, make: "Toyota", model: "RAV4", color: "",
  colorRaw: "", transmission: "Automatic", transmissionRaw: "", driveType: "FWD",
  driveTypeRaw: "", engineSize: "2.0L", fuelType: "Petrol", fuelTypeRaw: "",
  bodyType: "SUV", bodyTypeRaw: "", doors: 5, seats: 5, dealer: "", dealerRaw: "",
  location: "", locationRaw: "", description: "", descriptionRaw: "", images: [],
  extractedAt: "2026-01-01T00:00:00.000Z", ...overrides,
});

describe("profitEstimator", () => {
  it("uses median with P20/P80", () => {
    const result = estimateResaleAud(car({}), [car({ price: 40_000, year: 2021 }), car({ price: 50_000 }), car({ price: 60_000, year: 2023 })]);
    expect(result!.estimatedResaleAud).toBe(50_000);
    expect(result!.estimatedResaleLowAud).toBe(44_000);
    expect(result!.estimatedResaleHighAud).toBe(56_000);
  });

  it("relaxes year window and explains it", () => {
    const result = estimateResaleAud(car({}), [car({ year: 2018, price: 30_000 }), car({ price: 40_000 })]);
    expect(result!.resaleComparableCount).toBe(2);
    expect(result!.resaleConfidenceReasons.join(" ")).toMatch(/year window/i);
  });

  it("returns null for fewer than two suitable AU/AUD comparables", () => {
    expect(estimateResaleAud(car({}), [car({ price: null }), car({ soldStatus: "unsold" }), car({ market: "JP" }), car({ currency: "JPY" })])).toBeNull();
    expect(applyEstimatedProfitAud(car({ market: "JP", currency: "JPY" }), [], { jpyToAud: 0.01 }).resaleConfidenceLabel).toBeNull();
  });

  it("lowers confidence and widens range for dispersion", () => {
    const tight = estimateResaleAud(car({}), [car({ price: 49_000 }), car({ price: 50_000 }), car({ price: 51_000 })]);
    const wide = estimateResaleAud(car({}), [car({ price: 10_000 }), car({ price: 50_000 }), car({ price: 100_000 })]);
    expect(wide!.resaleConfidence).toBeLessThan(tight!.resaleConfidence);
    expect(wide!.estimatedResaleHighAud! - wide!.estimatedResaleLowAud!).toBeGreaterThan(tight!.estimatedResaleHighAud! - tight!.estimatedResaleLowAud!);
    expect(wide!.resaleConfidenceReasons.join(" ")).toMatch(/dispersion/i);
  });

  it("uses freshness and sold source quality", () => {
    const now = "2026-08-01T00:00:00.000Z";
    const sold = estimateResaleAud(car({}), [car({ soldStatus: "sold" }), car({ soldStatus: "sold" }), car({ soldStatus: "sold" })], { now });
    const stale = estimateResaleAud(car({}), [car({ extractedAt: "2024-01-01T00:00:00.000Z" }), car({ extractedAt: "2024-01-01T00:00:00.000Z" })], { now });
    expect(sold!.resaleBasis).toBe("sold");
    expect(sold!.resaleConfidence).toBeGreaterThan(stale!.resaleConfidence!);
    expect(stale!.resaleConfidenceReasons.join(" ")).toMatch(/stale/i);
  });

  it("requires count gates for high confidence", () => {
    const two = estimateResaleAud(car({}), [car({}), car({})]);
    const five = estimateResaleAud(car({}), Array.from({ length: 5 }, (_, i) => car({ price: 50_000 + i * 100 })));
    expect(two!.resaleConfidenceLabel).not.toBe("high");
    expect(five!.resaleConfidenceLabel).toBe("high");
  });

  it("calculates JPY purchase and exact contract output", () => {
    const target = car({ price: 1_000_000, currency: "JPY" });
    const comparables = [car({ price: 30_000 }), car({ price: 40_000 })];
    expect(estimateProfitAud(target, comparables, { jpyToAud: 0.01 })).toBe(21_800);
    expect(applyEstimatedProfitAud(target, comparables, { jpyToAud: 0.01 })).toMatchObject({ purchaseAud: 10_000, importCostAud: 3_200, estimatedResaleAud: 35_000, estimatedProfitAud: 21_800, resaleBasis: "asking" });
  });

  it("matches model families across trims but not unrelated models", () => {
    const target = car({ make: "Mazda", model: "Cx-5" });
    const result = estimateResaleAud(target, [
      car({ make: "Mazda", model: "Cx-5 Xd", price: 40_000 }),
      car({ make: "Mazda", model: "Cx-5 Xd", price: 42_000 }),
      car({ make: "Mazda", model: "Cx-50", price: 50_000 }),
      car({ make: "Toyota", model: "Cx-5 Xd", price: 60_000 }),
    ]);
    expect(result!.resaleComparableCount).toBe(2);
  });

  it.each([
    ["Brz R", "Brz"], ["Forester Advance", "Forester"], ["Legacy Outback", "Outback"],
    ["Levorg 1.6", "Levorg"], ["Xv 2.0i-L", "Xv"], ["Camry G", "Camry"], ["Lc LC500", "LC500"],
  ])("recognizes %s as family of %s", (trim, base) => {
    expect(estimateResaleAud(car({ make: "Subaru", model: base }), [
      car({ make: "Subaru", model: trim, price: 40_000 }),
      car({ make: "Subaru", model: trim, price: 42_000 }),
    ])).not.toBeNull();
  });
});
