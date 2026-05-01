import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchBatch } from "../src/exa.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  vi.resetModules();
  mockFetch.mockReset();
  process.env = { ...ORIGINAL_ENV, EXA_API_KEY: "test-key" };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("exa_fetch_batch", () => {
  it("fetches batch from API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { url: "https://a.com", text: "Content A", title: "A" },
          { url: "https://b.com", text: "Content B", title: "B" },
        ],
      }),
    });

    const result = await fetchBatch(["https://a.com", "https://b.com"], "test-key");

    expect(result.fetched).toBe(2);
    expect(result.results["https://a.com"]).toContain("Content A");
    expect(result.results["https://b.com"]).toContain("Content B");
    expect(result.markdown).toContain("Content A");
    expect(result.markdown).toContain("Content B");
  });

  it("tracks URLs not returned by Exa as errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ url: "https://a.com", text: "A" }],
      }),
    });

    const result = await fetchBatch(["https://a.com", "https://b.com"], "test-key");

    expect(result.errors["https://b.com"]).toBe("not returned by Exa");
  });

  it("records API failure for entire chunk after retries", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "Server Error" })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "Server Error" })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "Server Error" });

    const result = await fetchBatch(["https://a.com"], "test-key");

    expect(result.errors["https://a.com"]).toContain("max retries");
  });

  it("chunks large URL lists into batches of 50", async () => {
    const urls = Array.from({ length: 120 }, (_, i) => `https://site${i}.com`);

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: urls.slice(0, 50).map((u) => ({ url: u, text: "ok" })),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: urls.slice(50, 100).map((u) => ({ url: u, text: "ok" })),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: urls.slice(100).map((u) => ({ url: u, text: "ok" })),
        }),
      });

    const result = await fetchBatch(urls, "test-key");

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result.fetched).toBe(120);
  });

  it("retries on 429 then succeeds", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => "Rate limited" })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ url: "https://a.com", text: "Recovered", title: "R" }],
        }),
      });

    const result = await fetchBatch(["https://a.com"], "test-key");

    expect(result.fetched).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("content includes markdown with page separators", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { url: "https://a.com", text: "page a", title: "A" },
          { url: "https://b.com", text: "page b", title: "B" },
        ],
      }),
    });

    const result = await fetchBatch(["https://a.com", "https://b.com"], "test-key");

    expect(result.markdown).toContain("<!-- PAGE: https://a.com -->");
    expect(result.markdown).toContain("<!-- PAGE: https://b.com -->");
    expect(result.markdown).toContain("---");
  });
});