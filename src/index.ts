/**
 * goo-net-crawler — Crawl Goo-net used car listings with structured extraction
 *
 * Set `EXA_API_KEY` and `OPENROUTER_API_KEY` in env or `.env` file.
 * Optionally set `OPENROUTER_MODEL` (default: `deepseek/deepseek-v4-flash`).
 * @module goo-net-crawler
 */

import "dotenv/config";

export { crawlGoonet, crawl } from "./goonetCrawler.js";
export { crawlAutotrader } from "./autotraderCrawler.js";
export { crawlPrestigeMotorsport } from "./prestigemotorsportCrawler.js";
export { prompt, promptStreaming } from "./llm.js";
export { discover, fetchBatch } from "./exa.js";
export { exportToConvex } from "./convexExporter.js";
export { estimateProfitAud, estimateResaleAud, applyEstimatedProfitAud } from "./profitEstimator.js";
export { calculateLandedCost, calculateDriveawayCost, validateLandedCostInput, convertPurchasePriceToAud, getCustomsDutyRate } from "./landedCost/landedCost.js";
export type { LandedCostInput, LandedCostResult, DriveawayInput, DriveawayResult } from "./landedCost/types.js";
export { calculateComplianceModule, validateComplianceInput, assessRequirements, estimateAuctionSheetRisk } from "./compliance/compliance.js";
export type { ComplianceInput, AuctionSheetInput, ComplianceResult, ComplianceAssessment, LineItem, Confidence } from "./compliance/types.js";
export type { ProfitEstimatorOptions, ResaleEstimate } from "./profitEstimator.js";
export { BRAND_PAGES, GOO_NET_BRANDS, GOO_NET_BRAND_PAGES, AUTOTRADER_BRAND_SLUGS, getBrandPages, getGooNetBrandPage, getAutotraderBrandPage, getAutotraderPageFromQuery } from "./brands.js";
export {
  translateAuctionSheet,
  translateExteriorGrade,
  translateInteriorGrade,
  translateOwnershipHistory,
  extractSalesPoints,
  translateBodyDamageCode,
  translateOtherCode,
  convertImperialYear,
  parseAuctionMileage,
} from "./auctionSheet.js";
export type { RawAuctionSheet, TranslatedAuctionSheet, MileageFlag } from "./auctionSheet.js";
export type { CrawlConfig, CrawlResult, VehicleRecord } from "./types.js";
export type { AutotraderCrawlConfig } from "./autotraderCrawler.js";
export type { PrestigeMotorsportCrawlConfig, PrestigeAuctionDate } from "./prestigemotorsportCrawler.js";