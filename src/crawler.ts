import * as fs from "fs";
import * as path from "path";
import { prompt } from "./llm.js";
import { discover, fetchBatch } from "./exa.js";
import { normalizeRecord } from "./normalizer.js";
import { exportJSON } from "./exporter.js";
import { canonicalizeUrl } from "./utils.js";
import { EXTRACT_PROMPT, TRANSLATE_PROMPT } from "./prompts.js";
import type { CrawlConfig, CrawlResult, VehicleRecord } from "./types.js";

/** Number of pages per LLM extraction call. */
const EXTRACT_BATCH = 10;

const SYSTEM_PREFIX = `You are a data extraction assistant. Extract structured vehicle records from Goo-net listing pages and translate Japanese fields to English.
Return ONLY a valid JSON array. No markdown fences, no explanation.

Each record must have these fields:
- Raw (Japanese): titleRaw, colorRaw, transmissionRaw, driveTypeRaw, fuelTypeRaw, bodyTypeRaw, descriptionRaw, dealerRaw, locationRaw
- Translated (English): title, color, transmission, driveType, fuelType, bodyType, description, dealer, location
- Other: url, price, priceRaw, mileage, mileageRaw, year, engineSize, doors, seats, images, extractedAt

Set missing fields to null for numbers, "" for strings, [] for arrays.

${TRANSLATE_PROMPT}`;

/**
 * Build extraction prompt for a batch of page markdowns.
 */
function buildExtractionUser(markdowns: string[]): string {
  return `${EXTRACT_PROMPT}

## Page Markdowns
${markdowns.join("\n\n---\n\n")}

## Instruction
Extract all vehicle records from the markdown above. Return ONLY a JSON array.`;
}

/**
 * Parse LLM response into VehicleRecord array.
 */
function parseExtractionResponse(raw: string): VehicleRecord[] {
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  } catch (err: unknown) {
    console.error(`[crawl] Failed to parse extraction result: ${err}`);
    return [];
  }
}

/**
 * Split combined markdown into per-URL blocks, group into batches,
 * send parallel LLM calls, merge results.
 */
async function extractInParallel(
  results: Record<string, string>,
  model: string,
  concurrency: number = 5,
): Promise<VehicleRecord[]> {
  const entries = Object.entries(results);
  if (entries.length === 0) return [];

  // Group entries into batches of EXTRACT_BATCH
  const batches: Array<Array<[string, string]>> = [];
  for (let i = 0; i < entries.length; i += EXTRACT_BATCH) {
    batches.push(entries.slice(i, i + EXTRACT_BATCH));
  }

  console.error(`[crawl] Extracting ${entries.length} pages in ${batches.length} batches (${EXTRACT_BATCH}/batch, ${concurrency} concurrent)...`);

  // Process batches with concurrency limit
  const allRecords: VehicleRecord[] = [];
  for (let i = 0; i < batches.length; i += concurrency) {
    const chunk = batches.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      chunk.map(async (batch, j) => {
        const batchIndex = i + j + 1;
        console.error(`[crawl]   LLM batch ${batchIndex}/${batches.length} (${batch.length} pages)...`);
        const markdowns = batch.map(([url, md]) => `<!-- PAGE: ${url} -->\n${md}`);
        const user = buildExtractionUser(markdowns);
        const raw = await prompt(model, SYSTEM_PREFIX, user);
        return parseExtractionResponse(raw);
      }),
    );
    allRecords.push(...batchResults.flat());
  }

  return allRecords;
}

/**
 * Crawl Goo-net used car listings.
 *
 * Pipeline:
 * 1. Discover listing detail URLs via known brand pages + Exa subpages
 * 2. Batch-fetch all pages as markdown via Exa
 * 3. LLM extracts + translates in parallel batches of 10
 * 4. Normalize (parse price/mileage, trim strings)
 * 5. Export JSON
 */
export async function crawl(config: CrawlConfig): Promise<CrawlResult> {
  if (!config.brand && !config.brandUrl) {
    throw new Error("Either --brand or --brand-url required");
  }
  const exaKey = process.env.EXA_API_KEY;
  if (!exaKey) throw new Error("EXA_API_KEY required");

  const model = process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash";

  // 1. Discover
  console.error(`[crawl] Discovering URLs for "${config.brand || config.brandUrl}"...`);
  let urls = await discover(config.brand, config.brandUrl, exaKey);
  urls = urls.slice(0, config.max);
  const totalFound = urls.length;
  console.error(`[crawl] Discovered ${totalFound} listing URLs`);

  if (urls.length === 0) {
    return { totalFound: 0, totalExtracted: 0, totalFailed: 0, records: [], outputPath: config.outDir || "./data" };
  }

  // 2. Batch fetch pages
  console.error(`[crawl] Fetching ${urls.length} pages...`);
  const { results: pageResults, errors: fetchErrors } = await fetchBatch(urls, exaKey);
  console.error(`[crawl] Fetched ${Object.keys(pageResults).length} pages, ${Object.keys(fetchErrors).length} errors`);

  // 3. Extract + translate in parallel
  const records = await extractInParallel(pageResults, model);

  // 4. Normalize
  const now = new Date().toISOString();
  const normalized: VehicleRecord[] = [];
  let totalFailed = 0;

  for (const record of records) {
    if (!record || typeof record !== "object" || (!record.title && !record.priceRaw && !record.mileageRaw)) {
      totalFailed++;
      continue;
    }
    record.extractedAt = now;
    normalized.push(normalizeRecord(record));
  }

  // Track uncovered URLs
  const extractedUrls = new Set(normalized.map((r) => canonicalizeUrl(r.url)));
  for (const url of urls) {
    if (!extractedUrls.has(canonicalizeUrl(url))) totalFailed++;
  }

  // 5. Export
  const outDir = config.outDir || "./data";
  fs.mkdirSync(outDir, { recursive: true });
  const filePath = path.join(outDir, "vehicles.json");
  exportJSON(normalized, filePath);
  console.error(`[crawl] Exported ${normalized.length} records to ${filePath}`);

  return {
    totalFound,
    totalExtracted: normalized.length,
    totalFailed,
    records: normalized,
    outputPath: outDir,
  };
}
