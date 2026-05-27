import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import type { VehicleRecord } from "./types.js";

/** Upsert extracted vehicle records into Convex. No-op for empty batches. */
export async function exportToConvex(records: VehicleRecord[]): Promise<{ upserted: number }> {
  if (records.length === 0) return { upserted: 0 };

  const convexUrl = process.env.CONVEX_URL;
  const secret = process.env.CONVEX_INGEST_SECRET;
  if (!convexUrl) throw new Error("CONVEX_URL required for Convex export");
  if (!secret) throw new Error("CONVEX_INGEST_SECRET required for Convex export");

  const client = new ConvexHttpClient(convexUrl);
  return await client.mutation(api.vehicles.upsertMany, {
    secret,
    vehicles: records,
  });
}
