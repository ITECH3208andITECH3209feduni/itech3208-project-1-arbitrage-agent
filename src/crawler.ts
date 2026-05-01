import * as fs from "fs";
import * as path from "path";
import { prompt } from "./llm.js";
import { discover, fetchBatch } from "./exa.js";
import { normalizeRecord } from "./normalizer.js";
import { exportJSON } from "./exporter.js";
import { canonicalizeUrl } from "./utils.js";
import { EXTRACT_PROMPT, TRANSLATE_PROMPT } from "./prompts.js";
import type { CrawlConfig, CrawlResult, VehicleRecord } from "./types.js";

/**
 * Crawl Goo-net used car listings.
 *
 * Pipeline:
 * 1. Discover listing detail URLs via Exa
 * 2. Batch-fetch all pages as markdown
 * 3. LLM extracts + translates each page to VehicleRecord
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
  console.error(`[crawl] Discovering URLs...`);
  let urls = await discover(config.brand, config.brandUrl, exaKey);
  urls = urls.slice(0, config.max);
  const totalFound = urls.length;
  console.error(`[crawl] Discovered ${totalFound} URLs`);

  if (urls.length === 0) {
    return { totalFound: 0, totalExtracted: 0, totalFailed: 0, records: [], outputPath: config.outDir || "./data" };
  }

  // 2. Batch fetch
  console.error(`[crawl] Batch-fetching ${urls.length} pages...`);
  const { markdown, errors: fetchErrors } = await fetchBatch(urls, exaKey);
  console.error(`[crawl] Fetched, ${Object.keys(fetchErrors).length} errors`);

  // 3. Extract + translate
  const system = `You are a data extraction assistant. Extract structured vehicle records from Goo-net listing pages and translate Japanese fields to English.
Return ONLY a valid JSON array. No markdown fences, no explanation.

Each record must have these fields: url, title, price, priceRaw, mileage, mileageRaw, year, color, transmission, driveType, engineSize, fuelType, bodyType, doors, seats, dealer, location, description, images, extractedAt.
Set missing fields to null for numbers, "" for strings, [] for arrays.
Keep dealer and location as-is (proper nouns).

${TRANSLATE_PROMPT}`;

  const user = `${EXTRACT_PROMPT}

## Page Markdowns
${markdown}

## Instruction
Extract all vehicle records from the markdown above. Return ONLY a JSON array.`;

  console.error(`[crawl] Extracting + translating...`);
  const raw = await prompt(model, system, user);

  // 4. Parse response
  let records: VehicleRecord[] = [];
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    records = match ? JSON.parse(match[0]) : [];
  } catch (err: unknown) {
    console.error(`[crawl] Failed to parse extraction result: ${err}`);
  }

  // 5. Normalize
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

  // 6. Export
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