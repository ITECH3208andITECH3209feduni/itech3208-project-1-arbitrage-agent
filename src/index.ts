/**
 * goo-net-crawler — Crawl Goo-net used car listings with LLM extraction
 *
 * Set `EXA_API_KEY` and `OPENROUTER_API_KEY` in env or `.env` file.
 * Optionally set `OPENROUTER_MODEL` (default: `deepseek/deepseek-v4-flash`).
 * @module goo-net-crawler
 */

import "dotenv/config";

export { crawl } from "./crawler.js";
export { prompt, promptStreaming } from "./llm.js";
export { discover, fetchBatch } from "./exa.js";
export { BRAND_PAGES, getBrandPages } from "./brands.js";
export type { CrawlConfig, CrawlResult, VehicleRecord } from "./types.js";