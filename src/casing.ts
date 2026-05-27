const MAKE_CASE: Record<string, string> = {
  TOYOTA: "Toyota",
  HONDA: "Honda",
  NISSAN: "Nissan",
  SUBARU: "Subaru",
  MAZDA: "Mazda",
  SUZUKI: "Suzuki",
  MITSUBISHI: "Mitsubishi",
  DAIHATSU: "Daihatsu",
  LEXUS: "Lexus",
  PORSCHE: "Porsche",
  BMW: "BMW",
  MERCEDES: "Mercedes-Benz",
  "MERCEDES BENZ": "Mercedes-Benz",
  "MERCEDES-BENZ": "Mercedes-Benz",
  "LAND ROVER": "Land Rover",
  "ALFA ROMEO": "Alfa Romeo",
  "ASTON MARTIN": "Aston Martin",
  AUDI: "Audi",
  VOLKSWAGEN: "Volkswagen",
};

const UPPERCASE_TOKENS = new Set([
  "AMG",
  "AWD",
  "CVT",
  "EV",
  "FWD",
  "GR",
  "GT",
  "GTI",
  "GTR",
  "HV",
  "PHEV",
  "PHV",
  "RWD",
  "RX",
  "SC",
  "STI",
  "SUV",
  "WRX",
]);

function compactKey(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

function caseWord(word: string): string {
  if (!/[A-Za-z]/.test(word)) return word;
  const upper = word.toUpperCase();
  if (UPPERCASE_TOKENS.has(upper)) return upper;
  if (/^[A-Za-z]{1,3}\d+[A-Za-z0-9]*$/.test(word)) return upper;
  if (/^\d+[A-Za-z]+$/.test(word)) return upper;
  if (/^[A-Za-z]$/.test(word)) return upper;
  return upper[0] + upper.slice(1).toLowerCase();
}

/** Normalize English display casing without touching URLs or raw source fields. */
export function toDisplayCase(value?: string): string | undefined {
  const trimmed = value?.trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;
  return trimmed
    .split(/([\s\-/]+)/)
    .map((part) => (/^[\s\-/]+$/.test(part) ? part : caseWord(part)))
    .join("");
}

/** Normalize vehicle make for storage/UI display. */
export function normalizeMakeCase(value?: string): string | undefined {
  const trimmed = value?.trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;
  return MAKE_CASE[compactKey(trimmed)] ?? toDisplayCase(trimmed);
}

/** Normalize vehicle model/title for storage/UI display. */
export function normalizeVehicleTextCase(value?: string): string | undefined {
  return toDisplayCase(value);
}
