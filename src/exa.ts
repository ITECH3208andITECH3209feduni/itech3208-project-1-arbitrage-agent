import * as cheerio from "cheerio";
import { isGooNetListingUrl } from "./utils.js";
import { getAutotraderPageFromQuery, getBrandPages, getModelSearchCandidates } from "./brands.js";

const EXA_BASE = "https://api.exa.ai";
const MAX_RETRIES = 3;
const BATCH_CHUNK = 50;

function exaHeaders(apiKey: string) {
  return {
    "x-api-key": apiKey,
    "Content-Type": "application/json",
  };
}

async function exaPost<T = unknown>(
  path: string,
  body: Record<string, unknown>,
  apiKey: string,
): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(`${EXA_BASE}${path}`, {
      method: "POST",
      headers: exaHeaders(apiKey),
      body: JSON.stringify(body),
    });
    if (res.ok) return (await res.json()) as T;
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    const errText = await res.text();
    throw new Error(`Exa API ${res.status}: ${errText}`);
  }
  throw new Error("Exa API: max retries exceeded");
}

// ── Discovery ──────────────────────────────────────────────

export async function searchAustralianListings(query: string, _apiKey: string, _max: number, year?: number): Promise<string[]> {
  const page = getAutotraderPageFromQuery(query, year);
  if (!page) return [];

  // Autotrader result pages are fetchable by Exa and include listing cards.
  // Carsales detail pages are Datadome-protected and Exa /contents returns no page body.
  return [page];
}

/**
 * Discover listing detail URLs from a single brand aggregator page
 * via Exa's subpages feature.
 */
function normalizeDiscoveredUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

async function fetchGooNetHtml(pageUrl: string): Promise<string | null> {
  const res = await fetch(pageUrl, {
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) return null;

  return new TextDecoder("shift_jis").decode(await res.arrayBuffer());
}

function getHrefUrls(html: string, pageUrl: string): string[] {
  const $ = cheerio.load(html);
  return $("a[href]")
    .map((_, element) => $(element).attr("href"))
    .get()
    .filter((href): href is string => Boolean(href))
    .map((href) => normalizeDiscoveredUrl(new URL(href, pageUrl).toString()));
}

function parseGooNetListingUrls(html: string, pageUrl: string): string[] {
  return getHrefUrls(html, pageUrl).filter(isGooNetListingUrl);
}

function parseGooNetPaginationUrls(html: string, pageUrl: string): string[] {
  return getHrefUrls(html, pageUrl).filter((url) => {
    try {
      const path = new URL(url).pathname;
      return /\/usedcar\/brand-[A-Z0-9_-]+\/(?:car-[A-Z0-9_-]+\/)?(?:list\/|certified\/|sort-[^/]+\/)?index-\d+\.html$/.test(path);
    } catch {
      return false;
    }
  });
}

async function fetchGooNetListingUrlsFromPage(pageUrl: string): Promise<string[]> {
  const urls: string[] = [];
  const firstHtml = await fetchGooNetHtml(pageUrl);
  if (!firstHtml) return [];

  urls.push(...parseGooNetListingUrls(firstHtml, pageUrl));

  const pageUrls = parseGooNetPaginationUrls(firstHtml, pageUrl).slice(0, 4);
  const pages = await Promise.all(pageUrls.map(async (url) => ({ url, html: await fetchGooNetHtml(url) })));
  for (const page of pages) {
    if (page.html) urls.push(...parseGooNetListingUrls(page.html, page.url));
  }

  return [...new Set(urls)];
}

async function fetchGooNetYearFilteredListingUrls(pageUrl: string, year: number): Promise<string[]> {
  const pageHtml = await fetchGooNetHtml(pageUrl);
  if (!pageHtml) return [];

  const $ = cheerio.load(pageHtml);
  const params = new URLSearchParams();
  $("input[name]").each((_, element) => {
    const name = $(element).attr("name");
    if (!name) return;
    params.set(name, $(element).attr("value") ?? "");
  });
  params.set("nen1", String(year));
  params.set("nen2", String(year));
  params.set("search_flg", "1");
  params.set("offset", "0");
  params.set("page", "1");
  params.set("disp_mode", params.get("disp_mode") || "detail_list");

  const res = await fetch("https://www.goo-net.com/php/search/summary.php", {
    method: "POST",
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      accept: "text/html,application/xhtml+xml",
      "content-type": "application/x-www-form-urlencoded",
      referer: pageUrl,
    },
    body: params.toString(),
  });
  if (!res.ok) return [];

  const html = new TextDecoder("shift_jis").decode(await res.arrayBuffer());
  return parseGooNetListingUrls(html, "https://www.goo-net.com/php/search/summary.php");
}

async function discoverFromPage(pageUrl: string, apiKey: string, year?: number): Promise<string[]> {
  if (year) {
    const yearFilteredUrls = await fetchGooNetYearFilteredListingUrls(pageUrl, year);
    if (yearFilteredUrls.length > 0) return yearFilteredUrls;
  }

  const urls: string[] = [];

  try {
    const data = await exaPost<{
      results?: Array<{
        url?: string;
        subpages?: Array<{ url?: string; text?: string; title?: string }>;
      }>;
    }>(
      "/contents",
      {
        urls: [pageUrl],
        subpages: 50,
        subpageTarget: ["usedcar", "spread", "goo"],
        text: { maxCharacters: 5000 },
      },
      apiKey,
    );

    for (const r of data.results ?? []) {
      if (r.url && isGooNetListingUrl(r.url)) urls.push(normalizeDiscoveredUrl(r.url));
      for (const sp of r.subpages ?? []) {
        if (sp.url && isGooNetListingUrl(sp.url)) urls.push(normalizeDiscoveredUrl(sp.url));
      }
    }
  } catch {
    // Fall back to direct HTML parsing below.
  }

  if (urls.length === 0) {
    urls.push(...await fetchGooNetListingUrlsFromPage(pageUrl));
  }

  return [...new Set(urls)];
}

/**
 * Discover listing detail URLs from known brand aggregator pages.
 * Fetches all pages in parallel, deduplicates results.
 */
async function discoverByBrand(brand: string, model: string | undefined, apiKey: string, year?: number): Promise<string[]> {
  const modelCandidates = getModelSearchCandidates(model);
  if (modelCandidates.length > 0) {
    for (const candidate of modelCandidates) {
      const pages = getBrandPages(brand, candidate);
      if (!pages) continue;
      const results = await Promise.all(pages.map((page) => discoverFromPage(page, apiKey, year)));
      const urls = [...new Set(results.flat())];
      if (urls.length > 0) return urls;
    }
  }

  const pages = getBrandPages(brand);
  if (!pages) return [];

  const results = await Promise.all(
    pages.map((page) => discoverFromPage(page, apiKey, year)),
  );
  return [...new Set(results.flat())];
}

// ── Fetch ──────────────────────────────────────────────────

export interface FetchResult {
  /** Combined markdown string for all fetched pages. */
  markdown: string;
  /** Per-URL markdown contents, keyed by URL. */
  results: Record<string, string>;
  /** Per-URL error messages. */
  errors: Record<string, string>;
  /** Number of successfully fetched pages. */
  fetched: number;
}

/**
 * Batch-fetch multiple URLs via Exa /contents.
 * Chunks into batches of 50. Returns combined markdown and per-URL results.
 */
export async function fetchBatch(urls: string[], apiKey: string, maxCharacters: number = 10000): Promise<FetchResult> {
  const results: Record<string, string> = {};
  const errors: Record<string, string> = {};

  for (let i = 0; i < urls.length; i += BATCH_CHUNK) {
    const chunk = urls.slice(i, i + BATCH_CHUNK);
    try {
      const data = await exaPost<{
        results?: Array<{
          url?: string;
          text?: string;
          title?: string;
          extras?: { imageLinks?: string[] };
        }>;
      }>("/contents", { urls: chunk, text: { maxCharacters }, extras: { imageLinks: 20 } }, apiKey);

      for (const r of data.results ?? []) {
        if (r.url) {
          const imageMd = (r.extras?.imageLinks || [])
            .map((img) => `![image](${img})`)
            .join("\n");
          results[r.url] = `# ${r.title ?? r.url}\n\n${imageMd}\n\n${r.text ?? ""}`;
        }
      }
      for (const u of chunk) {
        if (!(u in results)) errors[u] = "not returned by Exa";
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      for (const u of chunk) errors[u] = msg;
    }
  }

  const mdBlocks: string[] = [];
  for (const [url, md] of Object.entries(results)) {
    mdBlocks.push(`<!-- PAGE: ${url} -->\n${md}`);
  }
  const markdown = mdBlocks.join("\n\n---\n\n");

  return { markdown, results, errors, fetched: Object.keys(results).length };
}

/**
 * Discover listing URLs.
 *
 * Priority:
 * 1. brandUrl — use Exa subpages from a single page
 * 2. brand — look up known brand pages, discover from all
 * 3. neither — return empty
 */
export async function discover(
  brand: string | undefined,
  brandUrl: string | undefined,
  apiKey: string,
  model?: string,
  year?: number,
): Promise<string[]> {
  if (brandUrl) {
    return discoverFromPage(brandUrl, apiKey, year);
  }
  if (brand) {
    return discoverByBrand(brand, model, apiKey, year);
  }
  return [];
}
