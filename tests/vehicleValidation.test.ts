import { describe, expect, it } from "vitest";
import { applyEstimatedProfitAud } from "../src/profitEstimator.js";
import { validateVehicleRecord } from "../src/vehicleValidation.js";

function rawRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    url: "https://www.autotrader.com.au/car/15010116/lexus/rx350/nsw/minchinbury/suv",
    title: "2021 Lexus RX350",
    titleRaw: "2021 Lexus RX350",
    price: 20_000,
    priceRaw: "$20,000",
    mileage: 10_000,
    mileageRaw: "10,000 km",
    year: 2021,
    color: "White",
    colorRaw: "White",
    transmission: "Automatic",
    transmissionRaw: "Automatic",
    driveType: "AWD",
    driveTypeRaw: "AWD",
    engineSize: "3.5L",
    fuelType: "Petrol",
    fuelTypeRaw: "Petrol",
    bodyType: "SUV",
    bodyTypeRaw: "SUV",
    doors: 4,
    seats: 5,
    dealer: "Dealer",
    dealerRaw: "Dealer",
    location: "Sydney, NSW",
    locationRaw: "Sydney, NSW",
    description: "Clean car.",
    descriptionRaw: "Clean car.",
    images: [],
    extractedAt: "2026-01-01T00:00:00.000Z",
    market: "AU",
    source: "autotrader",
    sourceType: "dealer",
    currency: "AUD",
    ...overrides,
  };
}

describe("vehicleValidation", () => {
  it("strips LLM-provided estimatedProfitAud before comparable analysis", () => {
    const validated = validateVehicleRecord(rawRecord({ estimatedProfitAud: 999_999 }));

    expect(validated).not.toBeNull();
    expect(validated).not.toHaveProperty("estimatedProfitAud");
    expect(applyEstimatedProfitAud(validated!).estimatedProfitAud).toBeNull();
  });
});
