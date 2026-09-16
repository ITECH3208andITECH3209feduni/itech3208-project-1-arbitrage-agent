import type {
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
  if (input.vehicleValue < 0) {
    throw new Error("vehicleValue must be >= 0");
  }

  if (input.ageYears < 0) {
    throw new Error("ageYears must be >= 0");
  }

  const isPassengerVehicle = input.isPassengerVehicle ?? true;
  const isNonPassengerVehicle = input.isNonPassengerVehicle ?? false;

  if (isPassengerVehicle && isNonPassengerVehicle) {
    throw new Error("Vehicle cannot be both passenger and non-passenger");
  }

  if (!isPassengerVehicle && !isNonPassengerVehicle) {
    throw new Error("Vehicle must be passenger or non-passenger");
  }
}

export function calcLct(vehicleValue: number, isFuelEfficient: boolean): number {
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
  };

  const totalComplianceCost = money(
    Object.values(breakdown).reduce((sum, item) => sum + item.amount, 0)
  );

  return {
    jurisdiction: "VIC",
    module: "vehicle_compliance",
    assessment,
    inputs: {
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
