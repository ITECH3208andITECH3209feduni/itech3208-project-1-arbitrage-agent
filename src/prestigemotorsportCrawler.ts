/**Use search system at https://prestigemotorsport.com.au/auctions/ 
  Filter for Past, non-uss location only, make and model.
  This will return auctions from the past 6 months
  these my not be sold though so listings need to be checked for sold status
*/
import * as cheerio from "cheerio";
import { buildTargetInstruction, logUrls, runCrawlPipeline } from "./crawlPipeline.js";
import type { CrawlResult, VehicleRecord } from "./types.js";

const AJAX_URL = "https://prestigemotorsport.com.au/wp-admin/admin-ajax.php";
const RESULTS_PAGE_SIZE = 20; // observed default batch size for search_results_car_dev; adjust if the real page size differs

/**
 * marka_id values scraped from the live "jas-search-form" make <select> on
 * https://prestigemotorsport.com.au/auctions/ (option value = marka_id, label = data-name).
 * Keyed by uppercase make name for case-insensitive lookup.
 */
const MAKE_IDS: Record<string, number> = {
  AC: 158, ACURA: 11, ALFA: 161, "ALFA ROMEO": 22, ALFAROMEO: 12, AMC: 102, AMG: 111,
  "ASTON MARTIN": 112, ATLAS: 168, AUDI: 13, AUSTIN: 113, AUTOBIANCHI: 335, BENTLEY: 115,
  BIRKIN: 116, BLUEBIRD: 178, BMW: 14, "BMW ALPINA": 117, BUICK: 118, CADILLAC: 119,
  CATERHAM: 120, CATERPILLAR: 337, CHEVROLET: 121, CHRYSLER: 15, CITROEN: 16, DAEWOO: 123,
  DAIHATSU: 9, DAIMLER: 17, DATSUN: 197, DODGE: 124, "EUROPEAN FORD": 338, FERRARI: 126,
  FIAT: 18, FORD: 19, "FORD JAPAN": 101, FRUEHAUF: 214, GM: 20, GMC: 128, HANIX: 339,
  HINO: 21, HITACHI: 340, HONDA: 5, HUMMER: 129, HYUNDAI: 130, INFINITI: 229, ISEKI: 341,
  ISUZU: 8, JAGUAR: 132, JEEP: 234, KAWASAKI: 236, KIA: 241, KOBELCO: 342, KOMATSU: 343,
  KUBOTA: 344, LADA: 245, LAMBORGHINI: 134, LANCIA: 135, "LAND ROVER": 34, LEXUS: 23,
  LINCOLN: 35, LOTUS: 136, MASERATI: 137, MAYBACH: 255, MAZDA: 3, "MERCEDES BENZ": 24,
  MERCURY: 36, MG: 33, MINI: 139, MITSUBISHI: 4, MITSUOKA: 10, MOKE: 141, MORGAN: 142,
  MORRIS: 143, NISSAN: 2, OLDSMOBILE: 145, OPEL: 25, OTHER: 99, OTHERS: 98, PEUGEOT: 26,
  PONTIAC: 147, PORSCHE: 148, RANGER: 280, RENAULT: 27, "ROLLS ROYCE": 149, ROVER: 28,
  SAAB: 150, SAFARI: 284, SATURN: 151, SCION: 286, SKYLINE: 290, SMART: 291,
  SSANGYONG: 153, SUBARU: 7, SUMITOMO: 345, SUZUKI: 6, TADANO: 346, TANK: 302, TCM: 30,
  TESLA: 348, THOR: 304, TITAN: 307, TOYOTA: 1, TRAILER: 309, TRITON: 312, TRIUMPH: 313,
  TVR: 155, VANGUARD: 315, VOLKSWAGEN: 31, VOLVO: 32, WESTFIELD: 156, WINNEBAGO: 157,
  YAMAHA: 326, YANMAR: 347,
};

/** auction_name[] value confirmed from the live form: option value="2" => "Non-USS only". */
const AUCTION_NAME_NON_USS = "2";

export interface PrestigeMotorsportCrawlConfig {
  /** Make to filter auctions by (e.g. "Toyota"). Must match a key in MAKE_IDS (case-insensitive). */
  make?: string;
  /** Optional model to filter by (e.g. "Alphard"). Resolved to model_id via the site's search_model_car AJAX call. */
  model?: string;
  /** Optional year_from filter. */
  yearFrom?: number;
  /** Optional year_to filter. */
  yearTo?: number;
  /** Direct listing detail URLs to fetch. Overrides search discovery when set. */
  urls?: string[];
  /** Maximum number of listings to process (default: 10). */
  max: number;
  /** Only keep listings confirmed SOLD. Past auctions can include unsold/passed-in lots. Default: true. */
  requireSold?: boolean;
  /** Upsert extracted records into Convex. Defaults to true for CLI usage. */
  persist?: boolean;
}

const SYSTEM_PREFIX = `You are a data extraction assistant. Extract structured vehicle records from Prestige Motorsport past Japanese-auction listing pages.
Return ONLY a valid JSON array. No markdown fences, no explanation.

Each record must have these fields:
- Market metadata: market="AU", source="prestigemotorsport", sourceType="auction", currency="AUD", sourceId when visible
- Text fields: title, titleRaw, make, model, color, colorRaw, transmission, transmissionRaw, driveType, driveTypeRaw, fuelType, fuelTypeRaw, bodyType, bodyTypeRaw, description, descriptionRaw, dealer, dealerRaw, location, locationRaw, engineSize, priceRaw, mileageRaw
- Numeric fields: price, mileage, year, doors, seats
- Auction-specific: soldStatus ("sold", "unsold", or "unknown"), hammerPriceRaw (the winning bid / sold price text as shown, e.g. "Sold for $34,500"), auctionHouse (e.g. "USS Tokyo", "TAA Kantou")

Set url to the exact <!-- PAGE: ... --> URL for each page. Prefer car-specific detail page fields from the Details / Features / Specs sections over result-card text.
- Other: url, images, extractedAt

Do not return estimatedProfitAud. It is calculated after extraction by application code.
Use English text for both translated and raw fields.
If a listing does not clearly show a SOLD result, set soldStatus="unsold" or "unknown" rather than guessing "sold".
Set missing fields to null for numbers, "" for strings, [] for arrays.`;

function buildExtractionUser(markdowns: string[], target = ""): string {
  return `${target}

## Page Markdowns
${markdowns.join("\n\n---\n\n")}

## Instruction
Extract all matching Prestige Motorsport past-auction vehicle records from the markdown above. Return ONLY a JSON array.`;
}

function parseAudPrice(raw: string | undefined | null): number | null {
  if (!raw) return null;
  if (/poa|call|contact|ask|tba|unsold|passed in/i.test(raw)) return null;
  const match = raw.replace(/\s/g, "").match(/\$?([\d,]+)/);
  return match ? Number.parseInt(match[1].replace(/,/g, ""), 10) : null;
}

function resolveMakeId(make: string): number {
  const id = MAKE_IDS[make.trim().toUpperCase()];
  if (!id) {
    throw new Error(
      `Unknown make "${make}" — not found in the site's marka_id list. ` +
      `Check the spelling against the live make dropdown at https://prestigemotorsport.com.au/auctions/`
    );
  }
  return id;
}

interface ModelOption {
  ext_id: string;
  name: string;
}

/** Calls action=search_model_car to resolve a model name to its model_id (ext_id) for a given make. */
async function resolveModelId(markaId: number, model: string, auctionDate = "Past"): Promise<string | undefined> {
  const body = new URLSearchParams({
    action: "search_model_car",
    marka_id: String(markaId),
    "auction-date": auctionDate,
  });

  const res = await fetch(AJAX_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      accept: "application/json, text/javascript, */*",
    },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`search_model_car ${res.status} for marka_id=${markaId}`);

  const json = JSON.parse(await res.text()) as { models?: ModelOption[] };
  const match = json.models?.find((m) => m.name.trim().toUpperCase() === model.trim().toUpperCase());
  if (!match) {
    console.error(
      `[prestige-crawl] Could not resolve model "${model}" for marka_id=${markaId}. ` +
      `Available: ${json.models?.map((m) => m.name).join(", ") ?? "(none returned)"}`
    );
  }
  return match?.ext_id;
}

interface SearchResultsResponse {
  cars_html?: string;
  total?: number;
}

/** Calls action=search_results_car_dev — the endpoint the live "SEARCH" button hits — for one page of results. */
async function fetchSearchResultsPage(
  formParams: URLSearchParams,
  limitStart: number
): Promise<SearchResultsResponse> {
  const body = new URLSearchParams(formParams);
  body.set("action", "search_results_car_dev");
  body.set("limit_start", String(limitStart));

  const res = await fetch(AJAX_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      accept: "application/json, text/javascript, */*",
    },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`search_results_car_dev ${res.status} at limit_start=${limitStart}`);

  return JSON.parse(await res.text()) as SearchResultsResponse;
}

// TODO: verify these selectors against a real cars_html fragment (captured from the
// Network tab). Inferred from the site's own CSS: .jas-car-item-content h5 a is the
// title/detail link, .jas-price h6 is the price/hammer text.
function extractListingsFromCarsHtml(carsHtml: string): { url: string; priceText: string }[] {
  const $ = cheerio.load(carsHtml);
  return $(".jas-car-item")
    .map((_, el) => {
      const href = $(el).find(".jas-car-item-content h5 a").attr("href") ?? $(el).find("a").first().attr("href");
      const priceText = $(el).find(".jas-price h6").first().text().trim();
      return href ? { url: new URL(href, "https://prestigemotorsport.com.au/").toString(), priceText } : null;
    })
    .get()
    .filter((x): x is { url: string; priceText: string } => x !== null);
}

function isPrestigeMotorsportDetailUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return ["prestigemotorsport.com.au", "www.prestigemotorsport.com.au"].includes(u.hostname);
  } catch {
    return false;
  }
}

function extractPrestigeMotorsportSourceId(url: string): string | undefined {
  // TODO: verify actual listing id path/query segment once a real detail URL is seen.
  const match = url.match(/[?&]id=(\d+)/) || url.match(/-(\d+)\/?$/);
  return match?.[1];
}

// TODO: verify the real "sold" markers on the detail page. Best-effort text
// heuristic until the live DOM/classes for a sold listing are confirmed.
function checkSoldStatusFromHtml(html: string): "sold" | "unsold" | "unknown" {
  const text = cheerio.load(html).root().text();
  if (/\bsold\s*(for|on|to)?\b/i.test(text) && !/\bnot\s+sold\b/i.test(text)) return "sold";
  if (/\bpassed\s*in\b|\bunsold\b|\bno\s+sale\b|\breserve\s+not\s+met\b/i.test(text)) return "unsold";
  return "unknown";
}

function sanitizeSoldStatus(value: unknown): "sold" | "unsold" | "unknown" {
  return value === "sold" || value === "unsold" ? value : "unknown";
}

function sanitizeSourceType(value: unknown): "dealer" | "classified" | "auction" {
  return value === "dealer" || value === "classified" ? value : "auction";
}

function prepareAuctionRecord(record: VehicleRecord, pageUrl: string): VehicleRecord {
  return {
    ...record,
    url: pageUrl,
    market: "AU",
    source: "prestigemotorsport",
    sourceType: sanitizeSourceType(record.sourceType),
    currency: "AUD",
    sourceId: record.sourceId || extractPrestigeMotorsportSourceId(pageUrl),
    price: record.price ?? parseAudPrice(record.hammerPriceRaw || record.priceRaw),
    soldStatus: sanitizeSoldStatus(record.soldStatus),
  };
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`Listing page ${res.status}: ${url}`);
  return await res.text();
}

/**
 * Pre-filters candidate detail URLs down to confirmed-SOLD listings before
 * they're passed to the (paid) LLM extraction pipeline, since past auctions
 * commonly include unsold/passed-in lots.
 */
async function filterToSoldListings(urls: string[]): Promise<string[]> {
  const sold: string[] = [];
  for (const url of urls) {
    try {
      const html = await fetchHtml(url);
      if (checkSoldStatusFromHtml(html) === "sold") sold.push(url);
    } catch (err: unknown) {
      console.error(`[prestige-crawl] Sold-status check failed for ${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return sold;
}

/**
 * Discovers past-auction listing URLs by driving the same AJAX search the
 * site's own "SEARCH" button uses (POST admin-ajax.php action=search_results_car_dev),
 * paginating via limit_start the same way the "Load more" button does.
 */
async function discoverDetailUrls(config: PrestigeMotorsportCrawlConfig): Promise<string[]> {
  if (!config.make) throw new Error("make is required for search discovery");
  const markaId = resolveMakeId(config.make);
  const modelId = config.model ? await resolveModelId(markaId, config.model) : "";
  if (config.model && !modelId) {
    throw new Error(`Could not resolve model "${config.model}" for make "${config.make}"`);
  }

  const formParams = new URLSearchParams();
  formParams.set("auction-date", "Past");
  formParams.set("auction_date_select", "Past");
  formParams.set("marka_id", String(markaId));
  formParams.set("model_id", modelId ?? "");
  formParams.set("year_from", config.yearFrom ? String(config.yearFrom) : "");
  formParams.set("year_to", config.yearTo ? String(config.yearTo) : "");
  formParams.append("classis_mode[]", "");
  formParams.set("transmissions", "");
  formParams.append("auction_name[]", AUCTION_NAME_NON_USS); // "Non-USS only"
  formParams.append("condition_rates[]", "");
  formParams.append("colors[]", "");

  const urls: string[] = [];
  let limitStart = 0;
  let total = Infinity;

  while (urls.length < total && urls.length < config.max * 3) {
    const page = await fetchSearchResultsPage(formParams, limitStart);
    if (typeof page.total === "number") total = page.total;
    if (!page.cars_html) break;

    const listings = extractListingsFromCarsHtml(page.cars_html);
    if (listings.length === 0) break;

    urls.push(...listings.map((l) => l.url));
    limitStart += listings.length;

    if (listings.length < RESULTS_PAGE_SIZE) break; // last page
  }

  return [...new Set(urls)].filter(isPrestigeMotorsportDetailUrl);
}

/** Crawl Prestige Motorsport past auctions and upsert them into Convex unless persist=false. */
export async function crawlPrestigeMotorsport(config: PrestigeMotorsportCrawlConfig): Promise<CrawlResult> {
  if (!config.make && (!config.urls || config.urls.length === 0)) {
    throw new Error("Either --make (with optional --model) or --url required");
  }

  const model = process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash";
  const requireSold = config.requireSold ?? true;

  let detailUrls = (config.urls && config.urls.length > 0)
    ? config.urls.filter(isPrestigeMotorsportDetailUrl)
    : await discoverDetailUrls(config);

  detailUrls = [...new Set(detailUrls)].slice(0, config.max * (requireSold ? 3 : 1));
  console.error(`[prestige-crawl] Discovered ${detailUrls.length} candidate auction detail URLs`);
  logUrls("[prestige-crawl]   auction", detailUrls);

  if (requireSold) {
    console.error(`[prestige-crawl] Checking sold status for ${detailUrls.length} listings...`);
    detailUrls = (await filterToSoldListings(detailUrls)).slice(0, config.max);
    console.error(`[prestige-crawl] ${detailUrls.length} confirmed-SOLD listings remain`);
  } else {
    detailUrls = detailUrls.slice(0, config.max);
  }

  if (detailUrls.length === 0) {
    return { totalFound: 0, totalExtracted: 0, totalFailed: 0, records: [], outputPath: "convex" };
  }

  const target = { make: config.make, model: config.model };

  return await runCrawlPipeline({
    label: "prestige-crawl",
    urls: detailUrls,
    model,
    systemPrompt: SYSTEM_PREFIX,
    buildExtractionUser: (markdowns) => buildExtractionUser(markdowns, buildTargetInstruction(target)),
    target,
    maxCharacters: 16000,
    extractBatchSize: 1,
    extractConcurrency: 5,
    persist: config.persist,
    prepareRecord: prepareAuctionRecord,
  });
}