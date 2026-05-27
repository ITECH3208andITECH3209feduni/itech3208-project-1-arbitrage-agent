import { normalizeMakeCase, normalizeVehicleTextCase } from "./casing.js";
import { parseMileageToKm } from "./mileage.js";
import type { VehicleRecord } from "./types.js";

/**
 * Parse a Japanese price string into a JPY number.
 *
 * Handles 万円 notation (e.g. `"150万円"` → `1500000`), plain 円, and
 * returns `null` for placeholder values like `"−"` or `"応談"`.
 *
 * @param raw - Raw price string from the listing page
 * @returns Parsed price in JPY, or `null` if unavailable/unparseable
 */
export function parsePrice(raw: string): number | null {
  if (!raw) return null;
  const trimmed = raw.replace(/\s/g, "");
  if (/−|値下げ中|応談|未定|相談|問合/.test(trimmed)) return null;
  const match = trimmed.match(/([\d,]+(?:\.\d+)?)\s*万円/);
  if (match) {
    const num = parseFloat(match[1].replace(/,/g, ""));
    return Math.round(num * 10000);
  }
  const plain = trimmed.match(/([\d,]+)\s*円/);
  if (plain) {
    return parseInt(plain[1].replace(/,/g, ""), 10);
  }
  return null;
}

export { parseMileageToKm };

function splitMakeModel(title: string): { make?: string; model?: string } {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (/^(19|20)\d{2}$/.test(parts[0] ?? "")) parts.shift();
  if (parts.length === 0) return {};
  return { make: parts[0], model: parts.slice(1, 3).join(" ") || undefined };
}
/**
 * Normalize a {@link VehicleRecord}: parse raw price/mileage, trim strings,
 * and fill missing optional fields with sensible defaults.
 *
 * @param record - Raw extracted record
 * @returns Normalized record with parsed numeric fields
 */
export function normalizeRecord(record: VehicleRecord): VehicleRecord {
  const split = splitMakeModel(record.title ?? "");
  return {
    ...record,
    market: record.market ?? "JP",
    source: record.source ?? "goo-net",
    sourceType: record.sourceType ?? "dealer",
    currency: record.currency ?? "JPY",
    make: normalizeMakeCase(record.make) || normalizeMakeCase(split.make),
    model: normalizeVehicleTextCase(record.model) || normalizeVehicleTextCase(split.model),
    price: record.price ?? parsePrice(typeof record.priceRaw === "string" ? record.priceRaw : ""),
    priceRaw: typeof record.priceRaw === "string" ? record.priceRaw.trim() : "",
    mileage: record.mileage ?? parseMileageToKm(typeof record.mileageRaw === "string" ? record.mileageRaw : ""),
    mileageRaw: typeof record.mileageRaw === "string" ? record.mileageRaw.trim() : "",
    title: normalizeVehicleTextCase(record.title) ?? "",
    titleRaw: record.titleRaw?.trim() ?? "",
    color: record.color?.trim() ?? "",
    colorRaw: record.colorRaw?.trim() ?? "",
    transmission: record.transmission?.trim() ?? "",
    transmissionRaw: record.transmissionRaw?.trim() ?? "",
    driveType: record.driveType?.trim() ?? "",
    driveTypeRaw: record.driveTypeRaw?.trim() ?? "",
    engineSize: record.engineSize?.trim() ?? "",
    fuelType: record.fuelType?.trim() ?? "",
    fuelTypeRaw: record.fuelTypeRaw?.trim() ?? "",
    bodyType: record.bodyType?.trim() ?? "",
    bodyTypeRaw: record.bodyTypeRaw?.trim() ?? "",
    dealerRaw: record.dealerRaw?.trim() ?? "",
    dealer: record.dealer?.trim() ?? "",
    locationRaw: record.locationRaw?.trim() ?? "",
    location: record.location?.trim() ?? "",
    description: record.description?.trim() ?? "",
    descriptionRaw: record.descriptionRaw?.trim() ?? "",
    doors: record.doors ?? null,
    seats: record.seats ?? null,
    year: record.year ?? null,
    images: record.images ?? [],
  };
}
