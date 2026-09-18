import { applyEstimatedProfitAud } from "./profitEstimator.js";
import { calculateDriveawayCost } from "./landedCost/landedCost.js";
import type { VehicleRecord } from "./types.js";

const estimateFields = [
  "costWarnings", "complianceWarnings", "landedCostBreakdown", "complianceBreakdown", "complianceAssessment", "exchangeRateUsed",
  "estimatedResaleAud", "estimatedResaleLowAud", "estimatedResaleHighAud", "resaleComparableCount",
  "resaleBasis", "resaleConfidence", "resaleConfidenceLabel", "resaleConfidenceReasons",
] as const;

function withoutEstimates(record: VehicleRecord): VehicleRecord {
  const clean = { ...record } as Record<string, unknown>;
  for (const field of estimateFields) delete clean[field];
  return clean as unknown as VehicleRecord;
}

const key = (record: Pick<VehicleRecord, "make" | "model">) =>
  `${record.make?.trim().toLocaleLowerCase()}\u0000${record.model?.trim().toLocaleLowerCase()}`;

function currentAge(year: number | null | undefined): number {
  return year == null ? 10 : Math.max(0, new Date().getUTCFullYear() - year);
}

function estimateVehicleCosts(record: VehicleRecord, jpyToAud: number): VehicleRecord {
  if (record.price == null || !Number.isFinite(record.price) || !Number.isFinite(jpyToAud) || jpyToAud <= 0) return record;
  const driveaway = calculateDriveawayCost({
    purchasePriceJpy: record.currency === "JPY" ? record.price : undefined,
    purchasePriceAud: record.currency === "AUD" ? record.price : undefined,
    jpyToAudRate: record.currency === "JPY" ? jpyToAud : undefined,
    japaneseOriginProof: record.japaneseOriginProof ?? false,
    agentFeeAud: record.agentFeeAud,
    inlandTransportAud: record.inlandTransportAud,
    exportPaperworkAud: record.exportPaperworkAud,
    wharfHandlingAud: record.wharfHandlingAud,
    customsBrokerageAud: record.customsBrokerageAud,
    biosecurityAud: record.biosecurityAud,
    adrEngineeringAud: record.adrEngineeringAud,
    compliance: {
      ageYears: currentAge(record.year),
      is4wd: /4wd|awd|four[- ]?wheel/i.test(`${record.driveType} ${record.driveTypeRaw}`),
      isPassengerVehicle: true,
      isFuelEfficient: record.isFuelEfficient,
      isGreenPassengerCar: record.isGreenPassengerCar,
      modifiedVehicle: record.modifiedVehicle ?? false,
      convertedToRhd: record.convertedToRhd ?? false,
      registrationFee: record.registrationFee,
      tacFee: record.tacFee,
      plateFee: record.plateFee,
      ravAssessmentFee: record.ravAssessmentFee,
      auctionSheet: {
        exteriorGrade: record.exteriorGrade,
        interiorGrade: record.interiorGrade,
        mileageWarning: record.mileageWarning,
        ownershipHistory: record.ownershipHistory,
        inspectorNotes: record.inspectorNotes,
        damageCodes: record.damageCodes,
      },
    },
  });
  const purchaseAud = driveaway.landedCost.breakdown.purchasePrice.amount;
  const importCostAud = Math.max(0, Math.round((driveaway.totalDriveawayCostAud - purchaseAud) * 100) / 100);
  return {
    ...record,
    purchaseAud,
    importCostAud,
    landedCostAud: driveaway.landedCost.totalLandedCostAud,
    startingCostAud: driveaway.landedCost.startingCostAud,
    exchangeRateUsed: driveaway.landedCost.exchangeRateUsed,
    driveawayCostAud: driveaway.totalDriveawayCostAud,
    costWarnings: driveaway.warnings,
    complianceWarnings: driveaway.compliance.assessment.warnings,
    landedCostBreakdown: driveaway.landedCost.breakdown,
    complianceBreakdown: driveaway.compliance.breakdown,
    complianceAssessment: driveaway.compliance.assessment,
  };
}

function applyAuthoritativeEstimate(record: VehicleRecord, comparables: readonly VehicleRecord[], jpyToAud: number): VehicleRecord {
  const costed = estimateVehicleCosts(record, jpyToAud);
  if (costed.purchaseAud == null) return costed;
  const estimated = applyEstimatedProfitAud(costed, comparables, { jpyToAud });
  return {
    ...estimated,
    importCostAud: costed.importCostAud,
    landedCostAud: costed.landedCostAud,
    startingCostAud: costed.startingCostAud,
    exchangeRateUsed: costed.exchangeRateUsed,
    driveawayCostAud: costed.driveawayCostAud,
    costWarnings: costed.costWarnings,
    complianceWarnings: costed.complianceWarnings,
    landedCostBreakdown: costed.landedCostBreakdown,
    complianceBreakdown: costed.complianceBreakdown,
    complianceAssessment: costed.complianceAssessment,
    estimatedProfitAud: estimated.estimatedResaleAud == null || costed.importCostAud == null
      ? null
      : Math.round((estimated.estimatedResaleAud - costed.purchaseAud! - costed.importCostAud) * 100) / 100,
  };
}

/** Apply authoritative landed/Victorian driveaway estimates only to JP records. */
export function orchestrateEstimates(
  records: readonly VehicleRecord[],
  comparables: ReadonlyMap<string, readonly VehicleRecord[]>,
  jpyToAud: number,
): VehicleRecord[] {
  return records.map((record) => {
    const clean = withoutEstimates(record);
    if (clean.market !== "JP") return clean;
    return applyAuthoritativeEstimate(clean, comparables.get(key(clean)) ?? [], jpyToAud);
  });
}

/** Merge refresh metadata, while making estimate fields entirely current. */
export function prepareRefreshRecord(
  fresh: VehicleRecord,
  existing: VehicleRecord | null,
  comparables: readonly VehicleRecord[],
  jpyToAud: number,
): VehicleRecord {
  const metadata = ["source", "sourceType", "currency", "sourceId", "auctionNumber", "auctionEndTime", "lastBidAt", "buildDate", "soldStatus", "hammerPriceRaw", "auctionHouse"] as const;
  const merged = { ...fresh } as VehicleRecord;
  for (const field of metadata) {
    if (merged[field] == null && existing?.[field] != null) (merged as unknown as Record<string, unknown>)[field] = existing[field];
  }
  if (existing) {
    for (const field of Object.keys(existing) as (keyof VehicleRecord)[]) {
      if (["_id", "_creationTime", "updatedAt", "normalizedMake", "normalizedModel", "modelFamily"].includes(field)) continue;
      const value = merged[field];
      const missing = value == null || value === "" || (Array.isArray(value) && value.length === 0);
      if (missing && existing[field] != null) (merged as unknown as Record<string, unknown>)[field] = existing[field];
    }
    merged.extractedAt = fresh.extractedAt;
  }
  return orchestrateEstimates([merged], new Map([[key(merged), comparables]]), jpyToAud)[0];
}
/** Remove Convex-managed fields before sending an existing document to a mutation. */
export function withoutConvexFields(record: VehicleRecord): VehicleRecord {
  const clean = { ...record } as Record<string, unknown>;
  for (const field of ["_id", "_creationTime", "updatedAt", "normalizedMake", "normalizedModel", "modelFamily"]) delete clean[field];
  return clean as unknown as VehicleRecord;
}
