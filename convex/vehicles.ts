import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { canonicalizeUrl } from "../src/utils.js";
import { modelFamilyKey, normalizeMake, normalizeModel } from "../src/modelFamily.js";

const vehicleFields = {
  market: v.optional(v.union(v.literal("JP"), v.literal("AU"))),
  source: v.optional(v.string()),
  sourceType: v.optional(v.union(v.literal("auction"), v.literal("dealer"), v.literal("classified"))),
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
  extractedAt: v.string(),
  auctionNumber: v.optional(v.string()),
  auctionEndTime: v.optional(v.string()),
  lastBidAt: v.optional(v.string()),
  buildDate: v.optional(v.string()),
  estimatedProfitAud: v.optional(v.union(v.number(), v.null())),
  purchaseAud: v.optional(v.union(v.number(), v.null())),
  importCostAud: v.optional(v.union(v.number(), v.null())),
  soldStatus: v.optional(v.union(v.literal("sold"), v.literal("unsold"), v.literal("unknown"))),
  hammerPriceRaw: v.optional(v.string()),
  auctionHouse: v.optional(v.string()),
  estimatedResaleAud: v.optional(v.union(v.number(), v.null())),
  estimatedResaleLowAud: v.optional(v.union(v.number(), v.null())),
  estimatedResaleHighAud: v.optional(v.union(v.number(), v.null())),
  resaleConfidence: v.optional(v.union(v.number(), v.null())),
  resaleConfidenceLabel: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"), v.null())),
  resaleComparableCount: v.optional(v.number()),
  resaleBasis: v.optional(v.union(v.literal("asking"), v.literal("sold"), v.literal("mixed"), v.null())),
  resaleConfidenceReasons: v.optional(v.union(v.array(v.string()), v.null())),
};

const FACETS_PAGE_SIZE = 500;

type VehicleListRow = {
  _id: string;
  _creationTime: number;
  make?: string | null;
  model?: string | null;
  source?: string | null;
};

function dedupeVehiclesById<T extends { _id: string }>(rows: T[]): T[] {
  return [...new Map(rows.map((vehicle) => [vehicle._id, vehicle])).values()];
}

function normalizeSource(source?: string | null) {
  return (source ?? "goo-net").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function sourceAliases(source?: string) {
  const normalized = normalizeSource(source);
  if (normalized === "goonet") return ["goo-net", "goonet"];
  if (normalized === "autotrader") return ["autotrader"];
  return source ? [source] : [];
}

function applyIntersectionFilters(
  rows: VehicleListRow[],
  makes: string[],
  models: string[],
  source?: string,
): VehicleListRow[] {
  const normalizedSource = source ? normalizeSource(source) : undefined;
  return rows
    .filter((vehicle) => makes.length === 0 || (vehicle.make && makes.includes(vehicle.make)))
    .filter((vehicle) => models.length === 0 || (vehicle.model && models.includes(vehicle.model)))
    .filter((vehicle) => !normalizedSource || normalizeSource(vehicle.source) === normalizedSource);
}
export const upsertMany = mutation({
  args: {
    secret: v.string(),
    vehicles: v.array(v.object(vehicleFields)),
  },
  handler: async (ctx, args) => {
    if (!process.env.CONVEX_INGEST_SECRET || args.secret !== process.env.CONVEX_INGEST_SECRET) {
      throw new Error("Unauthorized");
    }

    const updatedAt = new Date().toISOString();

    for (const vehicle of args.vehicles) {
      if (!vehicle.make?.trim() || !vehicle.model?.trim()) {
        throw new Error(`Vehicle make/model required for ${vehicle.url}`);
      }

      const canonicalUrl = canonicalizeUrl(vehicle.url);
      const normalizedVehicle = {
        market: vehicle.market ?? "JP",
        source: vehicle.source ?? "goo-net",
        sourceType: vehicle.sourceType ?? "dealer",
        currency: vehicle.currency ?? "JPY",
        ...vehicle,
        normalizedMake: normalizeMake(vehicle.make),
        normalizedModel: normalizeModel(vehicle.model),
        modelFamily: modelFamilyKey(vehicle.model),
        url: canonicalUrl,
        updatedAt,
      } as const;

      const existing = await ctx.db
        .query("vehicles")
        .withIndex("by_url", (q) => q.eq("url", normalizedVehicle.url))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, normalizedVehicle);
      } else {
        await ctx.db.insert("vehicles", normalizedVehicle);
      }
    }

    return { upserted: args.vehicles.length, updatedAt };
  },
});

export const list = query({
  args: {
    limit: v.optional(v.number()),
    makes: v.optional(v.array(v.string())),
    models: v.optional(v.array(v.string())),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const makesArg = args.makes;
    const modelsArg = args.models;
    const makes = (makesArg ?? []).filter(Boolean);
    const models = (modelsArg ?? []).filter(Boolean);

    if ((makesArg && makes.length === 0) || (modelsArg && models.length === 0)) {
      return [];
    }

    if (makes.length === 0 && models.length === 0) {
      const rows = args.source
        ? (
            await Promise.all(
              sourceAliases(args.source).map((source) =>
                ctx.db
                  .query("vehicles")
                  .withIndex("by_source_url", (q) => q.eq("source", source))
                  .take(limit),
              ),
            )
          ).flat()
        : await ctx.db.query("vehicles").order("desc").take(limit);
      return dedupeVehiclesById(rows).sort((a, b) => b._creationTime - a._creationTime).slice(0, limit);
    }

    const rows: VehicleListRow[] =
      makes.length > 0 && models.length > 0
        ? ((await Promise.all(
            makes.flatMap((make) =>
              models.map((model) =>
                ctx.db
                  .query("vehicles")
                  .withIndex("by_make_model", (q) => q.eq("make", make).eq("model", model))
                  .take(limit),
              ),
            ),
          )) as VehicleListRow[][]).flat()
        : makes.length > 0
          ? ((await Promise.all(
              makes.map((make) =>
                ctx.db.query("vehicles").withIndex("by_make", (q) => q.eq("make", make)).take(limit),
              ),
            )) as VehicleListRow[][]).flat()
          : ((await Promise.all(
              models.map((model) =>
                ctx.db.query("vehicles").withIndex("by_model", (q) => q.eq("model", model)).take(limit),
              ),
            )) as VehicleListRow[][]).flat();

    const deduped = dedupeVehiclesById(rows);
    const filtered = applyIntersectionFilters(deduped, makes, models, args.source);

    return filtered
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, limit);
  },
});

export const facets = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? FACETS_PAGE_SIZE;

    const page = await ctx.db
      .query("vehicles")
      .order("desc")
      .paginate({ numItems: limit, cursor: args.cursor ?? null });

    const makesSet = new Set<string>();
    const modelsByMake = new Map<string, Set<string>>();

    for (const vehicle of page.page) {
      if (!vehicle.make) continue;
      makesSet.add(vehicle.make);

      if (!modelsByMake.has(vehicle.make)) {
        modelsByMake.set(vehicle.make, new Set());
      }

      if (vehicle.model) {
        modelsByMake.get(vehicle.make)!.add(vehicle.model);
      }
    }

    const makes = [...makesSet].sort();
    const modelsByMakeObject: Record<string, string[]> = {};
    for (const make of makes) {
      modelsByMakeObject[make] = [...(modelsByMake.get(make) ?? new Set())].sort();
    }

    return {
      makes,
      modelsByMake: modelsByMakeObject,
      cursor: page.continueCursor ?? null,
      isDone: page.isDone,
    };
  },
});

export const getByUrl = query({
  args: { url: v.string() },
  handler: async (ctx, args) => {
    const canonicalUrl = canonicalizeUrl(args.url);
    return await ctx.db
      .query("vehicles")
      .withIndex("by_url", (q) => q.eq("url", canonicalUrl))
      .unique();
  },
});

/** Current Australian asking/sold records used as resale comparables. */
export const getComparables = query({
  args: { make: v.string(), model: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(2, Math.min(100, Math.floor(args.limit ?? 50)));
    const make = args.make.trim();
    const model = args.model.trim();
    const normalizedMake = normalizeMake(make);
    const normalizedModel = normalizeModel(model);
    const family = modelFamilyKey(model);
    const familyRows = await ctx.db
      .query("vehicles")
      .withIndex("by_normalized_make_family_market", (q) =>
        q.eq("normalizedMake", normalizedMake).eq("modelFamily", family).eq("market", "AU"),
      )
      .take(limit);
    const makeRows = await ctx.db
      .query("vehicles")
      .withIndex("by_normalized_make_market", (q) =>
        q.eq("normalizedMake", normalizedMake).eq("market", "AU"),
      )
      .take(500);
    const normalizedRows = await ctx.db
      .query("vehicles")
      .withIndex("by_normalized_make_model_market", (q) =>
        q.eq("normalizedMake", normalizedMake).eq("normalizedModel", normalizedModel).eq("market", "AU"),
      )
      .take(limit);
    const legacyVariants = [
      [make, model],
      [make.toLocaleUpperCase(), model.toLocaleUpperCase()],
      [make[0]?.toLocaleUpperCase() + make.slice(1).toLocaleLowerCase(), model[0]?.toLocaleUpperCase() + model.slice(1).toLocaleLowerCase()],
    ];
    const legacyRows = (await Promise.all(legacyVariants.map(([legacyMake, legacyModel]) =>
      ctx.db
        .query("vehicles")
        .withIndex("by_make_model", (q) => q.eq("make", legacyMake).eq("model", legacyModel))
        .take(limit),
    ))).flat();
    const rows = [...new Map([...familyRows, ...normalizedRows, ...makeRows, ...legacyRows].map((row) => [row._id, row])).values()];
    return rows
      .filter((row) =>
        row.model && modelFamilyKey(row.model) === family &&
        row.market === "AU" &&
        row.currency === "AUD" &&
        row.price != null &&
        row.price > 0 &&
        row.soldStatus !== "unsold"
      )
      .slice(0, limit);
  },
});
