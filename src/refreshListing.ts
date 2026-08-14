import { fetchBatch } from "./exa.js";
import { prompt } from "./llm.js";
import { normalizeRecord } from "./normalizer.js";
import { EXTRACT_PROMPT, TRANSLATE_PROMPT } from "./prompts.js";
import { isGooNetListingUrl, canonicalizeUrl } from "./utils.js";
import type { VehicleRecord } from "./types.js";

function isStrictGooNetListingUrl(url: string): boolean {
  if (!isGooNetListingUrl(url)) return false;
  try {
    const pathname = new URL(url).pathname;
    return /^\/usedcar\/spread\/goo(?:_sort)?\/\d+\/\d+\.html$/.test(pathname);
  } catch {
    return false;
  }
}

// ── Extraction ───────────────────────────────────────────────────────────────

const SYSTEM_PREFIX = `You are a data extraction assistant. Extract structured vehicle records from Goo-net listing pages and translate Japanese fields to English.
Return ONLY a valid JSON array. No markdown fences, no explanation.

Each record must have these fields:
- Raw (Japanese): titleRaw, colorRaw, transmissionRaw, driveTypeRaw, fuelTypeRaw, bodyTypeRaw, descriptionRaw, dealerRaw, locationRaw
- Translated (English): title, color, transmission, driveType, fuelType, bodyType, description, dealer, location
- Other: url, price, priceRaw, mileage, mileageRaw, year, engineSize, doors, seats, images, extractedAt

Set missing fields to null for numbers, "" for strings, [] for arrays.

${TRANSLATE_PROMPT}`;

function buildExtractionUser(url: string, markdown: string): string {
  return `${EXTRACT_PROMPT}

## Page Markdowns
<!-- PAGE: ${url} -->
${markdown}

## Instruction
Extract the vehicle record from the markdown above. Return ONLY a JSON array with a single element.`;
}

function parseExtractionResponse(raw: string): VehicleRecord | null {
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return null;
    const arr: VehicleRecord[] = JSON.parse(match[0]);
    return arr[0] ?? null;
  } catch {
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface RefreshResult {
  /** The canonical listing URL that was (re)scraped. */
  url: string;
  /** The normalized vehicle record, or null on failure. */
  record: VehicleRecord | null;
  /** Error message if the refresh failed at any stage. */
  error?: string;
}

/**
 * Re-fetch and re-extract a single Goo-net listing.
 *
 * The function always fetches a fresh copy of the page — it never reads
 * from cache or a local database. Use it to refresh stale records after
 * a price change, status update, or corrected dealer information.
 *
 * @param url - Full Goo-net listing URL, e.g.
 *   `https://www.goo-net.com/usedcar/spread/goo/10/700030247130260401001.html`
 * @returns A {@link RefreshResult} with the refreshed record or an error
 *
 * @example
 * ```ts
 * const result = await refreshListing(
 *   "https://www.goo-net.com/usedcar/spread/goo/10/700030247130260401001.html"
 * );
 *
 * if (result.record) {
 *   console.log(result.record.title, result.record.price);
 * } else {
 *   console.error("Refresh failed:", result.error);
 * }
 * ```
 */
export async function refreshListing(url: string): Promise<RefreshResult> {
  // 1. Validate the URL
  url = canonicalizeUrl(url.trim());
  if (!isStrictGooNetListingUrl(url)) {
    return { url, record: null, error: "Not a valid Goo-net listing URL" };
  }

  const exaKey = process.env.EXA_API_KEY;
  if (!exaKey) {
    return { url, record: null, error: "EXA_API_KEY is not set" };
  }

  const model = process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-v4-flash";

  // 2. Fetch fresh page content
  const { results, errors } = await fetchBatch([url], exaKey);

  if (errors[url]) {
    return { url, record: null, error: `Fetch failed: ${errors[url]}` };
  }

  const markdown = results[url];
  if (!markdown) {
    return { url, record: null, error: "Exa returned no content for this URL" };
  }

  // 3. Structured extraction + translation
  let raw: string;
  try {
    raw = await prompt(model, SYSTEM_PREFIX, buildExtractionUser(url, markdown));
  } catch (err: unknown) {
    return {
      url,
      record: null,
      error: `LLM extraction failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const extracted = parseExtractionResponse(raw);
  if (!extracted) {
    return { url, record: null, error: "LLM returned no parseable record" };
  }

  // 4. Normalize (parse price/mileage, trim strings)
  extracted.extractedAt = new Date().toISOString();
  const record = normalizeRecord(extracted);

  return { url, record };
}
