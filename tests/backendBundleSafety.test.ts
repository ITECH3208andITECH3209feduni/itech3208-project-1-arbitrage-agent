import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Convex server bundle safety", () => {
  it("keeps the Playwright-based JCD crawler out of the Convex server bundle", () => {
    const scrapeSource = readFileSync(resolve(__dirname, "../convex/scrape.ts"), "utf8");
    expect(scrapeSource).not.toContain("japanCarDirectCrawler");
    expect(scrapeSource).toContain("local Node sidecar");
  });
});
