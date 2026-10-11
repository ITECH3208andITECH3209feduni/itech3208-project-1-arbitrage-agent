import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCrawlPipeline } from "../src/crawlPipeline.js";

const { fetchBatch, prompt, exportToConvex } = vi.hoisted(() => ({
  fetchBatch: vi.fn(),
  prompt: vi.fn(),
  exportToConvex: vi.fn(),
}));

vi.mock("../src/exa.js", () => ({ fetchBatch }));
vi.mock("../src/llm.js", () => ({ prompt }));
vi.mock("../src/convexExporter.js", () => ({ exportToConvex }));

const listingUrl = "https://auc.japancardirect.com/aj-test-1.htm";

function config(fetchPages: () => Promise<{ results: Record<string, string>; errors: Record<string, string> }>) {
  return {
    label: "test-crawl",
    urls: [listingUrl],
    model: "test-model",
    systemPrompt: "Extract vehicle data.",
    buildExtractionUser: (pages: string[]) => pages.join("\n"),
    fetchPages,
    persist: false,
  };
}

describe("crawl pipeline failure diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports when the AI returns no vehicle records", async () => {
    prompt.mockResolvedValue("[]");
    const result = await runCrawlPipeline(config(async () => ({
      results: { [listingUrl]: "Page title: Auction lot\nPage text: vehicle details" },
      errors: {},
    })));

    expect(result).toMatchObject({
      totalFound: 1,
      totalExtracted: 0,
      totalFailed: 1,
      errors: [`${listingUrl}: AI returned an empty array.`],
    });
  });

  it("includes authenticated page-fetch errors in the result", async () => {
    const result = await runCrawlPipeline(config(async () => ({
      results: {},
      errors: { [listingUrl]: "HTTP 403" },
    })));

    expect(result).toMatchObject({
      totalFound: 1,
      totalExtracted: 0,
      totalFailed: 1,
      errors: [`${listingUrl}: fetch failed: HTTP 403`],
    });
    expect(prompt).not.toHaveBeenCalled();
  });
});
