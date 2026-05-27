const CACHE_KEY = "jpy-aud-exchange-rate";
const CACHE_MS = 6 * 60 * 60 * 1000;
const FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest?base=JPY&symbols=AUD";
const FALLBACK_JPY_AUD = 0.0099;

export type ExchangeRateCache = {
  rate: number;
  cachedAt: string;
};

function nowMs() {
  return Date.now();
}

export function loadCachedJpyAudRate(storage: Storage = localStorage): ExchangeRateCache | null {
  try {
    const raw = storage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ExchangeRateCache;
    if (!Number.isFinite(parsed.rate) || !parsed.cachedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCachedJpyAudRate(rate: number, storage: Storage = localStorage): ExchangeRateCache {
  const cache = { rate, cachedAt: new Date().toISOString() };
  storage.setItem(CACHE_KEY, JSON.stringify(cache));
  return cache;
}

export async function fetchJpyAudRate(fetcher: typeof fetch = fetch): Promise<number> {
  const response = await fetcher(FRANKFURTER_URL);
  if (!response.ok) throw new Error(`Frankfurter request failed: ${response.status}`);
  const data = await response.json() as { rates?: { AUD?: number } };
  const rate = data.rates?.AUD;
  if (typeof rate !== "number" || !Number.isFinite(rate)) throw new Error("Frankfurter response missing AUD rate");
  return rate;
}

/** Return JPY→AUD rate using 6h localStorage cache, falling back to stale cache or default. */
export async function getJpyAudRate(options: { storage?: Storage; fetcher?: typeof fetch } = {}): Promise<ExchangeRateCache> {
  const storage = options.storage ?? localStorage;
  const fetcher = options.fetcher ?? fetch;
  const cached = loadCachedJpyAudRate(storage);
  if (cached && nowMs() - Date.parse(cached.cachedAt) < CACHE_MS) return cached;

  try {
    return saveCachedJpyAudRate(await fetchJpyAudRate(fetcher), storage);
  } catch {
    if (cached) return cached;
    return saveCachedJpyAudRate(FALLBACK_JPY_AUD, storage);
  }
}

export function convertJpyToAud(jpy: number | null | undefined, rate: number): number | null {
  if (jpy == null || !Number.isFinite(jpy)) return null;
  return Math.round(jpy * rate);
}
