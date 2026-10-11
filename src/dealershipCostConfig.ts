export const DEALERSHIP_COST_STORAGE_KEY = "dealership-cost-configuration";

export const DEALERSHIP_COST_FIELDS = [
  ["agentFeeAud", "Agent fee", "aud"],
  ["inlandTransportAud", "Japan inland transport", "aud"],
  ["exportPaperworkAud", "Export paperwork", "aud"],
  ["wharfHandlingAud", "Wharf/port handling", "aud"],
  ["customsBrokerageAud", "Customs brokerage", "aud"],
  ["biosecurityAud", "Biosecurity", "aud"],
  ["adrEngineeringAud", "ADR engineering", "aud"],
  ["freightAud", "Shipping", "aud"],
  ["insuranceAud", "Insurance premium", "aud"],
  ["insuranceRate", "Insurance rate", "percent"],
  ["registrationFee", "Registration", "aud"],
  ["tacFee", "TAC", "aud"],
  ["plateFee", "Plates", "aud"],
  ["ravAssessmentFee", "RAV assessment", "aud"],
  ["overrideCustomsDutyRate", "Customs duty override", "percent"],
] as const;

export type DealershipCostField = (typeof DEALERSHIP_COST_FIELDS)[number][0];
export type DealershipCostConfiguration = Partial<Record<DealershipCostField, string>>;
export type DealershipCostOverrides = Partial<Record<DealershipCostField, number>>;

export function parseDealershipCostConfiguration(value: string | null): DealershipCostConfiguration {
  if (!value) return {};

  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const configuration: DealershipCostConfiguration = {};
    for (const [key, , kind] of DEALERSHIP_COST_FIELDS) {
      const raw = (parsed as Record<string, unknown>)[key];
      if (typeof raw !== "string" || raw.trim() === "") continue;
      const numericValue = Number(raw);
      if (!Number.isFinite(numericValue) || numericValue < 0) continue;
      if (kind === "percent" && numericValue > 100) continue;
      configuration[key] = raw;
    }
    return configuration;
  } catch {
    return {};
  }
}

export function dealershipCostOverridesFromInputs(
  configuration: DealershipCostConfiguration,
): DealershipCostOverrides {
  const overrides: DealershipCostOverrides = {};
  for (const [key, , kind] of DEALERSHIP_COST_FIELDS) {
    const raw = configuration[key];
    if (raw == null || raw.trim() === "") continue;
    const numericValue = Number(raw);
    if (!Number.isFinite(numericValue) || numericValue < 0) continue;
    if (kind === "percent" && numericValue > 100) continue;
    overrides[key] = kind === "percent" ? numericValue / 100 : numericValue;
  }
  return overrides;
}

export function loadDealershipCostConfiguration(): DealershipCostConfiguration {
  try {
    return parseDealershipCostConfiguration(window.localStorage.getItem(DEALERSHIP_COST_STORAGE_KEY));
  } catch {
    return {};
  }
}

export function saveDealershipCostConfiguration(configuration: DealershipCostConfiguration): void {
  try {
    window.localStorage.setItem(DEALERSHIP_COST_STORAGE_KEY, JSON.stringify(configuration));
  } catch {
    // The configuration remains usable for the current page even when storage is unavailable.
  }
}
