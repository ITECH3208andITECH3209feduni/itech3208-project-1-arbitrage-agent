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

/** Text-response helper: resolveModelId / fetchSearchResultsPage both JSON.parse(await res.text()). */
function jsonTextResponse(body: unknown) {
  return { ok: true, text: async () => JSON.stringify(body) };
}

/** Plain-HTML response helper for the sold-status pre-check (fetchHtml). */
function htmlResponse(html: string) {
  return { ok: true, text: async () => html };
}

/** Search-results AJAX fragment containing one `.jas-car-item`, matching the real site's markup. */
function carsHtmlFragment(entries: { url: string; priceText: string }[]): string {
  return entries
    .map(
      (e) => `
      <div class="jas-car-item">
        <div class="jas-car-item-content"><h5><a href="${e.url}">Listing</a></h5></div>
        <div class="jas-price"><h6>${e.priceText}</h6></div>
      </div>`
    )
    .join("\n");
}

function auctionRecord(url: string, overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    url,
    market: "AU",
    source: "prestigemotorsport",
    sourceType: "auction",
    currency: "AUD",
    title: "2020 Toyota Alphard SC",
    titleRaw: "2020 Toyota Alphard SC",
    price: null,
    priceRaw: "",
    hammerPriceRaw: "Sold for $34,500",
    soldStatus: "sold",
    mileage: 38210,
    mileageRaw: "38,210 km",
    year: 2020,
    color: "White",
    colorRaw: "White",
    transmission: "Automatic",
    transmissionRaw: "Automatic",
    driveType: "AWD",
    driveTypeRaw: "AWD",
    engineSize: "2.5L",
    fuelType: "Petrol",
    fuelTypeRaw: "Petrol",
    bodyType: "Van",
    bodyTypeRaw: "Van",
    doors: 5,
    seats: 7,
    dealerRaw: "",
    dealer: "",
    locationRaw: "Chiba, Japan",
    location: "Chiba, Japan",
    description: "One owner, full service history.",
    descriptionRaw: "One owner, full service history.",
    images: [],
    ...overrides,
  };
}

describe("crawlPrestigeMotorsport", () => {
  it("resolves make/model, runs the search AJAX flow, keeps sold listings, and exports AU auction records", async () => {
    const detailUrl = "https://prestigemotorsport.com.au/vehicle/toyota-alphard-98765";

    mockFetch
      // 1. search_model_car (resolve "Alphard" -> ext_id)
      .mockResolvedValueOnce(jsonTextResponse({ models: [{ ext_id: "501", name: "Alphard" }] }))
      // 2. search_results_car_dev (single page, total = 1)
      .mockResolvedValueOnce(
        jsonTextResponse({
          cars_html: carsHtmlFragment([{ url: detailUrl, priceText: "Sold for $34,500" }]),
          total: 1,
        })
      )
      // 3. sold-status pre-check fetch on the detail page
      .mockResolvedValueOnce(htmlResponse("<html><body>Result: SOLD for $34,500</body></html>"))
      // 4. runCrawlPipeline's internal Exa fetchBatch call
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ url: detailUrl, text: "Details\nSold for $34,500", title: "Alphard" }],
        }),
      });

    mockPrompt.mockResolvedValueOnce(JSON.stringify([auctionRecord("https://wrong.example", { sourceId: "" })]));
    mockExportToConvex.mockResolvedValueOnce({ upserted: 1 });

    const { crawlPrestigeMotorsport } = await import("../src/prestigemotorsportCrawler.js");
    const result = await crawlPrestigeMotorsport({ make: "Toyota", model: "Alphard", max: 1 });

    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(result.totalFound).toBe(1);
    expect(result.totalExtracted).toBe(1);
    expect(result.records[0].url).toBe(detailUrl);
    expect(result.records[0].market).toBe("AU");
    expect(result.records[0].currency).toBe("AUD");
    expect(result.records[0].source).toBe("prestigemotorsport");
    expect(result.records[0].sourceType).toBe("auction");
    expect(result.records[0].soldStatus).toBe("sold");
    expect(result.records[0].sourceId).toBe("98765");
    expect(result.records[0].price).toBe(34500);
    expect(mockExportToConvex).toHaveBeenCalledWith(result.records);
  });

  it("drops unsold/passed-in listings before they reach extraction", async () => {
    const soldUrl = "https://prestigemotorsport.com.au/vehicle/toyota-alphard-98765";
    const unsoldUrl = "https://prestigemotorsport.com.au/vehicle/toyota-alphard-98766";

    mockFetch
      // search_results_car_dev returns two candidates (no model resolution call, since model wasn't set)
      .mockResolvedValueOnce(
        jsonTextResponse({
          cars_html: carsHtmlFragment([
            { url: soldUrl, priceText: "Sold for $34,500" },
            { url: unsoldUrl, priceText: "Reserve not met" },
          ]),
          total: 2,
        })
      )
      // sold-status check: first candidate is sold
      .mockResolvedValueOnce(htmlResponse("<html><body>Result: SOLD for $34,500</body></html>"))
      // sold-status check: second candidate passed in
      .mockResolvedValueOnce(htmlResponse("<html><body>Lot passed in, reserve not met</body></html>"))
      // Exa fetchBatch call for the pipeline — only the sold URL should be requested
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ url: soldUrl, text: "Details\nSold for $34,500", title: "Alphard" }],
        }),
      });

    mockPrompt.mockResolvedValueOnce(JSON.stringify([auctionRecord(soldUrl)]));
    mockExportToConvex.mockResolvedValueOnce({ upserted: 1 });

    const { crawlPrestigeMotorsport } = await import("../src/prestigemotorsportCrawler.js");
    const result = await crawlPrestigeMotorsport({ make: "Toyota", max: 5 });

    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(result.totalFound).toBe(1);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].url).toBe(soldUrl);
    expect(result.records.some((r) => r.url === unsoldUrl)).toBe(false);
  });

  it("skips the sold-status pre-check entirely when requireSold is false", async () => {
    const urlA = "https://prestigemotorsport.com.au/vehicle/toyota-alphard-98765";
    const urlB = "https://prestigemotorsport.com.au/vehicle/toyota-alphard-98766";

    mockFetch
      .mockResolvedValueOnce(
        jsonTextResponse({
          cars_html: carsHtmlFragment([
            { url: urlA, priceText: "Sold for $34,500" },
            { url: urlB, priceText: "Reserve not met" },
          ]),
          total: 2,
        })
      )
      // Exa fetchBatch call for the pipeline — both URLs should go through untouched
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { url: urlA, text: "Details\nSold for $34,500", title: "Alphard" },
            { url: urlB, text: "Details\nReserve not met", title: "Alphard" },
          ],
        }),
      });

    mockPrompt.mockResolvedValueOnce(
      JSON.stringify([auctionRecord(urlA), auctionRecord(urlB, { soldStatus: "unsold", hammerPriceRaw: "" })])
    );
    mockExportToConvex.mockResolvedValueOnce({ upserted: 2 });

    const { crawlPrestigeMotorsport } = await import("../src/prestigemotorsportCrawler.js");
    const result = await crawlPrestigeMotorsport({ make: "Toyota", max: 5, requireSold: false });

    // Only the 2 discovery/pipeline fetches — no per-listing sold-status checks.
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.records).toHaveLength(2);
    expect(result.records.map((r) => r.soldStatus).sort()).toEqual(["sold", "unsold"]);
  });

  it("rejects unknown makes before making any network calls", async () => {
    const { crawlPrestigeMotorsport } = await import("../src/prestigemotorsportCrawler.js");

    await expect(crawlPrestigeMotorsport({ make: "NotARealBrand", max: 1 })).rejects.toThrow(/Unknown make/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("in direct --url mode, only keeps prestigemotorsport.com.au URLs and skips search discovery", async () => {
    const validUrl = "https://prestigemotorsport.com.au/vehicle/toyota-alphard-98765";
    const foreignUrl = "https://example.com/not-prestige-motorsport/98765";

    mockFetch
      // sold-status pre-check on the one valid URL
      .mockResolvedValueOnce(htmlResponse("<html><body>Result: SOLD for $34,500</body></html>"))
      // Exa fetchBatch call for the pipeline
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ url: validUrl, text: "Details\nSold for $34,500", title: "Alphard" }],
        }),
      });

    mockPrompt.mockResolvedValueOnce(JSON.stringify([auctionRecord(validUrl)]));
    mockExportToConvex.mockResolvedValueOnce({ upserted: 1 });

    const { crawlPrestigeMotorsport } = await import("../src/prestigemotorsportCrawler.js");
    const result = await crawlPrestigeMotorsport({ urls: [validUrl, foreignUrl], max: 5 });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].url).toBe(validUrl);
  });
});