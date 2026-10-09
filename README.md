# Arbitrage Agent

The Arbitrage Agent collects vehicle listings, extracts and normalizes their details, estimates import and resale costs, stores records in Convex, and displays them in a Vite dashboard. Crawlers use [Exa](https://exa.ai) and an OpenRouter model for discovery and extraction. Japan Car Direct uses a Playwright browser session.

The TypeScript crawlers are also available as a library and command-line tools.

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
JCD_USERNAME=your-jcd-username                # optional; pre-fills the visible browser login
JCD_PASSWORD=your-jcd-password                # optional; pre-fills the visible browser login
JCD_PROFILE_DIR=.jcd-browser-profile           # optional; persistent browser profile location
```

Japan Car Direct uses the Playwright dependency and a visible Chromium browser. After `pnpm install`, install its browser once per machine:

```bash
pnpm exec playwright install chromium
```

The crawler reuses its persistent browser profile between runs. Keep it private because it can contain your JCD sign-in session. Credentials only pre-fill the login form; complete sign-in, CAPTCHA, or other verification in the browser when prompted.

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
pnpm crawl:jcd -- --make toyota --model alphard --max 10
```

Japan Car Direct opens the browser, applies make/model filters when possible, and lets you finish sign-in or search manually if needed. You can pass a year filter as well:

```bash
pnpm crawl:jcd -- --make Toyota --model Supra --year 2020 --max 5
```

To crawl known lot pages directly, repeat `--url` for each detail URL:

```bash
pnpm crawl:jcd -- --url https://auc.japancardirect.com/aj-example.htm --max 1 --no-persist
```

The JCD command always writes records to `output/japancardirect-records.json`. `--no-persist` skips the Convex upsert but still writes this JSON file. The default accepted lot URL format is `/aj-<id>.htm`; use `--detail-path-pattern <regex>` only if the site changes that format.
