import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { modelFamilyKey, normalizeMake, normalizeModel } from "../src/modelFamily.js";

const saleInput = v.object({
  make: v.string(),
  model: v.string(),
  price: v.number(),
  year: v.union(v.number(), v.null()),
  mileage: v.union(v.number(), v.null()),
  soldStatus: v.union(v.literal("sold"), v.literal("unknown")),
  saleDate: v.optional(v.string()),
  notes: v.optional(v.string()),
  source: v.optional(v.string()),
});

function fingerprint(make: string, model: string, price: number, year: number | null, mileage: number | null): string {
  return [normalizeMake(make), normalizeModel(model), price, year ?? "", mileage ?? ""].join("\u0000");
}

function toComparable(row: {
  _id: string;
  make: string;
  model: string;
  price: number;
  year: number | null;
  mileage: number | null;
  soldStatus: "sold" | "unknown";
  importedAt: string;
  saleDate?: string;
}) {
  return {
    url: `analyst://${row._id}`,
    title: `${row.make} ${row.model}`,
    titleRaw: `${row.make} ${row.model}`,
    price: row.price,
    priceRaw: String(row.price),
    mileage: row.mileage,
    mileageRaw: row.mileage == null ? "" : `${row.mileage} km`,
    year: row.year,
    make: row.make,
    model: row.model,
    transmission: "",
    transmissionRaw: "",
    driveType: "",
    driveTypeRaw: "",
    fuelType: "",
    fuelTypeRaw: "",
    bodyType: "",
    bodyTypeRaw: "",
    color: "",
    colorRaw: "",
    engineSize: "",
    doors: null,
    seats: null,
    dealer: "Analyst data",
    dealerRaw: "Analyst data",
    location: "Australia",
    locationRaw: "Australia",
    description: row.saleDate ? `Analyst sale recorded ${row.saleDate}` : "Analyst-owned sale data",
    descriptionRaw: "Analyst-owned sale data",
    images: [],
    extractedAt: row.importedAt,
    market: "AU" as const,
    currency: "AUD" as const,
    source: "analyst",
    sourceType: "classified" as const,
    soldStatus: row.soldStatus,
  };
}

export const importBatch = mutation({
  args: {
    batchId: v.string(),
    sales: v.array(saleInput),
  },
  handler: async (ctx, args) => {
    const importedAt = new Date().toISOString();
    let imported = 0;
    let skipped = 0;

    for (const sale of args.sales) {
      const make = sale.make.trim();
      const model = sale.model.trim();
      if (!make || !model || !Number.isFinite(sale.price) || sale.price <= 0) {
        skipped++;
        continue;
      }

      const normalizedMake = normalizeMake(make);
      const normalizedModel = normalizeModel(model);
      const fingerprintValue = fingerprint(make, model, sale.price, sale.year, sale.mileage);
      const existing = await ctx.db
        .query("analystSales")
        .withIndex("by_fingerprint", (q) => q.eq("fingerprint", fingerprintValue))
        .unique();

      if (existing) {
        skipped++;
        continue;
      }

      await ctx.db.insert("analystSales", {
        fingerprint: fingerprintValue,
        batchId: args.batchId,
        make,
        model,
        normalizedMake,
        normalizedModel,
        modelFamily: modelFamilyKey(model),
        price: sale.price,
        year: sale.year,
        mileage: sale.mileage,
        soldStatus: sale.soldStatus,
        source: sale.source?.trim() || "analyst-import",
        provenance: "analyst",
        saleDate: sale.saleDate?.trim() || undefined,
        notes: sale.notes?.trim() || undefined,
        importedAt,
      });
      imported++;
    }

    return { imported, skipped, importedAt };
  },
});

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(1000, Math.floor(args.limit ?? 500)));
    return (await ctx.db.query("analystSales").order("desc").take(limit)).map(toComparable);
  },
});

export const getComparables = query({
  args: { make: v.string(), model: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(2, Math.min(100, Math.floor(args.limit ?? 50)));
    const family = modelFamilyKey(args.model);
    const rows = await ctx.db
      .query("analystSales")
      .withIndex("by_normalized_make_family", (q) =>
        q.eq("normalizedMake", normalizeMake(args.make)).eq("modelFamily", family),
      )
      .take(limit);
    return rows.map(toComparable);
  },
});
