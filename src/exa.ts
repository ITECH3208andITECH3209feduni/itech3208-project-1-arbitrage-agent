import { isValidGooNetUrl } from "./utils.js";

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

/** Discover detail URLs from a brand listing page via Exa subpages. */
async function discoverBySubpages(brandUrl: string, apiKey: string): Promise<string[]> {
  const data = await exaPost<{
    results?: Array<{ url?: string; subpages?: Array<{ url?: string }> }>;
  }>(
    "/contents",
    {
      urls: [brandUrl],
      subpages: true,
      subpageTarget: ["car/*"],
      text: { maxCharacters: 5000 },
    },
    apiKey,
  );

  const urls: string[] = [];
  for (const r of data.results ?? []) {
    if (r.url && isValidGooNetUrl(r.url)) urls.push(r.url);
    for (const sp of r.subpages ?? []) {
      if (sp.url && isValidGooNetUrl(sp.url)) urls.push(sp.url);
    }
  }
  return [...new Set(urls)];
}

/** Discover detail URLs via Exa search API. */
export async function discoverBySearch(brand: string, apiKey: string): Promise<string[]> {
  const data = await exaPost<{ results?: Array<{ url?: string }> }>(
    "/search",
    {
      query: `${brand} goo-net 中古車`,
      numResults: 100,
      includeDomains: ["goo-net.com"],
      type: "auto",
    },
    apiKey,
  );
  return (data.results ?? [])
    .map((r) => r.url)
    .filter((u): u is string => !!u && isValidGooNetUrl(u));
}

// ── Fetch ──────────────────────────────────────────────────

export interface FetchResult {
  markdown: string;
  results: Record<string, string>;
  errors: Record<string, string>;
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
        results?: Array<{ url?: string; text?: string; title?: string }>;
      }>("/contents", { urls: chunk, text: { maxCharacters: 10000 } }, apiKey);

      for (const r of data.results ?? []) {
        if (r.url) results[r.url] = `# ${r.title ?? r.url}\n\n${r.text ?? ""}`;
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
 * Discover URLs for a brand: tries URL-based discovery first, falls back to search.
 */
export async function discover(
  brand: string | undefined,
  brandUrl: string | undefined,
  apiKey: string,
): Promise<string[]> {
  if (brandUrl) {
    return discoverBySubpages(brandUrl, apiKey);
  }
  if (brand) {
    return discoverBySearch(brand, apiKey);
  }
  return [];
}