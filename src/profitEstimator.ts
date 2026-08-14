import type { VehicleRecord } from "./types.js";
import { modelsMatch, normalizeMake } from "./modelFamily.js";

const DEFAULT_IMPORT_RATE = 0.32;
type Basis = "asking" | "sold" | "mixed";

export interface ResaleEstimate {
  estimatedResaleAud: number;
  estimatedResaleLowAud: number;
  estimatedResaleHighAud: number;
  resaleConfidence: number;
  resaleConfidenceLabel: "low" | "medium" | "high";
  resaleComparableCount: number;
  resaleBasis: Basis;
  resaleConfidenceReasons: string[];
}

export interface ProfitEstimatorOptions {
  jpyToAud?: number;
  jpyToAudRate?: number;
  importCostRate?: number;
  now?: Date | string;
}

type ResaleTarget = Partial<Pick<VehicleRecord, "make" | "model" | "year" | "mileage" | "transmission" | "driveType" | "fuelType" | "bodyType">>;

const normalized = (value: string | undefined): string => (value ?? "").trim().toLocaleLowerCase().replace(/[\s_-]+/g, " ");
const rounded = (value: number): number => Math.round(value);
const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const quantile = (values: number[], fraction: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};

const freshness = (extractedAt: string, now: number): number => {
  const ageDays = Math.max(0, (now - Date.parse(extractedAt)) / 86_400_000);
  if (!Number.isFinite(ageDays) || ageDays <= 90) return 1;
  return Math.max(0, 1 - (ageDays - 90) / 365);
};

/** Estimate Australian resale value from suitable Australian comparables. */
export function estimateResaleAud(target: ResaleTarget, records: readonly VehicleRecord[], options: ProfitEstimatorOptions = {}): ResaleEstimate | null {
  const make = normalizeMake(target.make);
  const targetYear = target.year;
  const targetMileage = target.mileage;
  const suitable = records.filter((record) => make !== "" && modelsMatch(target.model, record.model) && normalizeMake(record.make) === make && record.market === "AU" && record.currency === "AUD" && record.price != null && record.price > 0 && record.soldStatus !== "unsold");
  const exactYear = suitable.filter((record) => targetYear == null || record.year == null || Math.abs(record.year - targetYear) <= 2);
  const selected = exactYear.length >= 3 ? exactYear : suitable.filter((record) => targetYear == null || record.year == null || Math.abs(record.year - targetYear) <= 4);
  if (selected.length < 2) return null;

  const prices = selected.map((record) => record.price as number);
  const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  const dispersion = Math.sqrt(prices.reduce((sum, price) => sum + (price - average) ** 2, 0) / prices.length) / average;
  const now = options.now == null ? Date.now() : new Date(options.now).getTime();
  const freshnessScore = selected.reduce((sum, record) => sum + freshness(record.extractedAt, now), 0) / selected.length;
  const soldCount = selected.filter((record) => record.soldStatus === "sold").length;
  const askingCount = selected.length - soldCount;
  const basis: Basis = soldCount && askingCount ? "mixed" : soldCount ? "sold" : "asking";

  const fields = ["transmission", "driveType", "fuelType", "bodyType"] as const;
  const fieldScore = fields.reduce((sum, field) => {
    const wanted = normalized(target[field]);
    if (!wanted) return sum + 0.7;
    const present = selected.filter((record) => normalized(record[field]) !== "");
    return sum + (present.length ? present.filter((record) => normalized(record[field]) === wanted).length / present.length : 0.4);
  }, 0) / fields.length;
  const yearScore = targetYear == null ? 0.65 : selected.reduce((sum, record) => sum + (record.year == null ? 0.5 : Math.max(0, 1 - Math.abs(record.year - targetYear) / 4)), 0) / selected.length;
  const mileageScore = targetMileage == null ? 0.65 : selected.reduce((sum, record) => sum + (record.mileage == null ? 0.5 : Math.max(0, 1 - Math.abs(record.mileage - targetMileage) / Math.max(targetMileage, 50_000))), 0) / selected.length;
  const matchScore = (yearScore + mileageScore + fieldScore) / 3;
  const sampleScore = Math.min(1, selected.length / 5);
  const agreementScore = Math.max(0, Math.min(1, 1 - dispersion));
  const sourceScore = selected.reduce((sum, record) => sum + (record.soldStatus === "sold" ? 1 : record.soldStatus === "unknown" ? 0.8 : 0.65), 0) / selected.length;
  const confidence = rounded(Math.min(1, 0.30 * sampleScore + 0.25 * matchScore + 0.25 * agreementScore + 0.10 * freshnessScore + 0.10 * sourceScore) * 100) / 100;
  const confidenceLabel = confidence >= 0.75 && selected.length >= 5 ? "high" : confidence >= 0.45 && selected.length >= 3 ? "medium" : "low";

  const reasons = [`${selected.length} model-family AU comparables`];
  if (selected.length < 3) reasons.push("low sample size limits confidence");
  if (exactYear.length < selected.length) reasons.push("used relaxed +/-4 year window");
  if (dispersion > 0.2) reasons.push("price dispersion widens the estimate range");
  if (freshnessScore < 0.7) reasons.push("stale comparable data lowers confidence");
  reasons.push(`${basis} source basis (${soldCount} sold, ${askingCount} asking)`);

  return {
    estimatedResaleAud: rounded(median(prices)),
    estimatedResaleLowAud: rounded(quantile(prices, 0.2)),
    estimatedResaleHighAud: rounded(quantile(prices, 0.8)),
    resaleConfidence: confidence,
    resaleConfidenceLabel: confidenceLabel,
    resaleComparableCount: selected.length,
    resaleBasis: basis,
    resaleConfidenceReasons: reasons,
  };
}

export function estimateProfitAud(vehicle: Pick<VehicleRecord, "price" | "currency"> & Partial<VehicleRecord>, comparables?: readonly VehicleRecord[], options: ProfitEstimatorOptions = {}): number | null {
  if (vehicle.price == null || !comparables) return null;
  const rate = options.jpyToAud ?? options.jpyToAudRate;
  const purchaseAud = vehicle.currency === "AUD" ? vehicle.price : rate == null ? null : vehicle.price * rate;
  if (purchaseAud == null) return null;
  const resale = estimateResaleAud(vehicle, comparables, options);
  return resale == null ? null : rounded(resale.estimatedResaleAud - purchaseAud - purchaseAud * (options.importCostRate ?? DEFAULT_IMPORT_RATE));
}

export function applyEstimatedProfitAud<T extends Omit<VehicleRecord, "estimatedProfitAud">>(vehicle: T, comparables: readonly VehicleRecord[] = [], options: ProfitEstimatorOptions = {}): T & { estimatedProfitAud: number | null } {
  const rate = options.jpyToAud ?? options.jpyToAudRate;
  const purchaseAud = vehicle.price == null ? null : vehicle.currency === "AUD" ? vehicle.price : rate == null ? null : vehicle.price * rate;
  const resale = comparables.length ? estimateResaleAud(vehicle, comparables, options) : null;
  const importCostAud = purchaseAud == null ? null : rounded(purchaseAud * (options.importCostRate ?? DEFAULT_IMPORT_RATE));
  return {
    ...vehicle,
    purchaseAud,
    importCostAud,
    estimatedResaleAud: resale?.estimatedResaleAud ?? null,
    estimatedResaleLowAud: resale?.estimatedResaleLowAud ?? null,
    estimatedResaleHighAud: resale?.estimatedResaleHighAud ?? null,
    resaleComparableCount: resale?.resaleComparableCount ?? 0,
    resaleBasis: resale?.resaleBasis ?? null,
    resaleConfidence: resale?.resaleConfidence ?? null,
    resaleConfidenceLabel: resale?.resaleConfidenceLabel ?? null,
    resaleConfidenceReasons: resale?.resaleConfidenceReasons ?? null,
    estimatedProfitAud: resale && purchaseAud != null ? rounded(resale.estimatedResaleAud - purchaseAud - (importCostAud ?? 0)) : null,
  };
}
