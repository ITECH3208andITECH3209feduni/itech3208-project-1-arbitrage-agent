import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { VehicleRecord } from "../src/types.js";

const mutation = vi.fn();
const ConvexHttpClient = vi.fn(() => ({ mutation }));

vi.mock("convex/browser", () => ({ ConvexHttpClient }));
vi.mock("../convex/_generated/api.js", () => ({ api: { vehicles: { upsertMany: "vehicles:upsertMany" } } }));

function record(): VehicleRecord {
  return {
    url: "https://www.goo-net.com/example",
    title: "Toyota Alphard",
    titleRaw: "トヨタ アルファード",
    price: 3_500_000,
    priceRaw: "350万円",
    mileage: 35_000,
    mileageRaw: "3.5万km",
    year: 2020,
    color: "White",
    colorRaw: "ホワイト",
    transmission: "CVT",
    transmissionRaw: "CVT",
    driveType: "4WD/AWD",
    driveTypeRaw: "4WD",
    engineSize: "2.5L",
    fuelType: "Gasoline",
    fuelTypeRaw: "ガソリン",
    bodyType: "Minivan",
    bodyTypeRaw: "ミニバン",
    doors: 5,
    seats: 7,
    dealerRaw: "東京モータース",
    dealer: "Tokyo Motors",
    locationRaw: "東京都",
    location: "Tokyo",
    description: "Clean car.",
    descriptionRaw: "キレイな車。",
    images: [],
    extractedAt: "2024-01-01T00:00:00Z",
  };
}

beforeEach(() => {
  mutation.mockReset();
  ConvexHttpClient.mockClear();
  process.env.CONVEX_URL = "https://example.convex.cloud";
  process.env.CONVEX_INGEST_SECRET = "secret";
});

afterEach(() => {
  delete process.env.CONVEX_URL;
  delete process.env.CONVEX_INGEST_SECRET;
});

describe("exportToConvex", () => {
  it("upserts records through Convex mutation", async () => {
    mutation.mockResolvedValueOnce({ upserted: 1 });
    const { exportToConvex } = await import("../src/convexExporter.js");

    const result = await exportToConvex([record()]);

    expect(ConvexHttpClient).toHaveBeenCalledWith("https://example.convex.cloud");
    expect(mutation).toHaveBeenCalledWith("vehicles:upsertMany", {
      secret: "secret",
      vehicles: [record()],
    });
    expect(result).toEqual({ upserted: 1 });
  });

  it("no-ops empty batches without env", async () => {
    delete process.env.CONVEX_URL;
    delete process.env.CONVEX_INGEST_SECRET;
    const { exportToConvex } = await import("../src/convexExporter.js");

    await expect(exportToConvex([])).resolves.toEqual({ upserted: 0 });
    expect(mutation).not.toHaveBeenCalled();
  });
});
