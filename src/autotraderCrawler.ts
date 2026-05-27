import * as cheerio from "cheerio";
import { fetchBatch, searchAustralianListings } from "./exa.js";
import { getAutotraderBrandPage, getModelFamily } from "./brands.js";
import { buildTargetInstruction, logUrls, runCrawlPipeline } from "./crawlPipeline.js";
import type { CrawlResult, VehicleRecord } from "./types.js";

export interface AutotraderCrawlConfig {
  /** Autotrader search term (e.g. "Toyota Alphard"). */
  query?: string;
  /** Autotrader brand slug/name (e.g. "toyota"). */
  brand?: string;
  /** Optional Autotrader model slug/name (e.g. "alphard"). */
  model?: string;
  /** Optional exact year target. */
  year?: number;
  /** Direct listing URLs to fetch. Overrides query discovery when set. */
  urls?: string[];
  /** Maximum number of listings to process (default: 10). */
  max: number;
  /** Upsert extracted records into Convex. Defaults to true for CLI usage. */
  persist?: boolean;
}

const SYSTEM_PREFIX = `You are a data extraction assistant. Extract structured vehicle records from Autotrader vehicle listing pages.
Return ONLY a valid JSON array. No markdown fences, no explanation.

Each record must have these fields:
- Market metadata: market="AU", source="autotrader", sourceType="dealer" or "classified", currency="AUD", sourceId when visible
- Text fields: title, titleRaw, make, model, color, colorRaw, transmission, transmissionRaw, driveType, driveTypeRaw, fuelType, fuelTypeRaw, bodyType, bodyTypeRaw, description, descriptionRaw, dealer, dealerRaw, location, locationRaw, engineSize, priceRaw, mileageRaw
- Numeric fields: price, mileage, year, doors, seats

Set url to the exact <!-- PAGE: ... --> URL for each page. Prefer car-specific detail page fields from the Details / Features / Specs sections over result-card text.
- Other: url, images, extractedAt

Do not return estimatedProfitAud. It is calculated after extraction by application code.
Use English text for both translated and raw fields for AU listings. Set missing fields to null for numbers, "" for strings, [] for arrays.`;

function buildExtractionUser(markdowns: string[], target = ""): string {
  return `${target}

## Page Markdowns
${markdowns.join("\n\n---\n\n")}

## Instruction
Extract all matching Autotrader vehicle records from the markdown above. Return ONLY a JSON array.`;
}

function parseAudPrice(raw: string): number | null {
  if (!raw) return null;
  if (/poa|call|contact|ask|tba/i.test(raw)) return null;
  const match = raw.replace(/\s/g, "").match(/\$?([\d,]+)/);
  return match ? Number.parseInt(match[1].replace(/,/g, ""), 10) : null;
}

function isAutotraderDetailUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return ["www.autotrader.com.au", "autotrader.com.au"].includes(u.hostname) && u.pathname.startsWith("/car/");
  } catch {
    return false;
  }
}

function extractAutotraderDetailUrls(htmlOrMarkdown: string, pageUrl: string): string[] {
  const $ = cheerio.load(htmlOrMarkdown);
  const hrefUrls = $("a[href]")
    .map((_, element) => $(element).attr("href"))
    .get()
    .filter((href): href is string => Boolean(href))
    .map((href) => new URL(href, pageUrl).toString());
  const markdownUrls = [...htmlOrMarkdown.matchAll(/https?:\/\/[^\s)\]"']+/g)].map((match) => match[0]);

  return [...new Set([...hrefUrls, ...markdownUrls].filter(isAutotraderDetailUrl))];
}

async function fetchAutotraderDetailUrlsFromResultPage(url: string, max: number): Promise<string[]> {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`Autotrader result page ${res.status}: ${url}`);

  const html = await res.text();
  return extractAutotraderDetailUrls(html, url).slice(0, max);
}

function extractAutotraderSourceId(url: string): string | undefined {
  const match = url.match(/\/car\/(\d+)(?:\/|$)/);
  return match?.[1];
}

function sanitizeSourceType(value: unknown): "dealer" | "classified" {
  return value === "classified" ? "classified" : "dealer";
}

function prepareAutotraderRecord(record: VehicleRecord, pageUrl: string): VehicleRecord {
  return {
    ...record,
    url: pageUrl,
    market: "AU",
    source: "autotrader",
    sourceType: sanitizeSourceType(record.sourceType),
    currency: "AUD",
    sourceId: record.sourceId || extractAutotraderSourceId(pageUrl),
    price: record.price ?? parseAudPrice(record.priceRaw),
  };
}

/** Crawl Autotrader listings and upsert them into Convex unless persist=false. */
export async function crawlAutotrader(config: AutotraderCrawlConfig): Promise<CrawlResult> {
  const exaKey = process.env.EXA_API_KEY;
  if (!exaKey) throw new Error("EXA_API_KEY required");
  if (!config.query && !config.brand && (!config.urls || config.urls.length === 0)) {
    throw new Error("Either --query, --brand, or --url required");
  }

  const model = process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash";
  const modelFamily = getModelFamily(config.model);
  const sourceUrls = (config.urls && config.urls.length > 0)
    ? config.urls
    : config.brand
      ? [
          getAutotraderBrandPage(config.brand, config.model, config.year),
          ...(modelFamily && modelFamily !== config.model ? [getAutotraderBrandPage(config.brand, modelFamily, config.year)] : []),
        ]
      : await searchAustralianListings(config.query ?? "", exaKey, config.max, config.year);

  console.error(`[autotrader-crawl] Discovered ${sourceUrls.length} source URLs`);
  logUrls("[autotrader-crawl]   discovered", sourceUrls);
  if (sourceUrls.length === 0) {
    return { totalFound: 0, totalExtracted: 0, totalFailed: 0, records: [], outputPath: "convex" };
  }

  const directDetailUrls = sourceUrls.filter(isAutotraderDetailUrl);
  const searchUrls = sourceUrls.filter((url) => !isAutotraderDetailUrl(url));
  let detailUrls = directDetailUrls;

  if (searchUrls.length > 0) {
    console.error(`[autotrader-crawl] Expanding ${searchUrls.length} result pages to current car detail URLs:`);
    logUrls("[autotrader-crawl]   result-page", searchUrls);

    const htmlDetailUrls: string[] = [];
    for (const url of searchUrls) {
      try {
        htmlDetailUrls.push(...await fetchAutotraderDetailUrlsFromResultPage(url, config.max));
      } catch (err: unknown) {
        console.error(`[autotrader-crawl] Direct result-page parse failed for ${url}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (htmlDetailUrls.length > 0) {
      detailUrls = [...detailUrls, ...htmlDetailUrls];
    } else {
      const { results: searchResults, errors: searchErrors } = await fetchBatch(searchUrls, exaKey, 50000);
      console.error(`[autotrader-crawl] Fetched ${Object.keys(searchResults).length} result pages, ${Object.keys(searchErrors).length} errors`);
      detailUrls = [
        ...detailUrls,
        ...Object.entries(searchResults).flatMap(([url, html]) => extractAutotraderDetailUrls(html, url)),
      ];
    }
  }

  detailUrls = [...new Set(detailUrls)].slice(0, config.max);
  const target = { make: config.brand, model: modelFamily ?? config.model, year: config.year };
  console.error(`[autotrader-crawl] Discovered ${detailUrls.length} car detail URLs`);
  logUrls("[autotrader-crawl]   car", detailUrls);

  return await runCrawlPipeline({
    label: "autotrader-crawl",
    urls: detailUrls,
    model,
    systemPrompt: SYSTEM_PREFIX,
    buildExtractionUser: (markdowns) => buildExtractionUser(markdowns, buildTargetInstruction(target)),
    target,
    maxCharacters: 16000,
    extractBatchSize: 1,
    extractConcurrency: 5,
    persist: config.persist,
    prepareRecord: prepareAutotraderRecord,
  });
}

