import { applyEstimatedProfitAud } from "./profitEstimator.js";
import type { VehicleRecord } from "./types.js";

const estimateFields = [
  "estimatedProfitAud", "purchaseAud", "importCostAud", "estimatedResaleAud",
  "estimatedResaleLowAud", "estimatedResaleHighAud", "resaleComparableCount",
  "resaleBasis", "resaleConfidence", "resaleConfidenceLabel", "resaleConfidenceReasons",
] as const;

function withoutEstimates(record: VehicleRecord): VehicleRecord {
  const clean = { ...record } as Record<string, unknown>;
  for (const field of estimateFields) delete clean[field];
  return clean as unknown as VehicleRecord;
}

const key = (record: Pick<VehicleRecord, "make" | "model">) =>
  `${record.make?.trim().toLocaleLowerCase()}\u0000${record.model?.trim().toLocaleLowerCase()}`;

/** Apply estimates only to JP records; AU records remain raw market data. */
export function orchestrateEstimates(
  records: readonly VehicleRecord[],
  comparables: ReadonlyMap<string, readonly VehicleRecord[]>,
  jpyToAud: number,
): VehicleRecord[] {
  return records.map((record) => {
    const clean = withoutEstimates(record);
    if (clean.market !== "JP") return clean;
    return applyEstimatedProfitAud(clean, comparables.get(key(clean)) ?? [], { jpyToAud });
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
      if (missing && existing[field] != null) {
        (merged as unknown as Record<string, unknown>)[field] = existing[field];
      }
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
