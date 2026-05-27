import { describe, expect, it } from "vitest";
import { applyEstimatedProfitAud, estimateProfitAud } from "../src/profitEstimator.js";
import type { VehicleRecord } from "../src/types.js";

describe("profitEstimator", () => {
  it("estimates profit as 1.5x price for now", () => {
    expect(estimateProfitAud({ price: 10_000, currency: "AUD" })).toBe(15_000);
  });

  it("returns null when price missing", () => {
    expect(estimateProfitAud({ price: null, currency: "AUD" })).toBeNull();
  });

  it("returns null for non-AUD prices until JP conversion logic exists", () => {
    expect(estimateProfitAud({ price: 1_000_000, currency: "JPY" })).toBeNull();
  });

  it("adds estimatedProfitAud after extraction", () => {
    const vehicle = {
      url: "https://example.com/car/1",
      title: "Car",
      titleRaw: "Car",
      currency: "AUD",
      price: 20_000,
      priceRaw: "$20,000",
      mileage: null,
      mileageRaw: "",
      year: null,
      color: "",
      colorRaw: "",
      transmission: "",
      transmissionRaw: "",
      driveType: "",
      driveTypeRaw: "",
      engineSize: "",
      fuelType: "",
      fuelTypeRaw: "",
      bodyType: "",
      bodyTypeRaw: "",
      doors: null,
      seats: null,
      dealer: "",
      dealerRaw: "",
      location: "",
      locationRaw: "",
      description: "",
      descriptionRaw: "",
      images: [],
      extractedAt: "2026-01-01T00:00:00.000Z",
    } satisfies Omit<VehicleRecord, "estimatedProfitAud">;

    expect(applyEstimatedProfitAud(vehicle).estimatedProfitAud).toBe(30_000);
  });
});
