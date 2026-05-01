import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// ── Mocks ───────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock the LLM module
const mockPrompt = vi.fn();
vi.mock("../src/llm.js", () => ({
  prompt: mockPrompt,
}));

let tmpDir: string;

beforeEach(() => {
  vi.clearAllMocks();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crawler-test-"));
  process.env.EXA_API_KEY = "test-exa-key";
  process.env.OPENROUTER_API_KEY = "test-or-key";
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.EXA_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
});

// ── Tests ───────────────────────────────────────────────────────

describe("crawl", () => {
  it("throws when neither brand nor brandUrl provided", async () => {
    const { crawl } = await import("../src/crawler.js");
    await expect(
      crawl({ max: 1, outDir: tmpDir })
    ).rejects.toThrow("Either --brand or --brand-url required");
  });

  it("discovers URLs, fetches, extracts, exports JSON", async () => {
    // Exa discovery response (search)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { url: "https://www.goo-net.com/car/1" },
          { url: "https://www.goo-net.com/car/2" },
        ],
      }),
    });
    // Exa batch fetch response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { url: "https://www.goo-net.com/car/1", text: "Toyota 100万円 1万km", title: "Toyota" },
          { url: "https://www.goo-net.com/car/2", text: "Honda 200万円 2万km", title: "Honda" },
        ],
      }),
    });
    // LLM extraction response
    mockPrompt.mockResolvedValueOnce(JSON.stringify([
      {
        url: "https://www.goo-net.com/car/1",
        title: "Toyota Alphard",
        priceRaw: "100万円",
        mileageRaw: "1万km",
        color: "White",
        transmission: "Automatic",
        driveType: "4WD",
        engineSize: "2.5L",
        fuelType: "Gasoline",
        bodyType: "Minivan",
        dealer: "Tokyo Motors",
        location: "東京都",
        description: "Clean car.",
      },
      {
        url: "https://www.goo-net.com/car/2",
        title: "Honda Stepwgn",
        priceRaw: "200万円",
        mileageRaw: "2万km",
        color: "Black",
        transmission: "CVT",
        driveType: "FWD",
        engineSize: "2.0L",
        fuelType: "Hybrid",
        bodyType: "Minivan",
        dealer: "Osaka Cars",
        location: "大阪府",
        description: "Well maintained.",
      },
    ]));

    const { crawl } = await import("../src/crawler.js");
    const result = await crawl({
      brand: "Toyota Alphard",
      max: 10,
      outDir: tmpDir,
    });

    expect(result.totalFound).toBe(2);
    expect(result.totalExtracted).toBe(2);
    expect(result.records[0].title).toBe("Toyota Alphard");
    expect(result.records[0].price).toBe(1_000_000);
    expect(result.records[1].title).toBe("Honda Stepwgn");
    expect(result.records[1].price).toBe(2_000_000);

    const jsonPath = path.join(tmpDir, "vehicles.json");
    expect(fs.existsSync(jsonPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    expect(parsed).toHaveLength(2);
  });

  it("handles empty discovery", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    const { crawl } = await import("../src/crawler.js");
    const result = await crawl({
      brand: "Nonexistent",
      max: 10,
      outDir: tmpDir,
    });

    expect(result.totalFound).toBe(0);
    expect(result.totalExtracted).toBe(0);
  });

  it("respects max limit on discovered URLs", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { url: "https://www.goo-net.com/car/1" },
          { url: "https://www.goo-net.com/car/2" },
          { url: "https://www.goo-net.com/car/3" },
        ],
      }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ url: "https://www.goo-net.com/car/1", text: "# Car 1\n100万円 1万km", title: "Car 1" }],
      }),
    });
    mockPrompt.mockResolvedValueOnce(JSON.stringify([
      { url: "https://www.goo-net.com/car/1", title: "Car 1", priceRaw: "100万円", mileageRaw: "1万km" },
    ]));

    const { crawl } = await import("../src/crawler.js");
    const result = await crawl({
      brand: "Test",
      max: 1,
      outDir: tmpDir,
    });

    expect(result.totalFound).toBe(1);
  });

  it("handles extraction failure gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ url: "https://www.goo-net.com/car/bad" }],
      }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ url: "https://www.goo-net.com/car/bad", text: "# Bad page", title: "Bad" }],
      }),
    });
    mockPrompt.mockResolvedValueOnce("[]");

    const { crawl } = await import("../src/crawler.js");
    const result = await crawl({
      brand: "Test",
      max: 1,
      outDir: tmpDir,
    });

    expect(result.totalExtracted).toBe(0);
  });
});