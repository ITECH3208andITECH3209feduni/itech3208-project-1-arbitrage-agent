import { normalizeMakeCase, normalizeVehicleTextCase } from "./casing.js";
import { parseMileageToKm } from "./mileage.js";
import type { VehicleRecord } from "./types.js";

/** Safely normalize a text field supplied by an external extractor. */
function safeText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

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
  const split = splitMakeModel(safeText(record.title));
  return {
    ...record,
    market: record.market ?? "JP",
    source: record.source ?? "goo-net",
    sourceType: record.sourceType ?? "dealer",
    currency: record.currency ?? "JPY",
    make: normalizeMakeCase(safeText(record.make)) || normalizeMakeCase(split.make),
    model: normalizeVehicleTextCase(safeText(record.model)) || normalizeVehicleTextCase(split.model),
    price: record.price ?? (record.source === "japancardirect"
      ? null
      : parsePrice(typeof record.priceRaw === "string" ? record.priceRaw : "")),
    priceRaw: typeof record.priceRaw === "string" ? record.priceRaw.trim() : "",
    mileage: record.mileage ?? parseMileageToKm(typeof record.mileageRaw === "string" ? record.mileageRaw : ""),
    mileageRaw: typeof record.mileageRaw === "string" ? record.mileageRaw.trim() : "",
    title: normalizeVehicleTextCase(safeText(record.title)) ?? "",
    titleRaw: safeText(record.titleRaw),
    color: safeText(record.color),
    colorRaw: safeText(record.colorRaw),
    transmission: safeText(record.transmission),
    transmissionRaw: safeText(record.transmissionRaw),
    driveType: safeText(record.driveType),
    driveTypeRaw: safeText(record.driveTypeRaw),
    engineSize: safeText(record.engineSize),
    fuelType: safeText(record.fuelType),
    fuelTypeRaw: safeText(record.fuelTypeRaw),
    bodyType: safeText(record.bodyType),
    bodyTypeRaw: safeText(record.bodyTypeRaw),
    dealerRaw: safeText(record.dealerRaw),
    dealer: safeText(record.dealer),
    locationRaw: safeText(record.locationRaw),
    location: safeText(record.location),
    description: safeText(record.description),
    descriptionRaw: safeText(record.descriptionRaw),
    doors: record.doors ?? null,
    seats: record.seats ?? null,
    year: record.year ?? null,
    images: Array.isArray(record.images) ? record.images.filter((image): image is string => typeof image === "string" && image.trim() !== "") : [],
    auctionSheetImages: Array.isArray(record.auctionSheetImages) ? record.auctionSheetImages.filter((image): image is string => typeof image === "string" && image.trim() !== "") : undefined,
    registrationYear: record.registrationYear ?? null,
    chassisNumber: safeText(record.chassisNumber) || undefined,
    inspectorNotes: safeText(record.inspectorNotes) || undefined,
    exteriorGrade: safeText(record.exteriorGrade) || undefined,
    exteriorGradeDescription: safeText(record.exteriorGradeDescription) || undefined,
    interiorGrade: safeText(record.interiorGrade) || undefined,
    interiorGradeDescription: safeText(record.interiorGradeDescription) || undefined,
    mileageWarning: safeText(record.mileageWarning) || undefined,
    ownershipHistory: safeText(record.ownershipHistory) || undefined,
    auctionSalesPoints: Array.isArray(record.auctionSalesPoints) ? record.auctionSalesPoints.filter((point): point is string => typeof point === "string" && point.trim() !== "") : undefined,
    damageCodes: Array.isArray(record.damageCodes) ? record.damageCodes.filter((code): code is string => typeof code === "string" && code.trim() !== "").map((code) => code.trim()) : undefined,
  };
}
