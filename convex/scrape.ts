"use node";

import { action } from "./_generated/server";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { crawlGoonet } from "../src/goonetCrawler";
import { crawlAutotrader } from "../src/autotraderCrawler";
import { refreshListing } from "../src/refreshListing.js";
import { canonicalizeUrl } from "../src/utils.js";
import type { VehicleRecord } from "../src/types";
import { normalizeYear } from "../src/year";
import { getJpyAudRate } from "../src/exchangeRate.js";
import { orchestrateEstimates, prepareRefreshRecord, withoutConvexFields } from "../src/estimationOrchestration.js";

const upsertMany = makeFunctionReference<
  "mutation",
  { secret: string; vehicles: VehicleRecord[] },
  { upserted: number; updatedAt: string }
>("vehicles:upsertMany");

const getByUrl = makeFunctionReference<
  "query",
  { url: string },
  (VehicleRecord & { updatedAt: string }) | null
>("vehicles:getByUrl");

const getComparables = makeFunctionReference<
  "query",
  { make: string; model: string; limit?: number },
  VehicleRecord[]
>("vehicles:getComparables");

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

function vehicleChanged(record: VehicleRecord, existing: VehicleRecord | null): boolean {
  if (!existing) return true;
  for (const [key, value] of Object.entries(record)) {
    if (key === "extractedAt") continue;
    if (JSON.stringify(value) !== JSON.stringify(existing[key as keyof VehicleRecord])) return true;
  }
  return false;
}

export const refreshVehicle = action({
  args: { url: v.string() },
  handler: async (ctx, args) => {
    const result = await refreshListing(args.url);
    if (!result.record) {
      throw new Error(`Vehicle refresh failed for ${result.url}: ${result.error ?? "unknown error"}`);
    }

    const url = canonicalizeUrl(args.url.trim());
    const existing = await ctx.runQuery(getByUrl, { url });
    const record = {
      ...result.record,
      url,
      make: result.record.make?.trim() || existing?.make?.trim() || undefined,
      model: result.record.model?.trim() || existing?.model?.trim() || undefined,
    };

    if (!record.make || !record.model) {
      throw new Error(`Vehicle refresh missing make/model for ${url}; no usable stored fallback exists`);
    }

    const rate = await getJpyAudRate({ storage: memoryStorage() });
    const comparables = await ctx.runQuery(getComparables, { make: record.make, model: record.model, limit: 50 });
    const prepared = prepareRefreshRecord(
      { ...record, market: record.market ?? existing?.market ?? "JP", currency: record.currency ?? existing?.currency ?? "JPY", source: record.source ?? existing?.source ?? "goo-net", sourceType: record.sourceType ?? existing?.sourceType ?? "dealer" },
      existing,
      comparables,
      rate.rate,
    );

    const secret = process.env.CONVEX_INGEST_SECRET;
    if (!secret) throw new Error("CONVEX_INGEST_SECRET required");

    const upsert = await ctx.runMutation(upsertMany, { secret, vehicles: [prepared] });
    return {
      success: true,
      changed: vehicleChanged(prepared, existing),
      url,
      updatedAt: upsert.updatedAt,
      extractedAt: prepared.extractedAt,
      resaleConfidenceLabel: prepared.resaleConfidenceLabel ?? null,
      resaleComparableCount: prepared.resaleComparableCount ?? 0,
    };
  },
});

/** Recalculate a stored listing using current comparables and FX, without scraping it. */
export const recomputeVehicle = action({
  args: { url: v.string() },
  handler: async (ctx, args) => {
    const url = canonicalizeUrl(args.url.trim());
    const existing = await ctx.runQuery(getByUrl, { url });
    if (!existing) throw new Error(`Vehicle not found for ${url}`);
    if (!existing.make?.trim() || !existing.model?.trim()) throw new Error(`Stored vehicle missing make/model for ${url}`);

    const rate = await getJpyAudRate({ storage: memoryStorage() });
    const comparables = await ctx.runQuery(getComparables, { make: existing.make, model: existing.model, limit: 50 });
    const prepared = prepareRefreshRecord(withoutConvexFields(existing), null, comparables, rate.rate);
    const secret = process.env.CONVEX_INGEST_SECRET;
    if (!secret) throw new Error("CONVEX_INGEST_SECRET required");
    const upsert = await ctx.runMutation(upsertMany, { secret, vehicles: [prepared] });
    return {
      success: true,
      url,
      updatedAt: upsert.updatedAt,
      resale: prepared.estimatedResaleAud ?? null,
      confidence: prepared.resaleConfidenceLabel ?? null,
      count: prepared.resaleComparableCount ?? 0,
    };
  },
});

export const vehicles = action({
  args: {
    source: v.union(v.literal("goonet"), v.literal("autotrader")),
    brand: v.optional(v.string()),
    model: v.optional(v.string()),
    brandUrl: v.optional(v.string()),
    query: v.optional(v.string()),
    urls: v.optional(v.array(v.string())),
    year: v.optional(v.number()),
    max: v.number(),
  },
  handler: async (ctx, args) => {
    const missing = ["EXA_API_KEY", "OPENROUTER_API_KEY", "CONVEX_INGEST_SECRET"].filter(
      (name) => !process.env[name],
    );
    if (missing.length > 0) {
      throw new Error(
        `Missing Convex environment variable${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}. Set with: npx convex env set ${missing[0]} <value>`,
      );
    }

    const max = Math.max(1, Math.min(100, Math.floor(args.max || 5)));
    const brand = args.brand?.trim()
      ? args.source === "goonet"
        ? args.brand.trim().toUpperCase()
        : args.brand.trim()
      : undefined;
    const model = args.model?.trim() || undefined;
    const year = normalizeYear(args.year);
    const result = args.source === "autotrader"
      ? await crawlAutotrader({
          query: args.query,
          brand,
          model,
          urls: args.urls,
          year,
          max,
          persist: false,
        })
      : await crawlGoonet({
          brand,
          model,
          brandUrl: args.brandUrl,
          year,
          max,
          persist: false,
        });

    const records = result.records.map((record) => ({
      ...record,
      market: record.market ?? (args.source === "goonet" ? "JP" : "AU"),
      currency: record.currency ?? (args.source === "goonet" ? "JPY" : "AUD"),
      source: record.source ?? (args.source === "goonet" ? "goo-net" : "autotrader"),
      sourceType: record.sourceType ?? "dealer",
      make: record.make?.trim() || brand,
      model: record.model?.trim() || model,
    }));

    const missingMakeModel = records.find((record) => !record.make?.trim() || !record.model?.trim());
    if (missingMakeModel) {
      throw new Error(`Scraper returned vehicle without make/model: ${missingMakeModel.url}`);
    }

    const secret = process.env.CONVEX_INGEST_SECRET;
    if (!secret) throw new Error("CONVEX_INGEST_SECRET required");

    const jpRecords = records.filter((record) => record.market === "JP");
    const groups = new Map<string, Promise<VehicleRecord[]>>();
    for (const record of jpRecords) {
      const groupKey = `${record.make!.trim().toLowerCase()}\u0000${record.model!.trim().toLowerCase()}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, ctx.runQuery(getComparables, { make: record.make!, model: record.model!, limit: 50 }));
      }
    }
    const rate = jpRecords.length > 0 ? await getJpyAudRate({ storage: memoryStorage() }) : null;
    const comparableMap = new Map<string, readonly VehicleRecord[]>();
    for (const [groupKey, promise] of groups) comparableMap.set(groupKey, await promise);
    const enrichedRecords = orchestrateEstimates(records, comparableMap, rate?.rate ?? 0);

    const upsert = await ctx.runMutation(upsertMany, {
      secret,
      vehicles: enrichedRecords,
    });

    return {
      ...result,
      upserted: upsert.upserted,
      records: enrichedRecords.map((record) => ({
        url: record.url,
        title: record.title,
        make: record.make,
        model: record.model,
        price: record.price,
        source: record.source ?? args.source,
      })),
    };
  },
});
