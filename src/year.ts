export function normalizeYear(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const year = typeof value === "number" ? value : Number(value);
  const maxYear = new Date().getFullYear() + 1;
  if (!Number.isInteger(year) || year < 1900 || year > maxYear) {
    throw new Error(`Invalid year: ${value}. Use an integer from 1900 to ${maxYear}.`);
  }
  return year;
}
