# goo-net-crawler

Crawl [Goo-net](https://www.goo-net.com) used car listings with LLM-powered extraction. Batch-fetches listing pages via [Exa](https://exa.ai), extracts 15+ structured fields per vehicle, and auto-translates Japanese → English. Outputs JSON.

[![npm version](https://img.shields.io/npm/v/goo-net-crawler)](https://www.npmjs.com/package/goo-net-crawler)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](package.json)

## Install

```bash
npm install -g goo-net-crawler
```

Or as a library:

```bash
npm install goo-net-crawler
```

## Prerequisites

Set API keys via environment variables or a `.env` file:

```bash
EXA_API_KEY=your-exa-api-key        # https://exa.ai (free tier: 1k reqs/mo)
OPENROUTER_API_KEY=your-key         # https://openrouter.ai/keys
```

Optional:

```bash
OPENROUTER_MODEL=anthropic/claude-sonnet-4   # default model
```

## CLI Usage

```bash
# Crawl by brand name
goo-net-crawler --brand SUBARU --max 20 --out ./data

# Crawl from a direct Goo-net brand URL
goo-net-crawler --brand-url "https://www.goo-net.com/used_car/brand/toyota" --max 50
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--brand <name>` | Car brand to crawl | — |
| `--brand-url <url>` | Direct Goo-net brand page URL | — |
| `--max <n>` | Max listings to process | `10` |
| `--out <dir>` | Output directory | `./data` |
| `--version` | Show version | — |
| `--help`, `-h` | Show help | — |

### Output

Results are written to `<out>/vehicles.json` — an array of `VehicleRecord` objects with all Japanese fields translated to English.

## API Usage

```ts
import { crawl } from "goo-net-crawler";

const result = await crawl({
  brand: "SUBARU",
  max: 20,
  outDir: "./data",
});

console.log(`Extracted ${result.totalExtracted} / ${result.totalFound} records`);
console.log(result.records); // VehicleRecord[]
```

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
npm install
npm run build    # TypeScript → dist/
npm run test     # Vitest suite
npm run lint     # Type-check only
```

### Running without installing

```bash
npx tsx bin/cli.ts --brand SUBARU --max 10
```

## License

MIT — see [LICENSE](LICENSE).