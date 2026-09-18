import { z } from "zod";
import type { VehicleRecord } from "./types.js";

const text = z.preprocess((value) => value == null ? "" : value, z.string());
const finiteNumber = z.number().finite();
const nullableNumber = z.preprocess((value) => value == null || value === "" ? null : value, finiteNumber.nullable());
const optionalFiniteNumber = z.preprocess((value) => value == null || value === "" ? undefined : value, finiteNumber.optional());
const optionalText = z.preprocess((value) => value == null ? undefined : value, z.string().optional());
const lineItem = z.object({ amount: finiteNumber, confidence: z.enum(["official_rule", "official_but_variable", "estimate", "manual_input_required"]), source: z.string() });
const lineItems = z.record(lineItem);

const market = z.preprocess((value) => value === "JP" || value === "AU" ? value : undefined, z.enum(["JP", "AU"]).optional());
const sourceType = z.preprocess(
  (value) => value === "auction" || value === "dealer" || value === "classified" ? value : undefined,
  z.enum(["auction", "dealer", "classified"]).optional(),
);
const currency = z.preprocess((value) => value === "JPY" || value === "AUD" ? value : undefined, z.enum(["JPY", "AUD"]).optional());
const soldStatus = z.preprocess(
  (value) => value === "sold" || value === "unsold" || value === "unknown" ? value : undefined,
  z.enum(["sold", "unsold", "unknown"]).optional(),
);

export const VehicleRecordSchema = z.object({
  market,
  source: optionalText,
  sourceType,
  currency,
  sourceId: optionalText,
  make: optionalText,
  model: optionalText,
  url: z.string().url(),
  title: text,
  titleRaw: text,
  price: nullableNumber,
  priceRaw: text,
  mileage: nullableNumber,
  mileageRaw: text,
  year: nullableNumber,
  color: text,
  colorRaw: text,
  transmission: text,
  transmissionRaw: text,
  driveType: text,
  driveTypeRaw: text,
  engineSize: text,
  fuelType: text,
  fuelTypeRaw: text,
  bodyType: text,
  bodyTypeRaw: text,
  doors: nullableNumber,
  seats: nullableNumber,
  dealer: text,
  dealerRaw: text,
  location: text,
  locationRaw: text,
  description: text,
  descriptionRaw: text,
  images: z.array(z.string()).catch([]),
  auctionSheetImages: z.array(z.string()).optional(),
  extractedAt: text,
  auctionNumber: optionalText,
  auctionEndTime: optionalText,
  lastBidAt: optionalText,
  buildDate: optionalText,
  registrationYear: nullableNumber,
  chassisNumber: optionalText,
  inspectorNotes: optionalText,
  soldStatus,
  hammerPriceRaw: optionalText,
  auctionHouse: optionalText,
  exteriorGrade: optionalText,
  exteriorGradeDescription: optionalText,
  interiorGrade: optionalText,
  interiorGradeDescription: optionalText,
  mileageWarning: optionalText,
  ownershipHistory: optionalText,
  auctionSalesPoints: z.array(z.string()).optional(),
  damageCodes: z.array(z.string()).optional(),
  exchangeRateUsed: optionalFiniteNumber,
  landedCostBreakdown: lineItems.nullable().optional(),
  complianceBreakdown: lineItems.nullable().optional(),
});

export function validateVehicleRecord(record: unknown): VehicleRecord | null {
  const result = VehicleRecordSchema.safeParse(record);
  if (!result.success) return null;
  return result.data;
}