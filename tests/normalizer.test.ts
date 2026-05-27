import { describe, it, expect } from "vitest";
import { parsePrice, normalizeRecord } from "../src/normalizer.js";
import { parseMileageToKm } from "../src/mileage.js";
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

describe("parseMileageToKm", () => {
  it("parses 万km notation", () => {
    expect(parseMileageToKm("3.5万km")).toBe(35_000);
  });

  it("parses plain km", () => {
    expect(parseMileageToKm("35,000km")).toBe(35_000);
  });

  it("parses miles", () => {
    expect(parseMileageToKm("10mi")).toBe(16);
  });

  it("handles whitespace", () => {
    expect(parseMileageToKm(" 3.5 万km ")).toBe(35_000);
  });

  it("returns null for empty or non-numeric", () => {
    expect(parseMileageToKm("")).toBeNull();
    expect(parseMileageToKm("不明")).toBeNull();
  });
});

// ── normalizeRecord ─────────────────────────────────────────────

function makeRecord(overrides: Partial<VehicleRecord> = {}): VehicleRecord {
  return {
    url: "https://www.goo-net.com/example",
    title: "  Toyota Alphard 3.5 SC Package  ",
    titleRaw: "  トヨタ アルファード 3.5 SC Package  ",
    price: null,
    priceRaw: "350万円",
    mileage: null,
    mileageRaw: "3.5万km",
    year: null,
    color: "  Pearl Mica  ",
    colorRaw: "  パールマイカ  ",
    transmission: "  CVT  ",
    transmissionRaw: "  CVT  ",
    driveType: "  4WD/AWD  ",
    driveTypeRaw: "  4WD  ",
    engineSize: "  3,456cc  ",
    fuelType: "  Gasoline  ",
    fuelTypeRaw: "  ガソリン  ",
    bodyType: "  Minivan  ",
    bodyTypeRaw: "  ワンボックス  ",
    doors: null,
    seats: null,
    dealerRaw: "  ○○モーター  ",
    dealer: "  ○○Motors  ",
    locationRaw: "  東京都  ",
    location: "  Tokyo  ",
    description: "  Low mileage. One owner.  ",
    descriptionRaw: "  低走行車。ワンオーナー。  ",
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
    expect(result.title).toBe("Toyota Alphard 3.5 SC Package");
    expect(result.titleRaw).toBe("トヨタ アルファード 3.5 SC Package");
    expect(result.color).toBe("Pearl Mica");
    expect(result.colorRaw).toBe("パールマイカ");
    expect(result.transmission).toBe("CVT");
    expect(result.transmissionRaw).toBe("CVT");
    expect(result.driveType).toBe("4WD/AWD");
    expect(result.driveTypeRaw).toBe("4WD");
    expect(result.fuelType).toBe("Gasoline");
    expect(result.fuelTypeRaw).toBe("ガソリン");
    expect(result.bodyType).toBe("Minivan");
    expect(result.bodyTypeRaw).toBe("ワンボックス");
    expect(result.dealerRaw).toBe("○○モーター");
    expect(result.dealer).toBe("○○Motors");
    expect(result.locationRaw).toBe("東京都");
    expect(result.location).toBe("Tokyo");
    expect(result.description).toBe("Low mileage. One owner.");
    expect(result.descriptionRaw).toBe("低走行車。ワンオーナー。");
  });

  it("defaults empty strings for missing optionals", () => {
    const record = makeRecord({
      title: undefined as any,
      titleRaw: undefined as any,
      color: undefined as any,
      colorRaw: undefined as any,
    });
    const result = normalizeRecord(record);
    expect(result.title).toBe("");
    expect(result.titleRaw).toBe("");
    expect(result.color).toBe("");
    expect(result.colorRaw).toBe("");
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

  it("normalizes stored make, model, and title case without changing URL", () => {
    const url = "https://www.goo-net.com/usedcar/brand-TOYOTA/car-CAMRY/";
    const result = normalizeRecord(makeRecord({
      url,
      make: "TOYOTA",
      model: "CAMRY hybrid",
      title: "toyota camry hybrid rx350",
    }));

    expect(result.url).toBe(url);
    expect(result.make).toBe("Toyota");
    expect(result.model).toBe("Camry Hybrid");
    expect(result.title).toBe("Toyota Camry Hybrid RX350");
  });

  it("defaults empty images array", () => {
    const result = normalizeRecord(makeRecord({ images: undefined as any }));
    expect(result.images).toEqual([]);
  });
});
