/**
 * Quick ad-hoc crawl for testing. Not part of the library API.
 *
 * Usage: npx tsx src/goonet-crawler-example.ts
 *        npx tsx src/goonet-crawler-example.ts --brand Toyota --model Camry --max 20
 */
import "dotenv/config";
import { crawlGoonet } from "./index.js";
import { normalizeYear } from "./year.js";

const args = process.argv.slice(2);
const get = (flag: string) => {
  const i = args.indexOf(`--${flag}`);
  return i === -1 ? undefined : args[i + 1];
};

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: npx tsx src/goonet-crawler-example.ts [options]

Options:
  --brand <name>     Car brand (e.g. TOYOTA)
  --model <name>     Optional Goo-net model (e.g. CAMRY)
  --year <n>         Optional exact year (e.g. 2023)
  --brand-url <url>  Direct Goo-net brand/model URL
  --max <n>          Max listings (default: 10)

Requires CONVEX_URL and CONVEX_INGEST_SECRET. Records are upserted into Convex.`);
  process.exit(0);
}

const result = await crawlGoonet({
  brand: get("brand"),
  model: get("model"),
  year: normalizeYear(get("year")),
  brandUrl: get("brand-url"),
  max: Number(get("max")) || 10,
});

console.log(`${result.totalExtracted}/${result.totalFound} records → ${result.outputPath}`);
