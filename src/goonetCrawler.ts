import { getModelFamily } from "./brands.js";
import { discover } from "./exa.js";
import { EXTRACT_PROMPT, TRANSLATE_PROMPT } from "./prompts.js";
import { buildTargetInstruction, logUrls, runCrawlPipeline } from "./crawlPipeline.js";
import type { CrawlConfig, CrawlResult } from "./types.js";

const SYSTEM_PREFIX = `You are a data extraction assistant. Extract structured vehicle records from Goo-net listing pages and translate Japanese fields to English.
Return ONLY a valid JSON array. No markdown fences, no explanation.

Each record must have these fields:
- Raw (Japanese): titleRaw, colorRaw, transmissionRaw, driveTypeRaw, fuelTypeRaw, bodyTypeRaw, descriptionRaw, dealerRaw, locationRaw
- Translated (English): title, color, transmission, driveType, fuelType, bodyType, description, dealer, location
- Other: url, make, model, price, priceRaw, mileage, mileageRaw, year, engineSize, doors, seats, images, extractedAt

Do not return estimatedProfitAud. It is calculated after extraction by application code.
Set missing fields to null for numbers, "" for strings, [] for arrays.

${TRANSLATE_PROMPT}`;

function buildExtractionUser(markdowns: string[], target = ""): string {
  return `${EXTRACT_PROMPT}${target}

## Page Markdowns
${markdowns.join("\n\n---\n\n")}

## Instruction
Extract all matching vehicle records from the markdown above. Return ONLY a JSON array.`;
}

/** Crawl Goo-net used car listings and upsert them into Convex unless persist=false. */
export async function crawlGoonet(config: CrawlConfig): Promise<CrawlResult> {
  if (!config.brand && !config.brandUrl) {
    throw new Error("Either --brand or --brand-url required");
  }
  const exaKey = process.env.EXA_API_KEY;
  if (!exaKey) throw new Error("EXA_API_KEY required");

  const model = process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash";
  const brand = config.brand?.trim().toUpperCase();
  const modelFamily = getModelFamily(config.model);
  const target = { make: brand, model: modelFamily ?? config.model, year: config.year };

  console.error(`[goonet-crawl] Discovering URLs for "${brand || config.brandUrl}"...`);
  const urls = (await discover(brand, config.brandUrl, exaKey, config.model, config.year)).slice(0, config.max);
  console.error(`[goonet-crawl] Discovered ${urls.length} listing URLs`);
  logUrls("[goonet-crawl]   discovered", urls);

  return await runCrawlPipeline({
    label: "goonet-crawl",
    urls,
    model,
    systemPrompt: SYSTEM_PREFIX,
    buildExtractionUser: (markdowns) => buildExtractionUser(markdowns, buildTargetInstruction(target)),
    target,
    extractBatchSize: 10,
    extractConcurrency: 5,
    persist: config.persist,
  });
}

/** Backward-compatible alias. Prefer crawlGoonet. */
export const crawl = crawlGoonet;
