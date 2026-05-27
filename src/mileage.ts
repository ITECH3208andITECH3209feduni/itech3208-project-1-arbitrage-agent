export type MileageUnit = "km" | "kilometres" | "kilometers" | "mi" | "miles";

/** Convert miles into kilometres. */
export function milesToKm(miles: number): number {
  return Math.round(miles * 1.60934);
}

/** Normalize a numeric mileage plus unit into kilometres. */
export function normalizeMileageToKm(value: number, unit: string): number {
  const normalized = unit.trim().toLowerCase();
  if (["km", "kilometres", "kilometers"].includes(normalized)) return Math.round(value);
  if (["mi", "miles"].includes(normalized)) return milesToKm(value);
  throw new Error(`Unsupported mileage unit: ${unit}`);
}

/** Parse common mileage strings into kilometres. Supports km, miles, and Japanese 万km. */
export function parseMileageToKm(raw: string): number | null {
  if (!raw) return null;
  const trimmed = raw.replace(/\s/g, "").toLowerCase();

  const tenThousandKm = trimmed.match(/([\d,]+(?:\.\d+)?)万(?:km|キロ)/i);
  if (tenThousandKm) return Math.round(parseFloat(tenThousandKm[1].replace(/,/g, "")) * 10000);

  const km = trimmed.match(/([\d,]+(?:\.\d+)?)(?:km|kilometres|kilometers|キロ)/i);
  if (km) return normalizeMileageToKm(parseFloat(km[1].replace(/,/g, "")), "km");

  const miles = trimmed.match(/([\d,]+(?:\.\d+)?)(?:mi|mile|miles)/i);
  if (miles) return normalizeMileageToKm(parseFloat(miles[1].replace(/,/g, "")), "mi");

  return null;
}
