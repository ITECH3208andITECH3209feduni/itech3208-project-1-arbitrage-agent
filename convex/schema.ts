import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const vehicleFields = {
  market: v.optional(v.union(v.literal("JP"), v.literal("AU"))),
  source: v.optional(v.string()),
  sourceType: v.optional(
    v.union(v.literal("auction"), v.literal("dealer"), v.literal("classified")),
  ),
  currency: v.optional(v.union(v.literal("JPY"), v.literal("AUD"))),
  sourceId: v.optional(v.string()),
  make: v.optional(v.string()),
  model: v.optional(v.string()),
  url: v.string(),
  title: v.string(),
  titleRaw: v.string(),
  price: v.union(v.number(), v.null()),
  priceRaw: v.string(),
  mileage: v.union(v.number(), v.null()),
  mileageRaw: v.string(),
  year: v.union(v.number(), v.null()),
  color: v.string(),
  colorRaw: v.string(),
  transmission: v.string(),
  transmissionRaw: v.string(),
  driveType: v.string(),
  driveTypeRaw: v.string(),
  engineSize: v.string(),
  fuelType: v.string(),
  fuelTypeRaw: v.string(),
  bodyType: v.string(),
  bodyTypeRaw: v.string(),
  doors: v.union(v.number(), v.null()),
  seats: v.union(v.number(), v.null()),
  dealer: v.string(),
  dealerRaw: v.string(),
  location: v.string(),
  locationRaw: v.string(),
  description: v.string(),
  descriptionRaw: v.string(),
  images: v.array(v.string()),
  extractedAt: v.string(),
  updatedAt: v.string(),
  auctionNumber: v.optional(v.string()),
  auctionEndTime: v.optional(v.string()),
  lastBidAt: v.optional(v.string()),
  buildDate: v.optional(v.string()),
  estimatedProfitAud: v.optional(v.union(v.number(), v.null())),
};

export default defineSchema({
  vehicles: defineTable(vehicleFields)
    .index("by_url", ["url"])
    .index("by_price", ["price"])
    .index("by_year", ["year"])
    .index("by_extractedAt", ["extractedAt"])
    .index("by_market", ["market"])
    .index("by_market_price", ["market", "price"])
    .index("by_market_year", ["market", "year"])
    .index("by_source_url", ["source", "url"])
    .index("by_make", ["make"])
    .index("by_model", ["model"])
    .index("by_make_model", ["make", "model"]),
});
