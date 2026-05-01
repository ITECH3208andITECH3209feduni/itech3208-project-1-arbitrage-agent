import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { exportJSON } from "../src/exporter.js";
import type { VehicleRecord } from "../src/types.js";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "export-test-"));
}

function makeRecord(overrides: Partial<VehicleRecord> = {}): VehicleRecord {
  return {
    url: "https://www.goo-net.com/example",
    title: "Toyota Alphard 3.5 SC Package",
    titleRaw: "トヨタ アルファード 3.5 SC Package",
    price: 3_500_000,
    priceRaw: "350万円",
    mileage: 35_000,
    mileageRaw: "3.5万km",
    year: 2020,
    color: "Pearl Mica",
    colorRaw: "パールマイカ",
    transmission: "CVT",
    transmissionRaw: "CVT",
    driveType: "4WD/AWD",
    driveTypeRaw: "4WD",
    engineSize: "3,456cc",
    fuelType: "Gasoline",
    fuelTypeRaw: "ガソリン",
    bodyType: "Minivan",
    bodyTypeRaw: "ワンボックス",
    doors: 5,
    seats: 7,
    dealerRaw: "○○モーター",
    dealer: "○○Motors",
    locationRaw: "東京都",
    location: "Tokyo",
    description: "Low mileage. One owner.",
    descriptionRaw: "低走行車。ワンオーナー。",
    images: ["https://img.example.com/1.jpg"],
    extractedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

let dir: string;

beforeEach(() => {
  dir = tmpDir();
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("exportJSON", () => {
  it("writes valid JSON array", () => {
    const filePath = path.join(dir, "out.json");
    const records = [makeRecord()];
    exportJSON(records, filePath);
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].url).toBe(records[0].url);
  });

  it("pretty-prints with indentation", () => {
    const filePath = path.join(dir, "out.json");
    exportJSON([makeRecord()], filePath);
    const raw = fs.readFileSync(filePath, "utf-8");
    expect(raw).toContain("\n  ");
  });

  it("writes empty array", () => {
    const filePath = path.join(dir, "out.json");
    exportJSON([], filePath);
    expect(JSON.parse(fs.readFileSync(filePath, "utf-8"))).toEqual([]);
  });

  it("writes to caller-created directory", () => {
    const subDir = path.join(dir, "sub");
    fs.mkdirSync(subDir, { recursive: true });
    const filePath = path.join(subDir, "out.json");
    exportJSON([makeRecord()], filePath);
    expect(fs.existsSync(filePath)).toBe(true);
  });
});
