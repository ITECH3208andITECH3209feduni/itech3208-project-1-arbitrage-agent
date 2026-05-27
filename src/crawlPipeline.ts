import { fetchBatch } from "./exa.js";
import { prompt } from "./llm.js";
import { normalizeRecord } from "./normalizer.js";
import { exportToConvex } from "./convexExporter.js";
import { canonicalizeUrl } from "./utils.js";
import { validateVehicleRecord } from "./vehicleValidation.js";
import { applyEstimatedProfitAud } from "./profitEstimator.js";
import type { CrawlResult, VehicleRecord } from "./types.js";

export interface CrawlTarget {
  make?: string;
  model?: string;
  year?: number;
}

export interface CrawlPipelineConfig {
  label: string;
  urls: string[];
  model: string;
  systemPrompt: string;
  buildExtractionUser: (markdowns: string[]) => string;
  maxCharacters?: number;
  extractBatchSize?: number;
  extractConcurrency?: number;
  persist?: boolean;
  target?: CrawlTarget;
  prepareRecord?: (record: VehicleRecord, pageUrl: string) => VehicleRecord | null;
}

export function logUrls(prefix: string, urls: string[]): void {
  urls.forEach((url, i) => console.error(`${prefix} ${i + 1}. ${url}`));
}

export function buildTargetInstruction(target?: CrawlTarget): string {
  if (!target?.make && !target?.model && !target?.year) return "";
  return `\n\n## Target Vehicle Match\nOnly return listings that match all provided target fields. Verify against page text before returning.\n- make: ${target.make ?? "any"}\n- model: ${target.model ?? "any"}\n- year: ${target.year ?? "any"}\nInclude extracted make, model, and year fields for every returned record.`;
}

function norm(value?: string): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function tokens(value?: string): string[] {
  return (value ?? "").toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function fieldMatches(target: string, primary?: string, fallback?: string): boolean {
  const targetNorm = norm(target);
  if (!targetNorm) return true;
  const primaryNorm = norm(primary);
  if (primaryNorm === targetNorm) return true;
  if (targetNorm.length <= 3 && primaryNorm.startsWith(targetNorm)) return true;

  const fallbackTokens = tokens(fallback);
  if (targetNorm.length <= 3) return fallbackTokens.includes(targetNorm);
  return norm(fallback).includes(targetNorm);
}

function matchesTarget(record: VehicleRecord, target?: CrawlTarget): boolean {
  if (!target) return true;
  if (target.year && record.year !== target.year) return false;
  if (target.make && !fieldMatches(target.make, record.make, record.title)) return false;
  if (target.model && !fieldMatches(target.model, record.model, record.title)) return false;
  return true;
}

function parseExtractionResponse(label: string, raw: string): VehicleRecord[] {
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  } catch (err: unknown) {
    console.error(`[${label}] Failed to parse extraction result: ${err}`);
    return [];
  }
}

async function extractInParallel({
  label,
  results,
  model,
  systemPrompt,
  buildExtractionUser,
  extractBatchSize = 10,
  extractConcurrency = 5,
  prepareRecord,
}: Omit<CrawlPipelineConfig, "urls" | "persist" | "maxCharacters"> & {
  results: Record<string, string>;
}): Promise<VehicleRecord[]> {
  const entries = Object.entries(results);
  if (entries.length === 0) return [];

  const batches: Array<Array<[string, string]>> = [];
  for (let i = 0; i < entries.length; i += extractBatchSize) {
    batches.push(entries.slice(i, i + extractBatchSize));
  }

  console.error(`[${label}] Extracting ${entries.length} pages in ${batches.length} batches (${extractBatchSize}/batch, ${extractConcurrency} concurrent)...`);

  const allRecords: VehicleRecord[] = [];
  for (let i = 0; i < batches.length; i += extractConcurrency) {
    const chunk = batches.slice(i, i + extractConcurrency);
    const batchResults = await Promise.all(
      chunk.map(async (batch, j) => {
        const batchIndex = i + j + 1;
        console.error(`[${label}]   LLM batch ${batchIndex}/${batches.length} (${batch.length} pages)...`);
        const markdowns = batch.map(([url, md]) => `<!-- PAGE: ${url} -->\n${md}`);
        const raw = await prompt(model, systemPrompt, buildExtractionUser(markdowns));
        const parsed = parseExtractionResponse(label, raw);
        if (!prepareRecord) return parsed;
        const batchUrls = new Set(batch.map(([url]) => canonicalizeUrl(url)));
        const fallbackPageUrl = batch.length === 1 ? (batch[0]?.[0] ?? "") : "";
        return parsed
          .map((record) => {
            const recordUrl = record.url && batchUrls.has(canonicalizeUrl(record.url))
              ? record.url
              : fallbackPageUrl;
            return prepareRecord(record, recordUrl);
          })
          .filter((record): record is VehicleRecord => record !== null);
      }),
    );
    allRecords.push(...batchResults.flat());
  }

  return allRecords;
}

export async function runCrawlPipeline(config: CrawlPipelineConfig): Promise<CrawlResult> {
  const { label, urls } = config;

  if (urls.length === 0) {
    return { totalFound: 0, totalExtracted: 0, totalFailed: 0, records: [], outputPath: "convex" };
  }

  console.error(`[${label}] Scraping ${urls.length} URLs:`);
  logUrls(`[${label}]   scraping`, urls);
  console.error(`[${label}] Fetching ${urls.length} pages...`);
  const { results: pageResults, errors: fetchErrors } = await fetchBatch(urls, process.env.EXA_API_KEY!, config.maxCharacters);
  console.error(`[${label}] Fetched ${Object.keys(pageResults).length} pages, ${Object.keys(fetchErrors).length} errors`);

  const records = await extractInParallel({ ...config, results: pageResults });
  const now = new Date().toISOString();
  const normalized: VehicleRecord[] = [];
  const failedUrls = new Set<string>();
  let totalFailed = 0;

  for (const record of records) {
    if (!record || typeof record !== "object" || (!record.title && !record.priceRaw && !record.mileageRaw)) {
      totalFailed++;
      if (record?.url) failedUrls.add(canonicalizeUrl(record.url));
      continue;
    }
    record.extractedAt = now;
    const normalizedRecord = normalizeRecord(record);
    const validated = validateVehicleRecord(normalizedRecord);
    if (!validated) {
      totalFailed++;
      if (record.url) failedUrls.add(canonicalizeUrl(record.url));
      continue;
    }
    if (!matchesTarget(validated, config.target)) {
      totalFailed++;
      if (record.url) failedUrls.add(canonicalizeUrl(record.url));
      continue;
    }
    normalized.push(applyEstimatedProfitAud(validated));
  }

  const extractedUrls = new Set(normalized.map((r) => canonicalizeUrl(r.url)));
  for (const url of urls) {
    const canonicalUrl = canonicalizeUrl(url);
    if (!extractedUrls.has(canonicalUrl) && !failedUrls.has(canonicalUrl)) totalFailed++;
  }

  if (normalized.length > 0) {
    console.error(`[${label}] Extracted ${normalized.length} vehicle URLs:`);
    logUrls(`[${label}]   extracted`, normalized.map((record) => record.url));
  }

  if (config.persist !== false) {
    await exportToConvex(normalized);
    console.error(`[${label}] Exported ${normalized.length} records to Convex`);
  }

  return {
    totalFound: urls.length,
    totalExtracted: normalized.length,
    totalFailed,
    records: normalized,
    outputPath: "convex",
  };
}
