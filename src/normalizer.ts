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

/**
 * Parse a Japanese mileage string into kilometres.
 *
 * Handles 万km notation (e.g. `"3.5万km"` → `35000`) and plain km.
 *
 * @param raw - Raw mileage string from the listing page
 * @returns Parsed mileage in km, or `null` if unparseable
 */
export function parseMileage(raw: string): number | null {
  if (!raw) return null;
  const trimmed = raw.replace(/\s/g, "");
  const match = trimmed.match(/([\d,]+(?:\.\d+)?)\s*万km/i);
  if (match) {
    const num = parseFloat(match[1].replace(/,/g, ""));
    return Math.round(num * 10000);
  }
  const plain = trimmed.match(/([\d,]+)\s*km/i);
  if (plain) {
    return parseInt(plain[1].replace(/,/g, ""), 10);
  }
  return null;
}

/**
 * Normalize a {@link VehicleRecord}: parse raw price/mileage, trim strings,
 * and fill missing optional fields with sensible defaults.
 *
 * @param record - Raw extracted record
 * @returns Normalized record with parsed numeric fields
 */
export function normalizeRecord(record: VehicleRecord): VehicleRecord {
  return {
    ...record,
    price: record.price ?? parsePrice(typeof record.priceRaw === "string" ? record.priceRaw : ""),
    mileage: record.mileage ?? parseMileage(typeof record.mileageRaw === "string" ? record.mileageRaw : ""),
    title: record.title?.trim() ?? "",
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
