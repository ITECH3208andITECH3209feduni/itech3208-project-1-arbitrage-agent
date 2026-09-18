import { describe, expect, it } from "vitest";
import { calculateLandedCost } from "../src/landedCost/landedCost.js";
import { calculateComplianceModule, estimateAuctionSheetRisk } from "../src/compliance/compliance.js";

describe("explicit import and auction-sheet costs", () => {
  it("keeps explicit import categories visible and uses the exchange rate", () => {
    const result = calculateLandedCost({
      purchasePriceJpy: 1_000_000,
      jpyToAudRate: 0.01,
      agentFeeAud: 100,
      inlandTransportAud: 200,
      exportPaperworkAud: 50,
      wharfHandlingAud: 75,
      customsBrokerageAud: 80,
      biosecurityAud: 30,
      adrEngineeringAud: 0,
      freightAud: 500,
      insuranceAud: 0,
      japaneseOriginProof: true,
    });

    expect(result.exchangeRateUsed).toBe(0.01);
    expect(result.fobValueAud).toBe(10535);
    expect(result.breakdown.agentFee.amount).toBe(100);
    expect(result.breakdown.wharfHandling.amount).toBe(75);
    expect(result.breakdown.exchangeRate.amount).toBe(0);
  });

  it("turns auction-sheet risk into a separate compliance allowance", () => {
    const risk = estimateAuctionSheetRisk({
      exteriorGrade: "R",
      interiorGrade: "D",
      mileageWarning: "Odometer tampering suspected",
      damageCodes: ["A", "U"],
    });
    expect(risk.cost).toBe(5_050);
    expect(risk.reasons.length).toBeGreaterThan(2);

    const result = calculateComplianceModule({
      vehicleValue: 20_000,
      ageYears: 5,
      auctionSheet: { exteriorGrade: "R", damageCodes: ["A"] },
    });
    expect(result.breakdown.auctionSheetRiskCost.amount).toBe(2_900);
    expect(result.assessment.manualReviewRequired).toBe(true);
  });
});
