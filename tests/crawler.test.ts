import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

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

// ── Helpers ─────────────────────────────────────────────────────

/** Number of brand pages in BRAND_PAGES["TOYOTA"]. */
const TOYOTA_PAGES = 2;

function stubDiscover(urls: string[], pageCount: number = TOYOTA_PAGES) {
  const subpages = urls.map((u) => ({ url: u }));
  for (let i = 0; i < pageCount; i++) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ url: `https://goo-net.com/brand/${i}`, subpages } as any],
      }),
    });
  }
}

function stubFetch(urls: string[]) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      results: urls.map((u) => ({
        url: u,
        text: `# Car\n100万円 1万km`,
        title: "Car",
      })),
    }),
  });
}

function record(url: string, overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    url,
    title: "Toyota Alphard",
    titleRaw: "トヨタ アルファード",
    priceRaw: "100万円",
    mileageRaw: "1万km",
    color: "White",
    colorRaw: "ホワイト",
    transmission: "Automatic",
    transmissionRaw: "AT",
    driveType: "4WD/AWD",
    driveTypeRaw: "4WD",
    engineSize: "2.5L",
    fuelType: "Gasoline",
    fuelTypeRaw: "ガソリン",
    bodyType: "Minivan",
    bodyTypeRaw: "ミニバン",
    dealerRaw: "東京モータース",
    dealer: "Tokyo Motors",
    locationRaw: "東京都",
    location: "Tokyo",
    description: "Clean car.",
    descriptionRaw: "キレイな車。",
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe("crawl", () => {
  it("throws when neither brand nor brandUrl provided", async () => {
    const { crawl } = await import("../src/crawler.js");
    await expect(
      crawl({ max: 1, outDir: tmpDir }),
    ).rejects.toThrow("Either --brand or --brand-url required");
  });

  it("discovers via brand pages, fetches, extracts, exports JSON", async () => {
    const urls = [
      "https://www.goo-net.com/usedcar/spread/goo/13/1.html",
      "https://www.goo-net.com/usedcar/spread/goo/13/2.html",
    ];

    stubDiscover(urls);
    stubFetch(urls);
    mockPrompt.mockResolvedValueOnce(JSON.stringify([record(urls[0]), record(urls[1])]));

    const { crawl } = await import("../src/crawler.js");
    const result = await crawl({ brand: "TOYOTA", max: 10, outDir: tmpDir });

    expect(result.totalFound).toBe(2);
    expect(result.totalExtracted).toBe(2);
    expect(result.records[0].price).toBe(1_000_000);

    const file = path.join(tmpDir, "vehicles.json");
    expect(fs.existsSync(file)).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, "utf-8"))).toHaveLength(2);
  });

  it("parallelizes LLM calls across batches", async () => {
    const urls = Array.from(
      { length: 15 },
      (_, i) => `https://www.goo-net.com/usedcar/spread/goo/13/${i}.html`,
    );

    stubDiscover(urls);
    stubFetch(urls);
    // 15 pages → 2 LLM batches (10 + 5)
    mockPrompt.mockResolvedValueOnce(JSON.stringify(urls.slice(0, 10).map((u) => record(u))));
    mockPrompt.mockResolvedValueOnce(JSON.stringify(urls.slice(10).map((u) => record(u))));

    const { crawl } = await import("../src/crawler.js");
    const result = await crawl({ brand: "TOYOTA", max: 20, outDir: tmpDir });

    expect(result.totalFound).toBe(15);
    expect(result.totalExtracted).toBe(15);
    expect(mockPrompt).toHaveBeenCalledTimes(2);
  });

  it("returns zero for unknown brand", async () => {
    const { crawl } = await import("../src/crawler.js");
    const result = await crawl({ brand: "UNKNOWN_XYZ", max: 10, outDir: tmpDir });

    expect(result.totalFound).toBe(0);
    expect(result.totalExtracted).toBe(0);
  });

  it("respects max limit", async () => {
    const all = Array.from(
      { length: 10 },
      (_, i) => `https://www.goo-net.com/usedcar/spread/goo/13/${i}.html`,
    );

    stubDiscover(all);
    // max=3 → only 3 fetched
    stubFetch(all.slice(0, 3));
    mockPrompt.mockResolvedValueOnce(JSON.stringify(all.slice(0, 3).map((u) => record(u))));

    const { crawl } = await import("../src/crawler.js");
    const result = await crawl({ brand: "TOYOTA", max: 3, outDir: tmpDir });

    expect(result.totalFound).toBe(3);
    expect(result.totalExtracted).toBe(3);
  });

  it("handles extraction failure gracefully", async () => {
    const urls = ["https://www.goo-net.com/usedcar/spread/goo/13/bad.html"];

    stubDiscover(urls);
    stubFetch(urls);
    mockPrompt.mockResolvedValueOnce("[]");

    const { crawl } = await import("../src/crawler.js");
    const result = await crawl({ brand: "TOYOTA", max: 1, outDir: tmpDir });

    expect(result.totalExtracted).toBe(0);
  });

  it("uses brandUrl directly (single page, no brand lookup)", async () => {
    const custom = "https://www.goo-net.com/usedcar/brand-TOYOTA/certified/";
    const urls = ["https://www.goo-net.com/usedcar/spread/goo/13/one.html"];

    // Single discover call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ url: custom, subpages: urls.map((u) => ({ url: u })) } as any],
      }),
    });
    stubFetch(urls);
    mockPrompt.mockResolvedValueOnce(JSON.stringify([record(urls[0])]));

    const { crawl } = await import("../src/crawler.js");
    const result = await crawl({ brandUrl: custom, max: 5, outDir: tmpDir });

    expect(result.totalExtracted).toBe(1);
  });
});
