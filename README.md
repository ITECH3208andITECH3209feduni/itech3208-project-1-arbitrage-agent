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
  title: string;
  price: number | null;
  priceRaw: string;
  mileage: number | null;
  mileageRaw: string;
  year: number | null;
  color: string;
  transmission: string;
  driveType: string;
  engineSize: string;
  fuelType: string;
  bodyType: string;
  doors: number | null;
  seats: number | null;
  dealer: string;
  location: string;
  description: string;
  images: string[];
  extractedAt: string;
}
```

## How It Works

1. **Discover** — Uses Exa to find individual listing detail URLs from a brand page
2. **Fetch** — Batch-fetches all listing pages as clean markdown via Exa
3. **Extract** — LLM parses each page into structured `VehicleRecord` objects
4. **Normalize** — Parses Japanese price/mileage notation (万円, 万km) into numbers
5. **Translate** — Converts Japanese fields (color, transmission, fuel type, body type, description) to English
6. **Export** — Writes results as pretty-printed JSON

## Development

```bash
pnpm install
pnpm test      # Vitest suite
```

No build step — the project runs TypeScript directly via `vitest` (tests) and `tsx` (ad-hoc scripts).

```bash
# Dev CLI testing
pnpm crawl -- --brand SUBARU --max 20 --out ./data
# or directly
npx tsx src/crawler-example.ts --brand SUBARU --max 20
```

## License

MIT — see [LICENSE](LICENSE).