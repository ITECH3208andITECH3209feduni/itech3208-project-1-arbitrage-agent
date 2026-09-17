import type { ComplianceInput, ComplianceResult, LineItem } from "../compliance/types";

export type LandedCostInput = {
  /** Purchase price in Japan in yen (hammer price). Use this or purchasePriceAud. */
  purchasePriceJpy?: number | null;
  /** Purchase price already in AUD. Use this or purchasePriceJpy. */
  purchasePriceAud?: number | null;
  /** JPY to AUD rate, for example 0.0099. Needed when purchasePriceJpy is used. */
  jpyToAudRate?: number | null;

  /** Costs in Japan to get the car onto the ship (agent fee, inland transport, export paperwork), in AUD. */
  japanSideCostsAud?: number | null;

  /** Sea freight from Japan to Australia in AUD. Uses a default estimate if not supplied. */
  freightAud?: number | null;
  /** Marine insurance in AUD. Uses a percentage of the FOB value if not supplied. */
  insuranceAud?: number | null;

  /** True when the car was built in Japan and proof of origin (JAEPA) will be supplied. */
  japaneseOriginProof?: boolean;
  /** Overrides the customs duty rate, for example 0.05 for 5%. */
  overrideCustomsDutyRate?: number | null;

  /** Estimated repair costs to pass the roadworthy, in AUD. */
  repairCostsAud?: number | null;
};

export type LandedCostResult = {
  module: "import_landed_cost";
  currency: "AUD";
  warnings: string[];
  breakdown: Record<string, LineItem>;
  fobValueAud: number;
  customsDutyRate: number;
  valueOfTaxableImportationAud: number;
  /** FOB + freight + insurance + customs duty + import GST. */
  totalLandedCostAud: number;
  /** Repair costs, kept separate so they are only counted once. */
  repairCostsAud: number;
};

export type DriveawayInput = LandedCostInput & {
  /** Everything Kate's compliance module needs, except vehicleValue and roadworthyRepairs, which are filled in here. */
  compliance: Omit<ComplianceInput, "vehicleValue" | "roadworthyRepairs">;
};

export type DriveawayResult = {
  landedCost: LandedCostResult;
  compliance: ComplianceResult;
  /** Landed cost + compliance module total (which already includes repair costs). */
  totalDriveawayCostAud: number;
  warnings: string[];
};
