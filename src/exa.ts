import { isGooNetListingUrl } from "./utils.js";
import { getBrandPages } from "./brands.js";

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

/**
 * Discover listing detail URLs from a single brand aggregator page
 * via Exa's subpages feature.
 */
async function discoverFromPage(pageUrl: string, apiKey: string): Promise<string[]> {
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

  const urls: string[] = [];
  for (const r of data.results ?? []) {
    if (r.url && isGooNetListingUrl(r.url)) urls.push(r.url);
    for (const sp of r.subpages ?? []) {
      if (sp.url && isGooNetListingUrl(sp.url)) urls.push(sp.url);
    }
  }
  return [...new Set(urls)];
}

/**
 * Discover listing detail URLs from known brand aggregator pages.
 * Fetches all pages in parallel, deduplicates results.
 */
async function discoverByBrand(brand: string, apiKey: string): Promise<string[]> {
  const pages = getBrandPages(brand);
  if (!pages) return [];

  const results = await Promise.all(
    pages.map((page) => discoverFromPage(page, apiKey)),
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
export async function fetchBatch(urls: string[], apiKey: string): Promise<FetchResult> {
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
      }>("/contents", { urls: chunk, text: { maxCharacters: 10000 }, extras: { imageLinks: 20 } }, apiKey);

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
): Promise<string[]> {
  if (brandUrl) {
    return discoverFromPage(brandUrl, apiKey);
  }
  if (brand) {
    return discoverByBrand(brand, apiKey);
  }
  return [];
}
