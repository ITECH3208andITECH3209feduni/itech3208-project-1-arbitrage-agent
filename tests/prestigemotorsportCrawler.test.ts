import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const mockPrompt = vi.fn();
vi.mock("../src/llm.js", () => ({
  prompt: mockPrompt,
}));

const mockExportToConvex = vi.fn();
vi.mock("../src/convexExporter.js", () => ({
  exportToConvex: mockExportToConvex,
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.EXA_API_KEY = "test-exa-key";
  process.env.OPENROUTER_API_KEY = "test-or-key";
});

afterEach(() => {
  delete process.env.EXA_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
});

function auRecord(url: string, overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    url,
    market: "AU",
    source: "autotrader",
    sourceType: "dealer",
    currency: "AUD",
    title: "2021 Lexus RX350 Luxury",
    titleRaw: "2021 Lexus RX350 Luxury",
    price: 54990,
    priceRaw: "$54,990",
    mileage: 41882,
    mileageRaw: "41,882 km",
    year: 2021,
    color: "White",
    colorRaw: "White",
    transmission: "Automatic",
    transmissionRaw: "Automatic",
    driveType: "AWD",
    driveTypeRaw: "AWD",
    engineSize: "3.5L",
    fuelType: "Petrol",
    fuelTypeRaw: "Petrol",
    bodyType: "SUV",
    bodyTypeRaw: "SUV",
    doors: 4,
    seats: 5,
    dealerRaw: "Dealer",
    dealer: "Dealer",
    locationRaw: "Sydney, NSW",
    location: "Sydney, NSW",
    description: "Clean local car.",
    descriptionRaw: "Clean local car.",
    images: [],
    ...overrides,
  };
}

describe("crawlAutotrader", () => {
  it("expands Autotrader for-sale pages to current detail URLs and exports AU records", async () => {
    const detailUrl = "https://www.autotrader.com.au/car/15010116/lexus/rx350/nsw/minchinbury/suv";

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<html><body><a href="/car/15010116/lexus/rx350/nsw/minchinbury/suv">Lexus RX</a></body></html>`,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ url: detailUrl, text: "Details\n41,882 km\n$54,990", title: "Lexus RX" }],
        }),
      });

    mockPrompt.mockResolvedValueOnce(JSON.stringify([auRecord("https://wrong.example", { sourceType: "private" })]));
    mockExportToConvex.mockResolvedValueOnce({ upserted: 1 });

    const { crawlAutotrader } = await import("../src/autotraderCrawler.js");
    const result = await crawlAutotrader({ brand: "lexus", max: 1 });

    expect(result.totalFound).toBe(1);
    expect(result.totalExtracted).toBe(1);
    expect(result.records[0].url).toBe(detailUrl);
    expect(result.records[0].market).toBe("AU");
    expect(result.records[0].currency).toBe("AUD");
    expect(result.records[0].source).toBe("autotrader");
    expect(result.records[0].sourceType).toBe("dealer");
    expect(result.records[0].sourceId).toBe("15010116");
    expect(mockExportToConvex).toHaveBeenCalledWith(result.records);
  });

  it("expands exact grade and model-family Autotrader pages", async () => {
    const exactUrl = "https://www.autotrader.com.au/car/14999586/lexus/ls500h/nsw/petersham/sedan";
    const familyUrl = "https://www.autotrader.com.au/car/14993154/lexus/ls460/sa/edwardstown/sedan";

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<a href="/car/14999586/lexus/ls500h/nsw/petersham/sedan">LS500h</a>`,
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<a href="/car/14993154/lexus/ls460/sa/edwardstown/sedan">LS460</a>`,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [exactUrl, familyUrl].map((url) => ({ url, text: "Details\n$49,990", title: "Lexus LS" })),
        }),
      });

    mockPrompt.mockResolvedValueOnce(JSON.stringify([auRecord(exactUrl, { model: "LS500H", year: 2023 })]));
    mockPrompt.mockResolvedValueOnce(JSON.stringify([auRecord(familyUrl, { model: "LS460", year: 2023 })]));
    mockExportToConvex.mockResolvedValueOnce({ upserted: 2 });

    const { crawlAutotrader } = await import("../src/autotraderCrawler.js");
    const result = await crawlAutotrader({ brand: "lexus", model: "ls500h", year: 2023, max: 20 });

    expect(mockFetch.mock.calls[0][0]).toBe("https://www.autotrader.com.au/for-sale/lexus/ls500h/year-2023");
    expect(mockFetch.mock.calls[1][0]).toBe("https://www.autotrader.com.au/for-sale/lexus/ls/year-2023");
    expect(result.totalFound).toBe(2);
    expect(result.totalExtracted).toBe(2);
  });

  it("maps multi-word brand queries to Autotrader brand/model URLs", async () => {
    const detailUrl = "https://www.autotrader.com.au/car/15011041/mercedes-benz/c200/nsw/petersham/sedan";

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<a href="/car/15011041/mercedes-benz/c200/nsw/petersham/sedan">C200</a>`,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ url: detailUrl, text: "Details\n$49,990", title: "Mercedes C200" }],
        }),
      });

    mockPrompt.mockResolvedValueOnce(JSON.stringify([auRecord(detailUrl, { title: "Mercedes-Benz C200", titleRaw: "Mercedes-Benz C200" })]));
    mockExportToConvex.mockResolvedValueOnce({ upserted: 1 });

    const { crawlAutotrader } = await import("../src/autotraderCrawler.js");
    await crawlAutotrader({ query: "Mercedes Benz C Class", max: 1 });

    expect(mockFetch.mock.calls[0][0]).toBe("https://www.autotrader.com.au/for-sale/mercedes-benz/c-class");
  });
});
