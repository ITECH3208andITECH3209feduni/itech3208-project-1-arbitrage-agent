// tests/refreshListing.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { refreshListing } from "../src/refreshListing.js";

// ── refreshListing ──────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const mockPrompt = vi.hoisted(() => vi.fn());
vi.mock("../src/llm.js", () => ({ prompt: mockPrompt }));

const VALID_URL =
  "https://www.goo-net.com/usedcar/spread/goo/10/700030247130260401001.html";

function stubExa(url: string, text = "# Car\n350万円 3.5万km") {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ results: [{ url, text, title: "Car" }] }),
  });
}

function stubLlm(url: string, overrides: Record<string, unknown> = {}) {
  mockPrompt.mockResolvedValueOnce(
    JSON.stringify([
      {
        url,
        title: "Toyota 86 GT Limited",
        titleRaw: "トヨタ ８６ ＧＴリミテッド",
        priceRaw: "350万円",
        mileageRaw: "3.5万km",
        color: "Azurite Blue",
        colorRaw: "アズライトブルー",
        transmission: "6-Speed Automatic",
        transmissionRaw: "６速ＡＴ",
        driveType: "RWD",
        driveTypeRaw: "ＦＲ",
        engineSize: "2000cc",
        fuelType: "Gasoline",
        fuelTypeRaw: "ガソリン",
        bodyType: "Coupe",
        bodyTypeRaw: "クーペ",
        dealerRaw: "（株）四輪館 新川店",
        dealer: "Yonrinkan Shinkawa",
        locationRaw: "北海道",
        location: "Hokkaido",
        description: "Cold weather spec, rear camera.",
        descriptionRaw: "寒冷地仕様、バックカメラ。",
        year: 2019,
        doors: 2,
        seats: 4,
        images: ["https://img.example.com/1.jpg"],
        ...overrides,
      },
    ]),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.EXA_API_KEY = "test-exa-key";
  process.env.OPENROUTER_API_KEY = "test-or-key";
});

afterEach(() => {
  delete process.env.EXA_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
});

describe("refreshListing", () => {
  it("returns a normalized record for a valid URL", async () => {
    stubExa(VALID_URL);
    stubLlm(VALID_URL);

    const result = await refreshListing(VALID_URL);

    expect(result.record).not.toBeNull();
    expect(result.url).toBe(VALID_URL);
    expect(result.record?.price).toBe(3_500_000);
    expect(result.record?.mileage).toBe(35_000);
    expect(result.record?.title).toBe("Toyota 86 GT Limited");
  });

  it("rejects a non-listing Goo-net URL", async () => {
    const result = await refreshListing(
      "https://www.goo-net.com/usedcar/brand-TOYOTA/",
    );

    expect(result.record).toBeNull();
    expect(result.error).toMatch(/not a valid goo-net listing url/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects a Goo-net listing-shaped URL without a numeric listing id", async () => {
    const result = await refreshListing(
      "https://www.goo-net.com/usedcar/spread/goo/10/not-a-listing.html",
    );

    expect(result.record).toBeNull();
    expect(result.error).toMatch(/not a valid goo-net listing url/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects a numeric ID (no longer accepted)", async () => {
    const result = await refreshListing("700030247130260401001");

    expect(result.record).toBeNull();
    expect(result.error).toMatch(/not a valid goo-net listing url/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns an error when EXA_API_KEY is missing", async () => {
    delete process.env.EXA_API_KEY;

    const result = await refreshListing(VALID_URL);

    expect(result.record).toBeNull();
    expect(result.error).toMatch(/EXA_API_KEY/i);
  });

  it("returns an error when Exa fails to fetch the page", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Server Error",
    });
    // Retry x3 then give up
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Server Error",
    });
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Server Error",
    });

    const result = await refreshListing(VALID_URL);

    expect(result.record).toBeNull();
    expect(result.error).toMatch(/fetch failed/i);
  });

  it("returns an error when the LLM returns no parseable record", async () => {
    stubExa(VALID_URL);
    mockPrompt.mockResolvedValueOnce("[]");

    const result = await refreshListing(VALID_URL);

    expect(result.record).toBeNull();
    expect(result.error).toMatch(/no parseable record/i);
  });

  it("sets extractedAt to a current ISO timestamp", async () => {
    stubExa(VALID_URL);
    stubLlm(VALID_URL);

    const before = new Date().toISOString();
    const result = await refreshListing(VALID_URL);
    const after = new Date().toISOString();

    expect(result.record?.extractedAt).toBeDefined();
    expect(result.record!.extractedAt >= before).toBe(true);
    expect(result.record!.extractedAt <= after).toBe(true);
  });

  it("trims whitespace from string fields via normalizeRecord", async () => {
    stubExa(VALID_URL);
    stubLlm(VALID_URL, { title: "  Toyota 86  ", color: "  Azurite Blue  " });

    const result = await refreshListing(VALID_URL);

    expect(result.record?.title).toBe("Toyota 86");
    expect(result.record?.color).toBe("Azurite Blue");
  });
});
