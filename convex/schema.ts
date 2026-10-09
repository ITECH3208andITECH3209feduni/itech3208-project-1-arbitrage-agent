import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { vehicleFields } from "./vehicleFields";


export default defineSchema({
  vehicles: defineTable(vehicleFields)
    .index("by_url", ["url"])
    .index("by_price", ["price"])
    .index("by_year", ["year"])
    .index("by_extractedAt", ["extractedAt"])
    .index("by_updatedAt", ["updatedAt"])
    .index("by_market", ["market"])
    .index("by_market_price", ["market", "price"])
    .index("by_market_year", ["market", "year"])
    .index("by_source_url", ["source", "url"])
    .index("by_make", ["make"])
    .index("by_model", ["model"])
    .index("by_make_model", ["make", "model"])
    .index("by_normalized_make_market", ["normalizedMake", "market"])
    .index("by_normalized_make_model_market", ["normalizedMake", "normalizedModel", "market"])
    .index("by_normalized_make_family_market", ["normalizedMake", "modelFamily", "market"]),
  analystSales: defineTable({
    fingerprint: v.string(),
    batchId: v.string(),
    make: v.string(),
    model: v.string(),
    normalizedMake: v.string(),
    normalizedModel: v.string(),
    modelFamily: v.string(),
    price: v.number(),
    year: v.union(v.number(), v.null()),
    mileage: v.union(v.number(), v.null()),
    soldStatus: v.union(v.literal("sold"), v.literal("unknown")),
    source: v.string(),
    provenance: v.literal("analyst"),
    saleDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    importedAt: v.string(),
  })
    .index("by_fingerprint", ["fingerprint"])
    .index("by_normalized_make_family", ["normalizedMake", "modelFamily"])
    .index("by_batch", ["batchId"]),
});