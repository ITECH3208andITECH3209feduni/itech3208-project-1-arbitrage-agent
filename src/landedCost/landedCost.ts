import type { LineItem } from "../compliance/types";
import { calculateComplianceModule } from "../compliance/compliance";
import type {
  DriveawayInput,
  DriveawayResult,
  LandedCostInput,
  LandedCostResult,
} from "./types";

// Standard customs duty on passenger motor vehicles (tariff heading 8703).
export const STANDARD_CUSTOMS_DUTY_RATE = 0.05;
// Duty rate for cars built in Japan when proof of origin is supplied (JAEPA).
export const JAEPA_CUSTOMS_DUTY_RATE = 0;
// GST on imports is 10% of the value of the taxable importation.
export const IMPORT_GST_RATE = 0.1;

// Team estimates. These are not official rules and can be overridden.
export const DEFAULT_FREIGHT_AUD = 1800;
export const DEFAULT_INSURANCE_RATE = 0.015;

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function checkNotNegative(value: number | null | undefined, name: string): void {
  if (value != null && (!Number.isFinite(value) || value < 0)) {
    throw new Error(`${name} must be a number >= 0`);
  }
}

export function validateLandedCostInput(input: LandedCostInput): void {
  const hasJpy = input.purchasePriceJpy != null;
  const hasAud = input.purchasePriceAud != null;

  if (hasJpy && hasAud) {
    throw new Error("Supply purchasePriceJpy or purchasePriceAud, not both");
  }

  if (!hasJpy && !hasAud) {
    throw new Error("purchasePriceJpy or purchasePriceAud is required");
  }

  if (hasJpy && (input.jpyToAudRate == null || !Number.isFinite(input.jpyToAudRate) || input.jpyToAudRate <= 0)) {
    throw new Error("jpyToAudRate must be > 0 when purchasePriceJpy is used");
  }

  checkNotNegative(input.purchasePriceJpy, "purchasePriceJpy");
  checkNotNegative(input.purchasePriceAud, "purchasePriceAud");
  checkNotNegative(input.japanSideCostsAud, "japanSideCostsAud");
  checkNotNegative(input.agentFeeAud, "agentFeeAud");
  checkNotNegative(input.inlandTransportAud, "inlandTransportAud");
  checkNotNegative(input.exportPaperworkAud, "exportPaperworkAud");
  checkNotNegative(input.wharfHandlingAud, "wharfHandlingAud");
  checkNotNegative(input.customsBrokerageAud, "customsBrokerageAud");
  checkNotNegative(input.biosecurityAud, "biosecurityAud");
  checkNotNegative(input.adrEngineeringAud, "adrEngineeringAud");
  checkNotNegative(input.freightAud, "freightAud");
  checkNotNegative(input.insuranceAud, "insuranceAud");
  checkNotNegative(input.repairCostsAud, "repairCostsAud");

  if (
    input.overrideCustomsDutyRate != null &&
    (!Number.isFinite(input.overrideCustomsDutyRate) ||
      input.overrideCustomsDutyRate < 0 ||
      input.overrideCustomsDutyRate > 1)
  ) {
    throw new Error("overrideCustomsDutyRate must be between 0 and 1");
  }
}

export function convertPurchasePriceToAud(input: LandedCostInput): number {
  if (input.purchasePriceAud != null) return money(input.purchasePriceAud);
  return money((input.purchasePriceJpy as number) * (input.jpyToAudRate as number));
}

export function getCustomsDutyRate(input: LandedCostInput): number {
  if (input.overrideCustomsDutyRate != null) return input.overrideCustomsDutyRate;
  return input.japaneseOriginProof ? JAEPA_CUSTOMS_DUTY_RATE : STANDARD_CUSTOMS_DUTY_RATE;
}

/** Customs duty is worked out on the customs value, which in Australia is the FOB value. */
export function calcCustomsDuty(fobValueAud: number, dutyRate: number): number {
  return money(fobValueAud * dutyRate);
}

/** Value of taxable importation = customs value + customs duty + international transport and insurance. */
export function calcValueOfTaxableImportation(
  fobValueAud: number,
  customsDutyAud: number,
  freightAud: number,
  insuranceAud: number
): number {
  return money(fobValueAud + customsDutyAud + freightAud + insuranceAud);
}

export function calcImportGst(valueOfTaxableImportationAud: number): number {
  return money(valueOfTaxableImportationAud * IMPORT_GST_RATE);
}

const EXPLICIT_JAPAN_COST_FIELDS = [
  "agentFeeAud", "inlandTransportAud", "exportPaperworkAud", "wharfHandlingAud",
  "customsBrokerageAud", "biosecurityAud", "adrEngineeringAud",
] as const;

function explicitJapanCosts(input: LandedCostInput): { total: number; supplied: boolean } {
  const supplied = EXPLICIT_JAPAN_COST_FIELDS.some((field) => input[field] != null);
  if (!supplied) return { total: input.japanSideCostsAud ?? 0, supplied: false };
  return {
    total: money(EXPLICIT_JAPAN_COST_FIELDS.reduce((sum, field) => sum + (input[field] ?? 0), 0)),
    supplied: true,
  };
}

function buildLineItem(amount: number, confidence: LineItem["confidence"], source: string): LineItem {
  return { amount: money(amount), confidence, source };
}

export function calculateLandedCost(input: LandedCostInput): LandedCostResult {
  validateLandedCostInput(input);

  const warnings: string[] = [];

  const purchaseAud = convertPurchasePriceToAud(input);
  const japanCosts = explicitJapanCosts(input);
  const japanSideCostsAud = japanCosts.total;
  const fobValueAud = money(purchaseAud + japanSideCostsAud);

  if (!japanCosts.supplied && input.japanSideCostsAud == null) {
    warnings.push("Japan-side costs (agent fee, inland transport) not supplied; FOB value may be too low.");
  }
  if (japanCosts.supplied) {
    for (const field of EXPLICIT_JAPAN_COST_FIELDS) {
      if (input[field] == null) warnings.push(`${field} not supplied; explicit Japan-side cost total excludes it.`);
    }
  }

  const freightAud = input.freightAud ?? DEFAULT_FREIGHT_AUD;
  if (input.freightAud == null) {
    warnings.push(`Freight not supplied; using team estimate of $${DEFAULT_FREIGHT_AUD}.`);
  }

  const insuranceAud = input.insuranceAud ?? money(fobValueAud * DEFAULT_INSURANCE_RATE);
  if (input.insuranceAud == null) {
    warnings.push(`Insurance not supplied; using ${DEFAULT_INSURANCE_RATE * 100}% of FOB value.`);
  }

  const customsDutyRate = getCustomsDutyRate(input);
  if (input.overrideCustomsDutyRate == null && !input.japaneseOriginProof) {
    warnings.push("Japanese origin proof not confirmed; customs duty charged at 5%. Set japaneseOriginProof to true for 0% under JAEPA.");
  }

  const customsDutyAud = calcCustomsDuty(fobValueAud, customsDutyRate);
  const valueOfTaxableImportationAud = calcValueOfTaxableImportation(
    fobValueAud,
    customsDutyAud,
    freightAud,
    insuranceAud
  );
  const importGstAud = calcImportGst(valueOfTaxableImportationAud);

  const repairCostsAud = money(input.repairCostsAud ?? 0);
  if (input.repairCostsAud == null) {
    warnings.push("Repair costs not supplied; driveaway total excludes repairs.");
  }

  const breakdown: Record<string, LineItem> = {
    exchangeRate: buildLineItem(0, input.jpyToAudRate == null ? "manual_input_required" : "official_but_variable", input.jpyToAudRate == null ? "No JPY exchange rate supplied" : `JPY to AUD rate ${input.jpyToAudRate}`),
    purchasePrice: buildLineItem(
      purchaseAud,
      input.purchasePriceAud != null ? "manual_input_required" : "official_but_variable",
      input.purchasePriceAud != null ? "Price supplied in AUD" : "JPY price x exchange rate"
    ),
    agentFee: buildLineItem(input.agentFeeAud ?? 0, input.agentFeeAud == null ? "manual_input_required" : "estimate", "Agent fee input"),
    inlandTransport: buildLineItem(input.inlandTransportAud ?? 0, input.inlandTransportAud == null ? "manual_input_required" : "estimate", "Inland transport input"),
    exportPaperwork: buildLineItem(input.exportPaperworkAud ?? 0, input.exportPaperworkAud == null ? "manual_input_required" : "estimate", "Export paperwork input"),
    wharfHandling: buildLineItem(input.wharfHandlingAud ?? 0, input.wharfHandlingAud == null ? "manual_input_required" : "estimate", "Wharf handling input"),
    customsBrokerage: buildLineItem(input.customsBrokerageAud ?? 0, input.customsBrokerageAud == null ? "manual_input_required" : "estimate", "Customs brokerage input"),
    biosecurity: buildLineItem(input.biosecurityAud ?? 0, input.biosecurityAud == null ? "manual_input_required" : "estimate", "Biosecurity input"),
    adrEngineering: buildLineItem(input.adrEngineeringAud ?? 0, input.adrEngineeringAud == null ? "manual_input_required" : "estimate", "ADR engineering input"),
    japanSideCosts: buildLineItem(
      japanCosts.supplied ? 0 : japanSideCostsAud,
      !japanCosts.supplied && input.japanSideCostsAud == null ? "manual_input_required" : "estimate",
      japanCosts.supplied ? "Legacy aggregate ignored because explicit categories were supplied" : "Agent or analyst input"
    ),
    freight: buildLineItem(
      freightAud,
      "estimate",
      input.freightAud == null ? "Team default estimate" : "Shipping quote or analyst input"
    ),
    insurance: buildLineItem(
      insuranceAud,
      "estimate",
      input.insuranceAud == null ? "Percentage of FOB value" : "Insurance quote or analyst input"
    ),
    customsDuty: buildLineItem(
      customsDutyAud,
      input.overrideCustomsDutyRate == null ? "official_rule" : "manual_input_required",
      input.overrideCustomsDutyRate == null
        ? input.japaneseOriginProof
          ? "ABF: 0% under JAEPA with proof of origin"
          : "ABF: 5% on customs value (FOB)"
        : "Duty rate override"
    ),
    importGst: buildLineItem(importGstAud, "official_rule", "ABF: 10% of value of taxable importation"),
  };

  const totalLandedCostAud = money(valueOfTaxableImportationAud + importGstAud);

  return {
    module: "import_landed_cost",
    currency: "AUD",
    warnings,
    breakdown,
    fobValueAud,
    customsDutyRate,
    exchangeRateUsed: input.jpyToAudRate ?? null,
    valueOfTaxableImportationAud,
    startingCostAud: totalLandedCostAud,
    totalLandedCostAud,
    repairCostsAud,
  };
}

/**
 * Purchase to driveaway total for Victoria.
 * Joins this module with the compliance module so nothing is counted twice:
 * - vehicleValue for the compliance module is the landed cost (value of taxable importation + import GST).
 * - repair costs are passed to the compliance module as roadworthyRepairs.
 */
export function calculateDriveawayCost(input: DriveawayInput): DriveawayResult {
  const landedCost = calculateLandedCost(input);

  const compliance = calculateComplianceModule({
    ...input.compliance,
    vehicleValue: landedCost.totalLandedCostAud,
    roadworthyRepairs: landedCost.repairCostsAud,
  });

  return {
    landedCost,
    compliance,
    totalDriveawayCostAud: money(landedCost.totalLandedCostAud + compliance.totalComplianceCost),
    warnings: [...landedCost.warnings, ...compliance.assessment.warnings],
  };
}
