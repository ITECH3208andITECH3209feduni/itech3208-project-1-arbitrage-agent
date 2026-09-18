import { describe, expect, it } from "vitest";
import { parseAnalystComparables } from "../src/analystData.js";

describe("analyst sale data", () => {
  it("parses CSV AU/AUD comparables and ignores invalid rows", () => {
    const result = parseAnalystComparables(
      "make,model,price,year,mileage,status\nToyota,Alphard,42000,2021,30000,sold\nToyota,,39000,2020,40000,sold\nToyota,Alphard,not-a-price,2020,40000,sold",
      "csv",
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      make: "Toyota",
      model: "Alphard",
      price: 42000,
      market: "AU",
      currency: "AUD",
      source: "analyst-local",
      soldStatus: "sold",
    });
  });

  it("parses JSON and maps asking status to unknown sale status", () => {
    const result = parseAnalystComparables(JSON.stringify([
      { make: "Lexus", model: "RX", priceAud: 51000, year: 2022, status: "asking" },
    ]), "json");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ make: "Lexus", model: "RX", price: 51000, soldStatus: "unknown" });
  });
});
