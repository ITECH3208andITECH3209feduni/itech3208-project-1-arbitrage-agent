import { describe, expect, it } from "vitest";
import {
  estimateFreshness,
  presentAuthoritativeEstimate,
} from "../src/ui/vehiclePresentation";

describe("vehicle presentation", () => {
  it("marks estimates stale after 24 hours using latest record timestamp", () => {
    const now = Date.parse("2026-08-14T12:00:00.000Z");
    expect(estimateFreshness("2026-08-13T12:00:00.000Z", now)).toEqual({ stale: true, label: "stale", ageHours: 24 });
    expect(estimateFreshness("2026-08-13T12:00:01.000Z", now).label).toBe("fresh");
    expect(estimateFreshness(undefined, now).stale).toBe(true);
  });

  it("presents only persisted estimate fields", () => {
    expect(presentAuthoritativeEstimate({
      estimatedResaleAud: 42000,
      estimatedResaleLowAud: 38000,
      estimatedResaleHighAud: 46000,
      estimatedProfitAud: 7000,
      resaleConfidence: 0.82,
      resaleConfidenceLabel: "high",
      resaleComparableCount: 12,
      resaleBasis: "sold",
      resaleConfidenceReasons: ["Strong model match"],
    })).toEqual({
      resale: 42000, low: 38000, high: 46000, profit: 7000,
      confidence: 82, confidenceLabel: "high", comparableCount: 12,
      basis: "sold", reasons: ["Strong model match"],
    });
    expect(presentAuthoritativeEstimate({})).toEqual({
      resale: null, low: null, high: null, profit: null,
      confidence: null, confidenceLabel: null, comparableCount: null,
      basis: null, reasons: [],
    });
  });
});
