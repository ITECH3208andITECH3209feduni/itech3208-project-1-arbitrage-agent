"use node";

import { action } from "./_generated/server";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { crawlGoonet } from "../src/goonetCrawler";
import { crawlAutotrader } from "../src/autotraderCrawler";
import type { VehicleRecord } from "../src/types";
import { normalizeYear } from "../src/year";

const upsertMany = makeFunctionReference<
  "mutation",
  { secret: string; vehicles: VehicleRecord[] },
  { upserted: number }
>("vehicles:upsertMany");

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
      make: record.make?.trim() || brand,
      model: record.model?.trim() || model,
    }));

    const missingMakeModel = records.find((record) => !record.make?.trim() || !record.model?.trim());
    if (missingMakeModel) {
      throw new Error(`Scraper returned vehicle without make/model: ${missingMakeModel.url}`);
    }

    const secret = process.env.CONVEX_INGEST_SECRET;
    if (!secret) throw new Error("CONVEX_INGEST_SECRET required");

    const upsert = await ctx.runMutation(upsertMany, {
      secret,
      vehicles: records,
    });

    return {
      ...result,
      upserted: upsert.upserted,
      records: records.map((record) => ({
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
