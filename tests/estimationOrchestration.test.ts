import { describe, expect, it } from "vitest";
import { vehicleFields } from "../convex/vehicleFields.js";
import type { VehicleRecord } from "../src/types.js";
import { orchestrateEstimates, prepareRefreshRecord } from "../src/estimationOrchestration.js";

const record = (overrides: Partial<VehicleRecord> = {}) => ({
  url: "https://example.test/car/1", title: "Toyota Alphard", titleRaw: "Toyota Alphard",
  price: 2_000_000, priceRaw: "¥2,000,000", mileage: 40_000, mileageRaw: "40,000 km",
  year: 2020, color: "", colorRaw: "", transmission: "Automatic", transmissionRaw: "",
  driveType: "", driveTypeRaw: "", engineSize: "", fuelType: "", fuelTypeRaw: "",
  bodyType: "", bodyTypeRaw: "", doors: null, seats: null, dealer: "", dealerRaw: "",
  location: "", locationRaw: "", description: "", descriptionRaw: "", images: [],
  extractedAt: "2026-01-01T00:00:00.000Z", make: "Toyota", model: "Alphard",
  market: "JP", currency: "JPY", ...overrides,
} satisfies VehicleRecord);

describe("estimation orchestration", () => {
  it("produces complete purchase/import fields for JP records", () => {
    const result = orchestrateEstimates([record()], new Map(), 0.01)[0];
    expect(result).toMatchObject({ purchaseAud: 20_000, importCostAud: 7_365.2, landedCostAud: 25_410, driveawayCostAud: 27_365.2, estimatedProfitAud: null, resaleComparableCount: 0 });
  });

  it("keeps JP estimate fields compatible with Convex vehicle storage", () => {
    const result = orchestrateEstimates([record({ isGreenPassengerCar: true })], new Map(), 0.01)[0];
    const unknownFields = Object.keys(result).filter((field) => !(field in vehicleFields));

    expect(unknownFields).toEqual([]);
    expect(result).toMatchObject({
      estimatedProfitAud: null,
      resaleConfidence: null,
      isGreenPassengerCar: true,
    });
  });

  it("applies saved dealership cost settings to the vehicle estimate", () => {
    const result = orchestrateEstimates([record({
      agentFeeAud: 100,
      freightAud: 500,
      insuranceRate: 0.02,
      overrideCustomsDutyRate: 0.1,
    })], new Map(), 0.01)[0];

    expect(result).toMatchObject({
      landedCostAud: 25_313.2,
      landedCostBreakdown: {
        agentFee: { amount: 100 },
        freight: { amount: 500 },
        insurance: { amount: 402 },
        customsDuty: { amount: 2_010 },
      },
    });
  });

  it("clears estimates when comparables are sparse", () => {
    const result = orchestrateEstimates([record({ estimatedProfitAud: 9_999 })], new Map(), 0.01)[0];
    expect(result.estimatedProfitAud).toBeNull();
    expect(result.estimatedResaleAud).toBeNull();
  });

  it("preserves source and auction metadata during refresh", () => {
    const result = prepareRefreshRecord(record({ source: undefined, sourceId: undefined }), record({ source: "goo-net", sourceId: "abc", auctionHouse: "USS Tokyo" }), [], 0.01);
    expect(result).toMatchObject({ source: "goo-net", sourceId: "abc", auctionHouse: "USS Tokyo" });
    expect(result.estimatedProfitAud).toBeNull();
  });

  it("preserves stored values when refresh extraction omits fields", () => {
    const existing = {
      ...record({ price: 2_500_000, mileage: 30_000, dealer: "Stored dealer", images: ["stored.jpg"] }),
      _id: "vehicle-id",
      _creationTime: 123,
      updatedAt: "2026-01-15T00:00:00.000Z",
      normalizedMake: "toyota",
      normalizedModel: "alphard",
    } as unknown as VehicleRecord;
    const result = prepareRefreshRecord(
      record({ price: null, mileage: null, dealer: "", images: [], extractedAt: "2026-02-01T00:00:00.000Z" }),
      existing,
      [],
      0.01,
    );
    expect(result).toMatchObject({ price: 2_500_000, mileage: 30_000, dealer: "Stored dealer", images: ["stored.jpg"], extractedAt: "2026-02-01T00:00:00.000Z" });
    expect(result).not.toHaveProperty("_id");
    expect(result).not.toHaveProperty("_creationTime");
    expect(result).not.toHaveProperty("updatedAt");
  });
});
