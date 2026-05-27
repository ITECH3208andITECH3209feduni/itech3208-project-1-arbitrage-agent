import { describe, expect, it, vi } from "vitest";
import { convertJpyToAud, getJpyAudRate } from "../src/exchangeRate.js";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

describe("exchange rate", () => {
  it("fetches and caches JPY to AUD", async () => {
    const storage = new MemoryStorage();
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rates: { AUD: 0.01 } }) });

    const first = await getJpyAudRate({ storage, fetcher: fetcher as any });
    const second = await getJpyAudRate({ storage, fetcher: fetcher as any });

    expect(first.rate).toBe(0.01);
    expect(second.rate).toBe(0.01);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refreshes stale cache", async () => {
    const storage = new MemoryStorage();
    storage.setItem("jpy-aud-exchange-rate", JSON.stringify({ rate: 0.02, cachedAt: "2000-01-01T00:00:00.000Z" }));
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rates: { AUD: 0.01 } }) });

    const result = await getJpyAudRate({ storage, fetcher: fetcher as any });

    expect(result.rate).toBe(0.01);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("falls back to stale cache when API fails", async () => {
    const storage = new MemoryStorage();
    storage.setItem("jpy-aud-exchange-rate", JSON.stringify({ rate: 0.02, cachedAt: "2000-01-01T00:00:00.000Z" }));
    const fetcher = vi.fn().mockRejectedValue(new Error("offline"));

    const result = await getJpyAudRate({ storage, fetcher: fetcher as any });

    expect(result.rate).toBe(0.02);
  });

  it("falls back to default when API fails and no cache exists", async () => {
    const storage = new MemoryStorage();
    const fetcher = vi.fn().mockRejectedValue(new Error("offline"));

    const result = await getJpyAudRate({ storage, fetcher: fetcher as any });

    expect(result.rate).toBe(0.0099);
  });

  it("converts JPY to AUD", () => {
    expect(convertJpyToAud(1_000_000, 0.01)).toBe(10_000);
    expect(convertJpyToAud(null, 0.01)).toBeNull();
  });
});
