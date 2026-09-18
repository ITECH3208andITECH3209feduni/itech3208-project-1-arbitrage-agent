export type Confidence =
  | "official_rule"
  | "official_but_variable"
  | "estimate"
  | "manual_input_required";

export type ComplianceInput = {
  vehicleValue: number;
  ageYears: number;
  is4wd?: boolean;

  isFuelEfficient?: boolean;
  isGreenPassengerCar?: boolean;
  isPassengerVehicle?: boolean;
  isNonPassengerVehicle?: boolean;
  isNonPassengerNew?: boolean;

  importedVehicle?: boolean;
  ravRecorded?: boolean | null;
  modifiedVehicle?: boolean;
  convertedToRhd?: boolean;

  registrationFee?: number | null;
  tacFee?: number | null;
  plateFee?: number | null;
  ravAssessmentFee?: number | null;

  roadworthyRepairs?: number | null;
  vassCertificate?: number | null;
  complianceWorkshopFee?: number | null;
  modificationCosts?: number | null;

  overrideRoadworthyInspection?: number | null;
  overrideVassCertificate?: number | null;
  overrideRegistrationFee?: number | null;
  overrideTacFee?: number | null;
  overridePlateFee?: number | null;

  contingencyFee?: number;
  auctionSheet?: AuctionSheetInput | null;
};

export type AuctionSheetInput = {
  exteriorGrade?: string | null;
  interiorGrade?: string | null;
  mileageWarning?: string | null;
  ownershipHistory?: string | null;
  inspectorNotes?: string | null;
  damageCodes?: string[] | null;
};

export type LineItem = {
  amount: number;
  confidence: Confidence;
  source: string;
};

export type ComplianceAssessment = {
  requiresRwc: boolean;
  requiresRavCheck: boolean;
  requiresVassReview: boolean;
  manualReviewRequired: boolean;
  warnings: string[];
};

export type ComplianceResult = {
  jurisdiction: "VIC";
  module: "vehicle_compliance";
  assessment: ComplianceAssessment;
  inputs: Record<string, unknown>;
  breakdown: Record<string, LineItem>;
  totalComplianceCost: number;
};
