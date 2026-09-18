import type {
  AuctionSheetInput,
  ComplianceAssessment,
  ComplianceInput,
  ComplianceResult,
  Confidence,
  LineItem,
} from "./types";

const LCT_THRESHOLD_FUEL_EFFICIENT_2026_27 = 91661;
const LCT_THRESHOLD_OTHER_2026_27 = 80809;
const LCT_RATE = 0.33;

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

export function validateComplianceInput(input: ComplianceInput): void {
  const numericFields: Array<keyof ComplianceInput> = [
    "vehicleValue", "ageYears", "registrationFee", "tacFee", "plateFee", "ravAssessmentFee", "roadworthyRepairs",
    "vassCertificate", "complianceWorkshopFee", "modificationCosts", "overrideRoadworthyInspection",
    "overrideVassCertificate", "overrideRegistrationFee", "overrideTacFee", "overridePlateFee", "contingencyFee",
  ];
  for (const field of numericFields) {
    const value = input[field];
    if (value != null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
      throw new Error(`${String(field)} must be a finite number >= 0`);
    }
  }

  const isPassengerVehicle = input.isPassengerVehicle ?? true;
  const isNonPassengerVehicle = input.isNonPassengerVehicle ?? false;
  if (isPassengerVehicle && isNonPassengerVehicle) throw new Error("Vehicle cannot be both passenger and non-passenger");
  if (!isPassengerVehicle && !isNonPassengerVehicle) throw new Error("Vehicle must be passenger or non-passenger");

  const damageCodes = input.auctionSheet?.damageCodes;
  if (damageCodes != null && (!Array.isArray(damageCodes) || damageCodes.some((code) => typeof code !== "string"))) {
    throw new Error("auctionSheet.damageCodes must be an array of strings");
  }
}

/** Estimate a separately visible allowance for auction-sheet condition risk. */
export function estimateAuctionSheetRisk(input: AuctionSheetInput | null | undefined): { cost: number; reasons: string[] } {
  if (!input) return { cost: 0, reasons: [] };
  let cost = 0;
  const reasons: string[] = [];
  const exterior = input.exteriorGrade?.trim().toUpperCase() ?? "";
  const interior = input.interiorGrade?.trim().toUpperCase() ?? "";
  if (/^(R|RA|1|2)/.test(exterior)) { cost += 2500; reasons.push(`exterior grade ${exterior} indicates significant condition risk`); }
  else if (/^3/.test(exterior)) { cost += 1200; reasons.push(`exterior grade ${exterior} indicates repair risk`); }
  else if (exterior && !/^(4|5|6|A|S|B)/.test(exterior)) { cost += 600; reasons.push(`unrecognised exterior grade ${exterior} requires review`); }
  if (/^D/.test(interior)) { cost += 1000; reasons.push(`interior grade ${interior} indicates significant wear`); }
  else if (/^C/.test(interior)) { cost += 500; reasons.push(`interior grade ${interior} indicates wear`); }
  if (input.mileageWarning?.trim()) { cost += 750; reasons.push(`mileage warning: ${input.mileageWarning.trim()}`); }
  if (input.ownershipHistory?.trim()) {
    const history = input.ownershipHistory.trim();
    const amount = /accident|repair|flood|fire|replaced|structur/i.test(history) ? 1250 : 250;
    cost += amount;
    reasons.push(`ownership history requires review: ${history}`);
  }
  const notes = input.inspectorNotes?.trim();
  if (notes) {
    const amount = /accident|damage|rust|corrosion|leak|repair|oil|flood|fire|broken/i.test(notes) ? 1500 : 300;
    cost += amount;
    reasons.push(`inspector notes require review: ${notes}`);
  }
  const damageCodes = input.damageCodes?.filter(Boolean) ?? [];
  if (damageCodes.length > 0) {
    cost += Math.min(2000, damageCodes.length * 400);
    reasons.push(`auction damage codes present: ${damageCodes.join(", ")}`);
  }
  return { cost: money(cost), reasons };
}

export function calcLct(vehicleValue: number, isFuelEfficient: boolean): number {
  if (!Number.isFinite(vehicleValue) || vehicleValue < 0) {
    throw new Error("vehicleValue must be a finite number >= 0");
  }
  const threshold = isFuelEfficient
    ? LCT_THRESHOLD_FUEL_EFFICIENT_2026_27
    : LCT_THRESHOLD_OTHER_2026_27;
  return money(Math.max(0, vehicleValue - threshold) * LCT_RATE);
}

export function calcVicMotorVehicleDuty(input: {
  vehicleValue: number;
  isGreenPassengerCar: boolean;
  isPassengerVehicle: boolean;
  isNonPassengerVehicle: boolean;
  isNonPassengerNew: boolean;
}): number {
  if (!Number.isFinite(input.vehicleValue) || input.vehicleValue < 0) {
    throw new Error("vehicleValue must be a finite number >= 0");
  }
  const units = Math.ceil(input.vehicleValue / 200);

  if (input.isPassengerVehicle && input.isGreenPassengerCar) {
    return money(units * 8.4);
  }

  if (input.isPassengerVehicle) {
    let rate = 0;
    if (input.vehicleValue <= 80809) rate = 8.4;
    else if (input.vehicleValue <= 100000) rate = 10.4;
    else if (input.vehicleValue <= 150000) rate = 14.0;
    else rate = 18.0;

    return money(units * rate);
  }

  if (input.isNonPassengerVehicle) {
    return money(units * (input.isNonPassengerNew ? 5.4 : 8.4));
  }

  return 0;
}

export function estimateRoadworthy(ageYears: number, is4wd: boolean): number {
  if (!Number.isFinite(ageYears) || ageYears < 0) {
    throw new Error("ageYears must be a finite number >= 0");
  }
  return ageYears > 15 || is4wd ? 330 : 280;
}

export function estimateVassIfNeeded(
  modifiedVehicle: boolean,
  convertedToRhd: boolean
): number {
  return modifiedVehicle || convertedToRhd ? 900 : 0;
}

export function estimateWorkshopIfNeeded(
  importedVehicle: boolean,
  modifiedVehicle: boolean
): number {
  if (importedVehicle && modifiedVehicle) return 1200;
  if (importedVehicle) return 600;
  return 0;
}

function buildLineItem(
  amount: number,
  confidence: Confidence,
  source: string
): LineItem {
  return {
    amount: money(amount),
    confidence,
    source,
  };
}

export function assessRequirements(input: ComplianceInput): ComplianceAssessment {
  const warnings: string[] = [];
  let manualReviewRequired = false;

  const importedVehicle = input.importedVehicle ?? true;

  const requiresRwc = true;
  const requiresRavCheck = importedVehicle;
  const requiresVassReview = !!input.modifiedVehicle || !!input.convertedToRhd;

  if (importedVehicle && input.ravRecorded === false) {
    warnings.push("Imported vehicle not marked as RAV-recorded; registration readiness not complete.");
    manualReviewRequired = true;
  }

  if (input.convertedToRhd) {
    warnings.push("Converted-to-RHD vehicle may require VASS approval and additional verification.");
    manualReviewRequired = true;
  }

  if (input.modifiedVehicle) {
    warnings.push("Modified vehicle flagged; confirm whether VASS certificate is required.");
    manualReviewRequired = true;
  }

  if (input.ageYears > 15) {
    warnings.push("Vehicle older than 15 years; confirm registration/import pathway and inspection assumptions.");
  }

  if (input.is4wd) {
    warnings.push("4WD flagged; roadworthy estimate increased.");
  }

  if (input.registrationFee == null && input.overrideRegistrationFee == null) {
    warnings.push("Registration fee not supplied; total excludes this unless overridden.");
  }

  if (input.tacFee == null && input.overrideTacFee == null) {
    warnings.push("TAC fee not supplied; total excludes this unless overridden.");
  }

  if (input.plateFee == null && input.overridePlateFee == null) {
    warnings.push("Plate fee not supplied; total excludes this unless overridden.");
  }

  if (input.importedVehicle !== false && input.ravAssessmentFee == null) {
    warnings.push("RAV assessment fee not supplied; total excludes this unless overridden.");
  }

  const auctionRisk = estimateAuctionSheetRisk(input.auctionSheet);
  if (auctionRisk.reasons.length > 0) {
    warnings.push(...auctionRisk.reasons.map((reason) => `Auction-sheet risk: ${reason}.`));
    manualReviewRequired = true;
  }

  return {
    requiresRwc,
    requiresRavCheck,
    requiresVassReview,
    manualReviewRequired,
    warnings,
  };
}

export function calculateComplianceModule(
  input: ComplianceInput
): ComplianceResult {
  validateComplianceInput(input);

  const assessment = assessRequirements(input);
  const importedVehicle = input.importedVehicle ?? true;

  const lct = calcLct(input.vehicleValue, !!input.isFuelEfficient);

  const duty = calcVicMotorVehicleDuty({
    vehicleValue: input.vehicleValue,
    isGreenPassengerCar: !!input.isGreenPassengerCar,
    isPassengerVehicle: input.isPassengerVehicle ?? true,
    isNonPassengerVehicle: !!input.isNonPassengerVehicle,
    isNonPassengerNew: !!input.isNonPassengerNew,
  });

  const roadworthy =
    input.overrideRoadworthyInspection != null
      ? input.overrideRoadworthyInspection
      : estimateRoadworthy(input.ageYears, !!input.is4wd);

  const vass =
    input.overrideVassCertificate != null
      ? input.overrideVassCertificate
      : input.vassCertificate != null
      ? input.vassCertificate
      : estimateVassIfNeeded(!!input.modifiedVehicle, !!input.convertedToRhd);

  const registrationFee =
    input.overrideRegistrationFee != null
      ? input.overrideRegistrationFee
      : input.registrationFee ?? 0;

  const tacFee =
    input.overrideTacFee != null
      ? input.overrideTacFee
      : input.tacFee ?? 0;

  const plateFee =
    input.overridePlateFee != null
      ? input.overridePlateFee
      : input.plateFee ?? 0;

  const ravAssessmentFee = input.ravAssessmentFee ?? 0;
  const auctionRisk = estimateAuctionSheetRisk(input.auctionSheet);

  const complianceWorkshopFee =
    input.complianceWorkshopFee != null
      ? input.complianceWorkshopFee
      : estimateWorkshopIfNeeded(importedVehicle, !!input.modifiedVehicle);

  const modificationCosts = input.modificationCosts ?? 0;
  const roadworthyRepairs = input.roadworthyRepairs ?? 0;
  const contingencyFee = input.contingencyFee ?? 0;

  const breakdown: Record<string, LineItem> = {
    luxuryCarTax: buildLineItem(lct, "official_rule", "ATO threshold/rate"),
    motorVehicleDuty: buildLineItem(duty, "official_rule", "VIC duty rules"),
    roadworthyInspection: buildLineItem(
      roadworthy,
      input.overrideRoadworthyInspection == null ? "estimate" : "manual_input_required",
      "Team heuristic or override"
    ),
    vassCertificate: buildLineItem(
      vass,
      input.overrideVassCertificate == null && input.vassCertificate == null
        ? "estimate"
        : "manual_input_required",
      "Estimate or analyst input"
    ),
    ravAssessmentFee: buildLineItem(
      ravAssessmentFee,
      input.ravAssessmentFee == null ? "manual_input_required" : "official_but_variable",
      "RAV assessment fee input"
    ),
    registrationFee: buildLineItem(
      registrationFee,
      input.registrationFee == null && input.overrideRegistrationFee == null
        ? "manual_input_required"
        : "official_but_variable",
      "VicRoads fee input"
    ),
    tacFee: buildLineItem(
      tacFee,
      input.tacFee == null && input.overrideTacFee == null
        ? "manual_input_required"
        : "official_but_variable",
      "VicRoads fee input"
    ),
    plateFee: buildLineItem(
      plateFee,
      input.plateFee == null && input.overridePlateFee == null
        ? "manual_input_required"
        : "official_but_variable",
      "VicRoads fee input"
    ),
    complianceWorkshopFee: buildLineItem(
      complianceWorkshopFee,
      input.complianceWorkshopFee == null ? "estimate" : "manual_input_required",
      "Estimate or analyst input"
    ),
    modificationCosts: buildLineItem(
      modificationCosts,
      modificationCosts > 0 ? "estimate" : "manual_input_required",
      "Analyst or upstream system"
    ),
    roadworthyRepairs: buildLineItem(
      roadworthyRepairs,
      roadworthyRepairs > 0 ? "estimate" : "manual_input_required",
      "Analyst or inspection estimate"
    ),
    contingencyFee: buildLineItem(contingencyFee, "estimate", "Business rule"),
    auctionSheetRiskCost: buildLineItem(
      auctionRisk.cost,
      auctionRisk.reasons.length === 0 ? "estimate" : "manual_input_required",
      auctionRisk.reasons.length === 0 ? "No auction-sheet risk signals" : auctionRisk.reasons.join("; ")
    ),
  };

  const totalComplianceCost = money(
    Object.values(breakdown).reduce((sum, item) => sum + item.amount, 0)
  );

  return {
    jurisdiction: "VIC",
    module: "vehicle_compliance",
    assessment,
    inputs: {
      ravAssessmentFee,
      auctionSheet: input.auctionSheet ?? null,
      vehicleValue: input.vehicleValue,
      ageYears: input.ageYears,
      is4wd: !!input.is4wd,
      isFuelEfficient: !!input.isFuelEfficient,
      isGreenPassengerCar: !!input.isGreenPassengerCar,
      isPassengerVehicle: input.isPassengerVehicle ?? true,
      isNonPassengerVehicle: !!input.isNonPassengerVehicle,
      importedVehicle,
      modifiedVehicle: !!input.modifiedVehicle,
      convertedToRhd: !!input.convertedToRhd,
    },
    breakdown,
    totalComplianceCost,
  };
}
