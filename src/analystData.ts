import type { VehicleRecord } from "./types.js";

export type AnalystComparable = Pick<VehicleRecord, "url" | "title" | "titleRaw" | "price" | "priceRaw" | "mileage" | "mileageRaw" | "year" | "make" | "model" | "transmission" | "driveType" | "fuelType" | "bodyType" | "market" | "currency" | "extractedAt"> & {
  source: "analyst-local";
  sourceType: "classified";
  soldStatus: "sold" | "unknown";
};

function numberValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function rowToComparable(row: Record<string, unknown>, index: number): AnalystComparable | null {
  const get = (...names: string[]) => names.map((name) => row[name] ?? row[name.toLowerCase()]).find((value) => value != null);
  const make = String(get("make", "brand") ?? "").trim();
  const model = String(get("model") ?? "").trim();
  const price = numberValue(get("price", "priceAud", "salePrice", "amount"));
  if (!make || !model || price == null) return null;
  const year = numberValue(get("year", "registrationYear"));
  const mileage = numberValue(get("mileage", "odometer", "km"));
  const now = new Date().toISOString();
  return {
    url: `local://analyst-comparable/${index + 1}`,
    title: `${make} ${model}`,
    titleRaw: `${make} ${model}`,
    price,
    priceRaw: String(get("price", "priceAud", "salePrice", "amount") ?? price),
    mileage,
    mileageRaw: mileage == null ? "" : `${mileage} km`,
    year,
    make,
    model,
    transmission: String(get("transmission") ?? ""),
    driveType: String(get("driveType") ?? ""),
    fuelType: String(get("fuelType") ?? ""),
    bodyType: String(get("bodyType") ?? ""),
    market: "AU",
    currency: "AUD",
    extractedAt: now,
    source: "analyst-local",
    sourceType: "classified",
    soldStatus: get("soldStatus", "status") === "asking" ? "unknown" : "sold",
  };
}

function parseCsv(text: string): Record<string, unknown>[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const parseLine = (line: string) => {
    const result: string[] = [];
    let current = "";
    let quoted = false;
    for (const char of line) {
      if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) { result.push(current.trim()); current = ""; }
      else current += char;
    }
    result.push(current.trim());
    return result;
  };
  const headers = parseLine(lines[0]).map((header) => header.toLowerCase().replace(/\s+/g, ""));
  return lines.slice(1).map((line) => Object.fromEntries(parseLine(line).map((value, i) => [headers[i], value])));
}

/** Parse analyst-owned AU/AUD sale comparables from CSV or JSON text. Invalid rows are ignored. */
export function parseAnalystComparables(text: string, format?: "csv" | "json"): AnalystComparable[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  let rows: Record<string, unknown>[];
  if (format === "json" || trimmed.startsWith("[")) {
    const parsed: unknown = JSON.parse(trimmed);
    rows = Array.isArray(parsed) ? parsed.filter((row): row is Record<string, unknown> => !!row && typeof row === "object") : [];
  } else {
    rows = parseCsv(trimmed);
  }
  return rows.map(rowToComparable).filter((row): row is AnalystComparable => row !== null);
}

export const parseAnalystData = parseAnalystComparables;
