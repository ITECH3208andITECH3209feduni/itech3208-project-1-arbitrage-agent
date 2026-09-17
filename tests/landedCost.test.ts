import { describe, expect, it } from "vitest";
import {
  calcCustomsDuty,
  calcImportGst,
  calcValueOfTaxableImportation,
  calculateDriveawayCost,
  calculateLandedCost,
  DEFAULT_FREIGHT_AUD,
} from "../src/landedCost/landedCost";

describe("landed cost helpers", () => {
  it("works out customs duty on the FOB value", () => {
    expect(calcCustomsDuty(10000, 0.05)).toBe(500);
    expect(calcCustomsDuty(10000, 0)).toBe(0);
  });

  it("works out the value of taxable importation and GST", () => {
    const voti = calcValueOfTaxableImportation(10000, 500, 2000, 300);
    expect(voti).toBe(12800);
    expect(calcImportGst(voti)).toBe(1280);
  });
});

describe("calculateLandedCost", () => {
  it("matches the Toyota Aqua worked example (JAEPA, 0% duty)", () => {
    const result = calculateLandedCost({
      purchasePriceJpy: 820000,
      jpyToAudRate: 0.009,
      japanSideCostsAud: 0,
      freightAud: 1800,
      insuranceAud: 100,
      japaneseOriginProof: true,
    });

    expect(result.fobValueAud).toBe(7380);
    expect(result.customsDutyRate).toBe(0);
    expect(result.breakdown.customsDuty.amount).toBe(0);
    expect(result.valueOfTaxableImportationAud).toBe(9280);
    expect(result.breakdown.importGst.amount).toBe(928);
    expect(result.totalLandedCostAud).toBe(10208);
  });

  it("charges 5% duty when Japanese origin proof is not confirmed", () => {
    const result = calculateLandedCost({
      purchasePriceAud: 10000,
      japanSideCostsAud: 0,
      freightAud: 2000,
      insuranceAud: 300,
    });

    expect(result.customsDutyRate).toBe(0.05);
    expect(result.breakdown.customsDuty.amount).toBe(500);
    expect(result.breakdown.importGst.amount).toBe(1280);
    expect(result.totalLandedCostAud).toBe(14080);
    expect(result.warnings.some((w) => w.includes("customs duty charged at 5%"))).toBe(true);
  });

  it("adds Japan-side costs into the FOB value", () => {
    const result = calculateLandedCost({
      purchasePriceAud: 7000,
      japanSideCostsAud: 500,
      freightAud: 1800,
      insuranceAud: 100,
      japaneseOriginProof: true,
    });

    expect(result.fobValueAud).toBe(7500);
    expect(result.totalLandedCostAud).toBe(10340);
  });

  it("uses default freight and insurance with warnings", () => {
    const result = calculateLandedCost({
      purchasePriceAud: 10000,
      japanSideCostsAud: 0,
      japaneseOriginProof: true,
    });

    expect(result.breakdown.freight.amount).toBe(DEFAULT_FREIGHT_AUD);
    expect(result.breakdown.insurance.amount).toBe(150);
    expect(result.warnings.some((w) => w.includes("Freight not supplied"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("Insurance not supplied"))).toBe(true);
  });

  it("uses the duty rate override when given", () => {
    const result = calculateLandedCost({
      purchasePriceAud: 10000,
      japanSideCostsAud: 0,
      freightAud: 0,
      insuranceAud: 0,
      overrideCustomsDutyRate: 0.1,
    });

    expect(result.breakdown.customsDuty.amount).toBe(1000);
    expect(result.breakdown.customsDuty.confidence).toBe("manual_input_required");
  });

  it("rejects bad input", () => {
    expect(() => calculateLandedCost({})).toThrow("purchasePriceJpy or purchasePriceAud is required");
    expect(() => calculateLandedCost({ purchasePriceJpy: 100000 })).toThrow("jpyToAudRate");
    expect(() => calculateLandedCost({ purchasePriceJpy: 100000, purchasePriceAud: 900, jpyToAudRate: 0.009 })).toThrow("not both");
    expect(() => calculateLandedCost({ purchasePriceJpy: 100000, jpyToAudRate: Infinity })).toThrow("jpyToAudRate");
    expect(() => calculateLandedCost({ purchasePriceJpy: 100000, jpyToAudRate: 0 })).toThrow("jpyToAudRate");
    expect(() => calculateLandedCost({ purchasePriceAud: -1 })).toThrow("purchasePriceAud");
    expect(() => calculateLandedCost({ purchasePriceAud: 1000, freightAud: -5 })).toThrow("freightAud");
    expect(() => calculateLandedCost({ purchasePriceAud: 1000, overrideCustomsDutyRate: 2 })).toThrow("overrideCustomsDutyRate");
  });
});

describe("calculateDriveawayCost", () => {
  it("joins landed cost with the compliance module without double counting repairs", () => {
    const result = calculateDriveawayCost({
      purchasePriceJpy: 820000,
      jpyToAudRate: 0.009,
      japanSideCostsAud: 0,
      freightAud: 1800,
      insuranceAud: 100,
      japaneseOriginProof: true,
      repairCostsAud: 500,
      compliance: {
        ageYears: 10,
        registrationFee: 0,
        tacFee: 0,
        plateFee: 0,
      },
    });

    // Landed cost 10,208. VIC duty: ceil(10208 / 200) = 52 units x $8.40 = $436.80.
    expect(result.landedCost.totalLandedCostAud).toBe(10208);
    expect(result.compliance.breakdown.motorVehicleDuty.amount).toBe(436.8);
    expect(result.compliance.breakdown.luxuryCarTax.amount).toBe(0);
    expect(result.compliance.breakdown.roadworthyInspection.amount).toBe(280);
    expect(result.compliance.breakdown.complianceWorkshopFee.amount).toBe(600);
    expect(result.compliance.breakdown.roadworthyRepairs.amount).toBe(500);

    // 436.80 + 280 + 600 + 500 = 1,816.80
    expect(result.compliance.totalComplianceCost).toBe(1816.8);
    expect(result.totalDriveawayCostAud).toBe(12024.8);
  });
});
