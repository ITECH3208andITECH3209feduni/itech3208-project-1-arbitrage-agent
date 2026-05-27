import type { VehicleRecord } from "./types.js";

const DEFAULT_PROFIT_MULTIPLIER = 1.5;

/**
 * Estimate vehicle profit in AUD after extraction/normalization.
 *
 * Keep this deterministic and separate from LLM output. Next sprint can replace
 * the placeholder multiplier with market-aware landed-cost/resale logic.
 */
export function estimateProfitAud(
  vehicle: Pick<VehicleRecord, "price" | "currency">,
  multiplier: number = DEFAULT_PROFIT_MULTIPLIER,
): number | null {
  if (vehicle.price == null) return null;
  if (vehicle.currency !== "AUD") return null;

  // Placeholder: next sprint replaces this with market-aware AUD profit logic.
  return Math.round(vehicle.price * multiplier);
}

export function applyEstimatedProfitAud<T extends Omit<VehicleRecord, "estimatedProfitAud">>(
  vehicle: T,
): T & { estimatedProfitAud: number | null } {
  return {
    ...vehicle,
    estimatedProfitAud: estimateProfitAud(vehicle),
  };
}
