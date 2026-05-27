# goo-net-crawler

Crawl [Goo-net](https://www.goo-net.com) used car listings with LLM-powered extraction. Batch-fetches listing pages via [Exa](https://exa.ai), extracts 15+ structured fields per vehicle, auto-translates Japanese → English, and stores records in Convex.

A building-block library plus tiny Vite viewer.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](package.json)

## Install

```bash
pnpm install
```

## Prerequisites

Set API keys via environment variables or a `.env` file:

```bash
EXA_API_KEY=your-exa-api-key        # https://exa.ai (free tier: 1k reqs/mo)
OPENROUTER_API_KEY=your-key         # https://openrouter.ai/keys
CONVEX_URL=your-convex-url          # from `npx convex dev` or Convex deploy
CONVEX_INGEST_SECRET=shared-secret  # set same value in Convex env
VITE_CONVEX_URL=your-convex-url     # browser UI Convex URL
```

Optional:

```bash
OPENROUTER_MODEL=deepseek/deepseek-v4-flash   # default model
```

## API Usage

```ts
import { crawlGoonet, crawlAutotrader } from "./src/index.js";

const result = await crawlGoonet({
  brand: "Subaru",
  max: 20,
});

console.log(`Extracted ${result.totalExtracted} / ${result.totalFound} records`);
```

Use `brandUrl` for a direct Goo-net listing page:

```ts
await crawlGoonet({
  brandUrl: "https://www.goo-net.com/usedcar/brand-TOYOTA/",
  max: 10,
});

await crawlAutotrader({
  brand: "toyota",
  model: "alphard",
  max: 10,
});
```

Results are upserted into Convex table `vehicles` using `url` as the dedupe key.

## UI

```bash
pnpm dev
```

Open the Vite app. It reads live Convex data through `convex/react` using `VITE_CONVEX_URL`.

## How It Works

1. **Discover** — Exa subpages on known brand pages (`src/brands.ts`).
2. **Fetch** — Exa `/contents` fetches listing markdown and image links.
3. **Extract + Translate** — OpenRouter model extracts structured records in parallel batches.
4. **Normalize** — Japanese price/mileage strings become numbers.
5. **Store** — Convex `vehicles` table upserts by `url`.
6. **View** — Vite React UI subscribes to Convex query data.

## Development

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm crawl:goonet -- --brand Toyota --max 20
pnpm crawl:autotrader -- --brand toyota --model alphard --max 20
```

## License

MIT — see [LICENSE](LICENSE).
