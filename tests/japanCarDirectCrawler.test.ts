import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrawlPipelineConfig } from "../src/crawlPipeline.js";
import { classifyAuctionImages, crawlJapanCarDirect } from "../src/japanCarDirectCrawler.js";
import type { CrawlResult, VehicleRecord } from "../src/types.js";

const {
  launchPersistentContext,
  runCrawlPipeline,
  buildTargetInstruction,
  createInterface,
  mkdir,
} = vi.hoisted(() => ({
  launchPersistentContext: vi.fn(),
  runCrawlPipeline: vi.fn(),
  buildTargetInstruction: vi.fn(() => ""),
  createInterface: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock("playwright", () => ({ chromium: { launchPersistentContext } }));
vi.mock("../src/crawlPipeline.js", () => ({ runCrawlPipeline, buildTargetInstruction }));
vi.mock("node:readline/promises", () => ({ createInterface }));
vi.mock("node:fs/promises", () => ({ mkdir }));

interface FakeLocator {
  first(): FakeLocator;
  isVisible(): Promise<boolean>;
  fill(value: string): Promise<void>;
  waitFor(options?: unknown): Promise<void>;
  evaluate(callback: (...args: never[]) => unknown): Promise<unknown>;
  evaluateAll(callback: (nodes: never[]) => unknown): Promise<unknown>;
  innerText(options?: unknown): Promise<string>;
}

interface FakePageOptions {
  evaluationResults?: unknown[];
  lotUrls?: string[];
  loginFieldsVisible?: boolean;
  bodyText?: string;
  galleryLinks?: Array<{ id: string; href: string }>;
}

function fakeLocator(options: {
  visible?: boolean;
  evaluationResult?: unknown;
  evaluationAllResult?: unknown;
  bodyText?: string;
} = {}): FakeLocator {
  const fills: string[] = [];
  const locator: FakeLocator = {
    first: () => locator,
    isVisible: async () => options.visible ?? false,
    fill: vi.fn(async (value: string) => { fills.push(value); }),
    waitFor: async () => undefined,
    evaluate: async () => options.evaluationResult,
    evaluateAll: async () => options.evaluationAllResult,
    innerText: async () => options.bodyText ?? "Auction lot details",
  };
  return locator;
}

function fakePage(options: FakePageOptions = {}) {
  const evaluationResults = [...(options.evaluationResults ?? [])];
  const locators = new Map<string, FakeLocator>();
  const selectors: string[] = [];
  const page = {
    goto: vi.fn(async () => ({ ok: () => true, status: () => 200 })),
    evaluate: vi.fn(async () => evaluationResults.shift()),
    title: vi.fn(async () => "Japan Car Direct auction lot"),
    close: vi.fn(async () => undefined),
    locator: vi.fn((selector: string) => {
      selectors.push(selector);
      let locator = locators.get(selector);
      if (!locator) {
        let evaluationAllResult: unknown;
        let evaluationResult: unknown;
        if (selector.includes("#aj_out_poisk")) evaluationAllResult = options.lotUrls ?? [];
        else if (selector.startsWith('a[id^="thumb"')) evaluationAllResult = options.galleryLinks ?? [];
        else if (selector === "#poisk") evaluationResult = { vendor: "1", model: "SUPRA", year: "" };
        else if (selector === 'form input[name]') evaluationAllResult = [];
        locator = fakeLocator({
          visible: options.loginFieldsVisible,
          evaluationResult,
          evaluationAllResult,
          bodyText: options.bodyText,
        });
        locators.set(selector, locator);
      }
      return locator;
    }),
  };
  return { page, locators, selectors };
}

function setupBrowser(searchPage: ReturnType<typeof fakePage>, detailPage?: ReturnType<typeof fakePage>) {
  const context = {
    pages: vi.fn(() => [searchPage.page]),
    newPage: vi.fn(async () => (detailPage ?? fakePage()).page),
    close: vi.fn(async () => undefined),
  };
  launchPersistentContext.mockResolvedValue(context);
  return context;
}

const emptyResult: CrawlResult = {
  totalFound: 0,
  totalExtracted: 0,
  totalFailed: 0,
  records: [],
  outputPath: "convex",
};

function capturedConfig(): CrawlPipelineConfig {
  const calls = runCrawlPipeline.mock.calls as unknown as Array<[CrawlPipelineConfig]>;
  return calls[calls.length - 1]![0];
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.JCD_USERNAME;
  delete process.env.JCD_PASSWORD;
  mkdir.mockResolvedValue(undefined);
  buildTargetInstruction.mockReturnValue("");
  runCrawlPipeline.mockResolvedValue(emptyResult);
  createInterface.mockImplementation(() => ({
    question: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
  }));
});

afterEach(() => {
  delete process.env.JCD_USERNAME;
  delete process.env.JCD_PASSWORD;
});

describe("crawlJapanCarDirect", () => {
  it("waits for login, applies make/model search, and filters discovered URLs", async () => {
    const searchPage = fakePage({
      evaluationResults: [
        false,
        true,
        { makerId: "1", modelLabel: "SUPRA (3)", modelName: "supra" },
        undefined,
      ],
      lotUrls: [
        "https://auc.japancardirect.com/aj-lot-123.htm#details",
        "/aj-lot-123.htm",
        "https://outside.example/aj-foreign.htm",
        "http://auc.japancardirect.com/aj-insecure.htm",
        "https://auc.japancardirect.com/search",
        "https://auc.japancardirect.com/aj-lot-456.htm",
      ],
    });
    setupBrowser(searchPage);

    await crawlJapanCarDirect({ make: "Toyota", model: "Supra", max: 1, persist: false });

    expect(createInterface).toHaveBeenCalledTimes(1);
    expect(searchPage.page.evaluate).toHaveBeenCalledTimes(4);
    expect(capturedConfig().urls).toEqual(["https://auc.japancardirect.com/aj-lot-123.htm"]);
    expect(searchPage.selectors).toContain("#poisk");
  });

  it("falls back to manual search after authentication is still unavailable", async () => {
    const searchPage = fakePage({
      evaluationResults: [false, false],
      lotUrls: ["/aj-manual-1.htm"],
    });
    setupBrowser(searchPage);

    await crawlJapanCarDirect({ make: "Toyota", model: "Supra", max: 5, persist: false });

    expect(createInterface).toHaveBeenCalledTimes(2);
    expect(searchPage.page.evaluate).toHaveBeenCalledTimes(2);
    expect(capturedConfig().urls).toEqual(["https://auc.japancardirect.com/aj-manual-1.htm"]);
  });

  it("fills configured login credentials without submitting the form", async () => {
    process.env.JCD_USERNAME = "test-user";
    process.env.JCD_PASSWORD = "test-password";
    const searchPage = fakePage({ loginFieldsVisible: true });
    setupBrowser(searchPage);

    await crawlJapanCarDirect({ urls: ["/aj-direct-1.htm"], max: 1, persist: false });

    const usernameSelector = searchPage.selectors.find((selector) => selector.includes('input[name="username"]'))!;
    const passwordSelector = searchPage.selectors.find((selector) => selector.includes('input[type="password"]'))!;
    expect(searchPage.locators.get(usernameSelector)?.fill).toHaveBeenCalledWith("test-user");
    expect(searchPage.locators.get(passwordSelector)?.fill).toHaveBeenCalledWith("test-password");
    expect(createInterface).not.toHaveBeenCalled();
  });

  it("classifies trusted gallery links and attaches image URLs to extracted records", async () => {
    const listingUrl = "https://auc.japancardirect.com/aj-lot-789.htm";
    const detailPage = fakePage({
      galleryLinks: [
        { id: "thumb2", href: "https://2.ajes.com/imgs/car-2.jpg" },
        { id: "thumb0", href: "https://1.ajes.com/imgs/sheet.jpg" },
        { id: "thumb1", href: "https://1.ajes.com/imgs/car-1.jpg" },
        { id: "thumb3", href: "https://untrusted.example/imgs/fake.jpg" },
      ],
    });
    const searchPage = fakePage();
    setupBrowser(searchPage, detailPage);

    let fetchedPages: Awaited<ReturnType<NonNullable<CrawlPipelineConfig["fetchPages"]>>> | undefined;
    runCrawlPipeline.mockImplementation(async (config: CrawlPipelineConfig) => {
      fetchedPages = await config.fetchPages?.(config.urls);
      return emptyResult;
    });

    await crawlJapanCarDirect({ urls: [listingUrl], max: 1, persist: false });

    expect(fetchedPages?.results[listingUrl]).toContain("https://1.ajes.com/imgs/car-1.jpg");
    expect(fetchedPages?.results[listingUrl]).toContain("https://1.ajes.com/imgs/sheet.jpg");
    expect(fetchedPages?.results[listingUrl]).not.toContain("untrusted.example");
    const record = capturedConfig().prepareRecord!({ url: listingUrl } as VehicleRecord, listingUrl);
    expect(record?.images).toEqual([
      "https://1.ajes.com/imgs/car-1.jpg",
      "https://2.ajes.com/imgs/car-2.jpg",
    ]);
    expect(record?.auctionSheetImages).toEqual(["https://1.ajes.com/imgs/sheet.jpg"]);
  });
});

describe("classifyAuctionImages", () => {
  it("uses the final gallery image as the sheet when thumb0 is absent", () => {
    expect(classifyAuctionImages([
      { id: "thumb1", href: "https://1.ajes.com/imgs/car.jpg" },
      { id: "thumb2", href: "https://1.ajes.com/imgs/sheet.jpg" },
    ])).toEqual({
      images: ["https://1.ajes.com/imgs/car.jpg"],
      auctionSheetImages: ["https://1.ajes.com/imgs/sheet.jpg"],
    });
  });
});
