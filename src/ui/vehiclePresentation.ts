export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function estimateFreshness(iso: string | undefined, now = Date.now()) {
  const timestamp = iso ? Date.parse(iso) : NaN;
  const ageMs = Number.isFinite(timestamp) ? Math.max(0, now - timestamp) : Infinity;
  const stale = ageMs >= STALE_AFTER_MS;
  return { stale, label: stale ? "stale" : "fresh", ageHours: Number.isFinite(ageMs) ? Math.floor(ageMs / 3600000) : null };
}

type EstimateFields = {
  estimatedResaleAud?: number | null;
  estimatedResaleLowAud?: number | null;
  estimatedResaleHighAud?: number | null;
  estimatedProfitAud?: number | null;
  resaleConfidence?: number | null;
  resaleConfidenceLabel?: "low" | "medium" | "high";
  resaleComparableCount?: number;
  resaleBasis?: "asking" | "sold" | "mixed" | null;
  resaleConfidenceReasons?: string[] | null;
};

export function presentAuthoritativeEstimate(fields: EstimateFields) {
  return {
    resale: fields.estimatedResaleAud ?? null,
    low: fields.estimatedResaleLowAud ?? null,
    high: fields.estimatedResaleHighAud ?? null,
    profit: fields.estimatedProfitAud ?? null,
    confidence: fields.resaleConfidence == null ? null : Math.round(fields.resaleConfidence * 100),
    confidenceLabel: fields.resaleConfidenceLabel ?? null,
    comparableCount: fields.resaleComparableCount ?? null,
    basis: fields.resaleBasis ?? null,
    reasons: fields.resaleConfidenceReasons ?? [],
  };
}
