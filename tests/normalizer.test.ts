import { describe, it, expect } from "vitest";
import { parsePrice, parseMileage, normalizeRecord } from "../src/normalizer.js";
import type { VehicleRecord } from "../src/types.js";

// ── parsePrice ──────────────────────────────────────────────────

describe("parsePrice", () => {
  it("parses 万円 notation", () => {
    expect(parsePrice("350万円")).toBe(3_500_000);
  });

  it("parses decimal 万円", () => {
    expect(parsePrice("1.5万円")).toBe(15_000);
  });

  it("parses 万円 with commas", () => {
    expect(parsePrice("1,500万円")).toBe(15_000_000);
  });

  it("parses plain 円", () => {
    expect(parsePrice("3500000円")).toBe(3_500_000);
  });

  it("parses plain 円 with commas", () => {
    expect(parsePrice("3,500,000円")).toBe(3_500_000);
  });

  it("returns null for dash placeholder", () => {
    expect(parsePrice("−")).toBeNull();
  });

  it("returns null for 応談", () => {
    expect(parsePrice("応談")).toBeNull();
  });

  it("returns null for 未定", () => {
    expect(parsePrice("未定")).toBeNull();
  });

  it("returns null for 相談", () => {
    expect(parsePrice("価格相談")).toBeNull();
  });

  it("returns null for 値下げ中", () => {
    expect(parsePrice("値下げ中")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parsePrice("")).toBeNull();
  });

  it("handles whitespace in price", () => {
    expect(parsePrice(" 350 万円 ")).toBe(3_500_000);
  });

  it("returns null for unparseable string", () => {
    expect(parsePrice("お問合せ")).toBeNull();
  });
});

// ── parseMileage ────────────────────────────────────────────────

describe("parseMileage", () => {
  it("parses 万km notation", () => {
    expect(parseMileage("3.5万km")).toBe(35_000);
  });

  it("parses integer 万km", () => {
    expect(parseMileage("10万km")).toBe(100_000);
  });

  it("parses plain km", () => {
    expect(parseMileage("35000km")).toBe(35_000);
  });

  it("parses km with commas", () => {
    expect(parseMileage("35,000km")).toBe(35_000);
  });

  it("handles case-insensitive KM", () => {
    expect(parseMileage("5万KM")).toBe(50_000);
  });

  it("handles whitespace", () => {
    expect(parseMileage(" 3.5 万km ")).toBe(35_000);
  });

  it("returns null for empty string", () => {
    expect(parseMileage("")).toBeNull();
  });

  it("returns null for non-numeric", () => {
    expect(parseMileage("不明")).toBeNull();
  });
});

// ── normalizeRecord ─────────────────────────────────────────────

function makeRecord(overrides: Partial<VehicleRecord> = {}): VehicleRecord {
  return {
    url: "https://www.goo-net.com/example",
    title: "  トヨタ アルファード  ",
    price: null,
    priceRaw: "350万円",
    mileage: null,
    mileageRaw: "3.5万km",
    year: null,
    color: "  パールマイカ  ",
    transmission: "  CVT  ",
    driveType: "  4WD  ",
    engineSize: "  3,456cc  ",
    fuelType: "  ガソリン  ",
    bodyType: "  ワンボックス  ",
    doors: null,
    seats: null,
    dealer: "  ○○モーター  ",
    location: "  東京都  ",
    description: "  低走行車  ",
    images: [],
    extractedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("normalizeRecord", () => {
  it("parses price from priceRaw when price is null", () => {
    const result = normalizeRecord(makeRecord());
    expect(result.price).toBe(3_500_000);
  });

  it("parses mileage from mileageRaw when mileage is null", () => {
    const result = normalizeRecord(makeRecord());
    expect(result.mileage).toBe(35_000);
  });

  it("keeps pre-set price", () => {
    const result = normalizeRecord(makeRecord({ price: 999 }));
    expect(result.price).toBe(999);
  });

  it("keeps pre-set mileage", () => {
    const result = normalizeRecord(makeRecord({ mileage: 1234 }));
    expect(result.mileage).toBe(1234);
  });

  it("trims string fields", () => {
    const result = normalizeRecord(makeRecord());
    expect(result.title).toBe("トヨタ アルファード");
    expect(result.color).toBe("パールマイカ");
    expect(result.transmission).toBe("CVT");
    expect(result.dealer).toBe("○○モーター");
    expect(result.location).toBe("東京都");
    expect(result.description).toBe("低走行車");
  });

  it("defaults empty strings for missing optionals", () => {
    const record = makeRecord({
      title: undefined as any,
      color: undefined as any,
    });
    const result = normalizeRecord(record);
    expect(result.title).toBe("");
    expect(result.color).toBe("");
  });

  it("defaults null for doors/seats/year", () => {
    const result = normalizeRecord(makeRecord());
    expect(result.doors).toBeNull();
    expect(result.seats).toBeNull();
    expect(result.year).toBeNull();
  });

  it("preserves images array", () => {
    const imgs = ["https://img.example.com/1.jpg"];
    const result = normalizeRecord(makeRecord({ images: imgs }));
    expect(result.images).toEqual(imgs);
  });

  it("defaults empty images array", () => {
    const result = normalizeRecord(makeRecord({ images: undefined as any }));
    expect(result.images).toEqual([]);
  });
});
