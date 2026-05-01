# goo-net-crawler

Crawl [Goo-net](https://www.goo-net.com) used car listings with LLM-powered extraction. Batch-fetches listing pages via [Exa](https://exa.ai), extracts 15+ structured fields per vehicle, and auto-translates Japanese → English. Outputs JSON.

A building-block library — import into a larger project, not a standalone CLI.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](package.json)

## Install

```bash
pnpm install
```

No global install — this is a library imported by a parent project.

## Prerequisites

Set API keys via environment variables or a `.env` file:

```bash
EXA_API_KEY=your-exa-api-key        # https://exa.ai (free tier: 1k reqs/mo)
OPENROUTER_API_KEY=your-key         # https://openrouter.ai/keys
```

Optional:

```bash
OPENROUTER_MODEL=deepseek/deepseek-v4-flash   # default model
```

## API Usage

### `brand` (known brands)

Use a brand from the registry in `src/brands.ts` (TOYOTA, HONDA, NISSAN, SUBARU, MAZDA, SUZUKI, MITSUBISHI, DAIHATSU, LEXUS):

```ts
import { crawl } from "./src/index.js";

const result = await crawl({
  brand: "SUBARU",
  max: 20,
  outDir: "./data",
});

console.log(`Extracted ${result.totalExtracted} / ${result.totalFound} records`);
console.log(result.records); // VehicleRecord[]
```

### `brandUrl` (custom page)

Pass any Goo-net listing page URL directly:

```ts
const result = await crawl({
  brandUrl: "https://www.goo-net.com/usedcar/brand-TOYOTA/",
  max: 10,
  outDir: "./data",
});
```

### Adding a brand

Edit `src/brands.ts` — add the brand's listing page(s) to the `BRAND_PAGES` map.

Results are written to `<outDir>/vehicles.json` — an array of `VehicleRecord` objects with all Japanese fields translated to English.

### Types

```ts
interface CrawlConfig {
  brand?: string;
  brandUrl?: string;
  max: number;
  outDir: string;
}

interface CrawlResult {
  totalFound: number;
  totalExtracted: number;
  totalFailed: number;
  records: VehicleRecord[];
  outputPath: string;
}

interface VehicleRecord {
  url: string;
  /** English */ title: string;              /** Japanese */ titleRaw: string;
  price: number | null;                      priceRaw: string;
  mileage: number | null;                    mileageRaw: string;
  year: number | null;
  /** English */ color: string;              /** Japanese */ colorRaw: string;
  /** English */ transmission: string;       /** Japanese */ transmissionRaw: string;
  /** English */ driveType: string;          /** Japanese */ driveTypeRaw: string;
  engineSize: string;
  /** English */ fuelType: string;           /** Japanese */ fuelTypeRaw: string;
  /** English */ bodyType: string;           /** Japanese */ bodyTypeRaw: string;
  doors: number | null;
  seats: number | null;
  /** English */ dealer: string;             /** Japanese */ dealerRaw: string;
  /** English */ location: string;           /** Japanese */ locationRaw: string;
  /** English */ description: string;        /** Japanese */ descriptionRaw: string;
  images: string[];
  extractedAt: string;
}
```

## How It Works

1. **Discover** — Uses Exa's subpages feature on known brand listing pages (`src/brands.ts`). Parallel discovery across multiple pages per brand, deduping URLs.
2. **Fetch** — Batch-fetches all listing pages as markdown via Exa, including inline image links.
3. **Extract + Translate** — LLM processes pages in parallel batches (10 pages per batch, 5 concurrent). Each record gets both raw Japanese (`*Raw` fields) and English translations.
4. **Normalize** — Parses Japanese price/mileage notation (万円, 万km) into numbers.
5. **Export** — Writes results as pretty-printed JSON.

## Viewing Results

Open `view.html` in a browser (serves `data/vehicles.json` via `fetch` — requires a local HTTP server):

```bash
npx serve .   # then open https://localhost:3000/view.html
```

Or Python: `python3 -m http.server 8080` → `http://localhost:8080/view.html`.

Features: search, filters (fuel, transmission, drive, body, year), image carousel with lightbox zoom.

## Development

```bash
pnpm install
pnpm test      # Vitest suite — parallel batch extraction, error handling, edge cases
```

No build step — TypeScript runs directly via `vitest` (tests) and `tsx` (ad-hoc scripts).

```bash
# Dev CLI testing
pnpm run --silent crawl --brand TOYOTA --max 20 --out ./data
# or directly
npx tsx src/crawler-example.ts --brand TOYOTA --max 20
```

## License

MIT — see [LICENSE](LICENSE).