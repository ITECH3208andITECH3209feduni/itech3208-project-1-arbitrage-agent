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
    const { crawl } = await import("../src/goonetCrawler.js");
    await expect(crawl({ max: 1 })).rejects.toThrow("Either --brand or --brand-url required");
  });

  it("discovers via brand pages, fetches, extracts, exports to Convex", async () => {
    const urls = [
      "https://www.goo-net.com/usedcar/spread/goo/13/1.html",
      "https://www.goo-net.com/usedcar/spread/goo/13/2.html",
    ];

    stubDiscover(urls);
    stubFetch(urls);
    mockPrompt.mockResolvedValueOnce(JSON.stringify([record(urls[0]), record(urls[1])]));
    mockExportToConvex.mockResolvedValueOnce({ upserted: 2 });

    const { crawl } = await import("../src/goonetCrawler.js");
    const result = await crawl({ brand: "TOYOTA", max: 10 });

    expect(result.totalFound).toBe(2);
    expect(result.totalExtracted).toBe(2);
    expect(result.records[0].price).toBe(1_000_000);
    expect(result.outputPath).toBe("convex");
    expect(mockExportToConvex).toHaveBeenCalledWith(result.records);
  });

  it("parallelizes LLM calls across batches", async () => {
    const urls = Array.from(
      { length: 15 },
      (_, i) => `https://www.goo-net.com/usedcar/spread/goo/13/${i}.html`,
    );

    stubDiscover(urls);
    stubFetch(urls);
    mockPrompt.mockResolvedValueOnce(JSON.stringify(urls.slice(0, 10).map((u) => record(u))));
    mockPrompt.mockResolvedValueOnce(JSON.stringify(urls.slice(10).map((u) => record(u))));
    mockExportToConvex.mockResolvedValueOnce({ upserted: 15 });

    const { crawl } = await import("../src/goonetCrawler.js");
    const result = await crawl({ brand: "TOYOTA", max: 20 });

    expect(result.totalFound).toBe(15);
    expect(result.totalExtracted).toBe(15);
    expect(mockPrompt).toHaveBeenCalledTimes(2);
    expect(mockExportToConvex).toHaveBeenCalledOnce();
  });

  it("discovers model pages with Goo-net brand/car URL schema", async () => {
    const urls = ["https://www.goo-net.com/usedcar/spread/goo/13/camry.html"];

    stubDiscover(urls, 1);
    stubFetch(urls);
    mockPrompt.mockResolvedValueOnce(JSON.stringify([record(urls[0])]));
    mockExportToConvex.mockResolvedValueOnce({ upserted: 1 });

    const { crawl } = await import("../src/goonetCrawler.js");
    await crawl({ brand: "Toyota", model: "Camry", max: 5 });

    expect(mockFetch.mock.calls[0][1].body).toContain(
      "https://www.goo-net.com/usedcar/brand-TOYOTA/car-CAMRY/",
    );
  });

  it("posts Goo-net year filters through summary.php", async () => {
    const urls = ["https://www.goo-net.com/usedcar/spread/goo/13/camry-2023.html"];

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Buffer.from(`
          <form name="form1" method="post">
            <input type="hidden" name="maker_cd" value="1010">
            <input type="hidden" name="car_cd" value="10101015">
            <input type="hidden" name="baitai" value="goo">
            <input type="hidden" name="nen1" value="">
            <input type="hidden" name="nen2" value="">
            <input type="hidden" name="search_flg" value="">
            <input type="hidden" name="offset" value="0">
            <input type="hidden" name="page" value="1">
            <input type="hidden" name="disp_mode" value="detail_list">
          </form>
        `),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Buffer.from(`<a href="${urls[0]}">Camry</a>`),
      });
    stubFetch(urls);
    mockPrompt.mockResolvedValueOnce(JSON.stringify([record(urls[0], { title: "Toyota Camry", make: "Toyota", model: "Camry", year: 2023 })]));
    mockExportToConvex.mockResolvedValueOnce({ upserted: 1 });

    const { crawl } = await import("../src/goonetCrawler.js");
    const result = await crawl({ brand: "Toyota", model: "Camry", year: 2023, max: 5 });

    expect(mockFetch.mock.calls[1][0]).toBe("https://www.goo-net.com/php/search/summary.php");
    expect(mockFetch.mock.calls[1][1].body).toContain("nen1=2023");
    expect(mockFetch.mock.calls[1][1].body).toContain("nen2=2023");
    expect(result.totalExtracted).toBe(1);
  });

  it("falls back to Goo-net model family when exact grade page has no listings", async () => {
    const urls = ["https://www.goo-net.com/usedcar/spread/goo/13/ls.html"];

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [{ url: "https://goo-net.com/ls", subpages: urls.map((u) => ({ url: u })) }] }) });
    stubFetch(urls);
    mockPrompt.mockResolvedValueOnce(JSON.stringify([record(urls[0], { make: "Lexus", model: "LS" })]));
    mockExportToConvex.mockResolvedValueOnce({ upserted: 1 });

    const { crawl } = await import("../src/goonetCrawler.js");
    const result = await crawl({ brand: "lexus", model: "ls500h", max: 5 });

    expect(mockFetch.mock.calls[0][1].body).toContain(
      "https://www.goo-net.com/usedcar/brand-LEXUS/car-LS500H/",
    );
    expect(mockFetch.mock.calls[2][1].body).toContain(
      "https://www.goo-net.com/usedcar/brand-LEXUS/car-LS/",
    );
    expect(result.totalFound).toBe(1);
  });

  it("returns zero for unknown brand", async () => {
    const { crawl } = await import("../src/goonetCrawler.js");
    const result = await crawl({ brand: "UNKNOWN_XYZ", max: 10 });

    expect(result.totalFound).toBe(0);
    expect(result.totalExtracted).toBe(0);
    expect(result.outputPath).toBe("convex");
    expect(mockExportToConvex).not.toHaveBeenCalled();
  });

  it("respects max limit", async () => {
    const all = Array.from(
      { length: 10 },
      (_, i) => `https://www.goo-net.com/usedcar/spread/goo/13/${i}.html`,
    );

    stubDiscover(all);
    stubFetch(all.slice(0, 3));
    mockPrompt.mockResolvedValueOnce(JSON.stringify(all.slice(0, 3).map((u) => record(u))));
    mockExportToConvex.mockResolvedValueOnce({ upserted: 3 });

    const { crawl } = await import("../src/goonetCrawler.js");
    const result = await crawl({ brand: "TOYOTA", max: 3 });

    expect(result.totalFound).toBe(3);
    expect(result.totalExtracted).toBe(3);
  });

  it("handles extraction failure gracefully", async () => {
    const urls = ["https://www.goo-net.com/usedcar/spread/goo/13/bad.html"];

    stubDiscover(urls);
    stubFetch(urls);
    mockPrompt.mockResolvedValueOnce("[]");
    mockExportToConvex.mockResolvedValueOnce({ upserted: 0 });

    const { crawl } = await import("../src/goonetCrawler.js");
    const result = await crawl({ brand: "TOYOTA", max: 1 });

    expect(result.totalExtracted).toBe(0);
    expect(mockExportToConvex).toHaveBeenCalledWith([]);
  });

  it("uses brandUrl directly (single page, no brand lookup)", async () => {
    const custom = "https://www.goo-net.com/usedcar/brand-TOYOTA/certified/";
    const urls = ["https://www.goo-net.com/usedcar/spread/goo/13/one.html"];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ url: custom, subpages: urls.map((u) => ({ url: u })) } as any],
      }),
    });
    stubFetch(urls);
    mockPrompt.mockResolvedValueOnce(JSON.stringify([record(urls[0])]));
    mockExportToConvex.mockResolvedValueOnce({ upserted: 1 });

    const { crawl } = await import("../src/goonetCrawler.js");
    const result = await crawl({ brandUrl: custom, max: 5 });

    expect(result.totalExtracted).toBe(1);
  });
});
