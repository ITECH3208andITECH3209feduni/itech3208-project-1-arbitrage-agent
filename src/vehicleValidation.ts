import { z } from "zod";
import type { VehicleRecord } from "./types.js";

const text = z.preprocess((value) => value == null ? "" : value, z.string());
const nullableNumber = z.preprocess((value) => value == null || value === "" ? null : value, z.number().nullable());
const optionalText = z.preprocess((value) => value == null ? undefined : value, z.string().optional());

const market = z.preprocess((value) => value === "JP" || value === "AU" ? value : undefined, z.enum(["JP", "AU"]).optional());
const sourceType = z.preprocess(
  (value) => value === "auction" || value === "dealer" || value === "classified" ? value : undefined,
  z.enum(["auction", "dealer", "classified"]).optional(),
);
const currency = z.preprocess((value) => value === "JPY" || value === "AUD" ? value : undefined, z.enum(["JPY", "AUD"]).optional());

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
  extractedAt: text,
  auctionNumber: optionalText,
  auctionEndTime: optionalText,
  lastBidAt: optionalText,
  buildDate: optionalText,
});

export function validateVehicleRecord(record: unknown): VehicleRecord | null {
  const result = VehicleRecordSchema.safeParse(record);
  if (!result.success) return null;
  return result.data;
}
