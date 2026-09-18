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
  normalizedMake: v.optional(v.string()),
  normalizedModel: v.optional(v.string()),
  modelFamily: v.optional(v.string()),
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
  auctionSheetImages: v.optional(v.array(v.string())),
  extractedAt: v.string(),
  updatedAt: v.string(),
  auctionNumber: v.optional(v.string()),
  auctionEndTime: v.optional(v.string()),
  lastBidAt: v.optional(v.string()),
  buildDate: v.optional(v.string()),
  registrationYear: v.optional(v.union(v.number(), v.null())),
  chassisNumber: v.optional(v.string()),
  inspectorNotes: v.optional(v.string()),
  exchangeRateUsed: v.optional(v.union(v.number(), v.null())),
  agentFeeAud: v.optional(v.union(v.number(), v.null())),
  inlandTransportAud: v.optional(v.union(v.number(), v.null())),
  exportPaperworkAud: v.optional(v.union(v.number(), v.null())),
  wharfHandlingAud: v.optional(v.union(v.number(), v.null())),
  customsBrokerageAud: v.optional(v.union(v.number(), v.null())),
  biosecurityAud: v.optional(v.union(v.number(), v.null())),
  adrEngineeringAud: v.optional(v.union(v.number(), v.null())),
  registrationFee: v.optional(v.union(v.number(), v.null())),
  tacFee: v.optional(v.union(v.number(), v.null())),
  plateFee: v.optional(v.union(v.number(), v.null())),
  japaneseOriginProof: v.optional(v.boolean()),
  modifiedVehicle: v.optional(v.boolean()),
  convertedToRhd: v.optional(v.boolean()),
  isFuelEfficient: v.optional(v.boolean()),
  purchaseAud: v.optional(v.union(v.number(), v.null())),
  importCostAud: v.optional(v.union(v.number(), v.null())),
  landedCostAud: v.optional(v.union(v.number(), v.null())),
  startingCostAud: v.optional(v.union(v.number(), v.null())),
  driveawayCostAud: v.optional(v.union(v.number(), v.null())),
  costWarnings: v.optional(v.union(v.array(v.string()), v.null())),
  complianceWarnings: v.optional(v.union(v.array(v.string()), v.null())),
  landedCostBreakdown: v.optional(v.union(v.record(v.string(), v.object({ amount: v.number(), confidence: v.string(), source: v.string() })), v.null())),
  complianceBreakdown: v.optional(v.union(v.record(v.string(), v.object({ amount: v.number(), confidence: v.string(), source: v.string() })), v.null())),
  complianceAssessment: v.optional(v.union(v.object({ requiresRwc: v.boolean(), requiresRavCheck: v.boolean(), requiresVassReview: v.boolean(), manualReviewRequired: v.boolean(), warnings: v.array(v.string()) }), v.null())),
  soldStatus: v.optional(v.union(v.literal("sold"), v.literal("unsold"), v.literal("unknown"))),
  hammerPriceRaw: v.optional(v.string()),
  auctionHouse: v.optional(v.string()),
  exteriorGrade: v.optional(v.string()),
  exteriorGradeDescription: v.optional(v.string()),
  interiorGrade: v.optional(v.string()),
  interiorGradeDescription: v.optional(v.string()),
  mileageWarning: v.optional(v.string()),
  ownershipHistory: v.optional(v.string()),
  auctionSalesPoints: v.optional(v.array(v.string())),
  damageCodes: v.optional(v.array(v.string())),
  estimatedResaleAud: v.optional(v.union(v.number(), v.null())),
  estimatedResaleLowAud: v.optional(v.union(v.number(), v.null())),
  estimatedResaleHighAud: v.optional(v.union(v.number(), v.null())),
  resaleConfidence: v.optional(v.union(v.number(), v.null())),
  resaleConfidenceLabel: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"), v.null())),
  resaleComparableCount: v.optional(v.number()),
  resaleBasis: v.optional(v.union(v.literal("asking"), v.literal("sold"), v.literal("mixed"), v.null())),
  resaleConfidenceReasons: v.optional(v.union(v.array(v.string()), v.null())),
};

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