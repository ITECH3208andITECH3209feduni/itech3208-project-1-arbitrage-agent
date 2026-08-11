/**
 * Quick ad-hoc Autotrader crawl.
 *
 * Usage: npx tsx src/autotrader-crawler-example.ts --brand toyota --model alphard --max 20
 *        npx tsx src/autotrader-crawler-example.ts --query "Toyota Alphard" --max 20
 *        npx tsx src/autotrader-crawler-example.ts --url https://www.autotrader.com.au/for-sale/toyota/alphard
 */
import "dotenv/config";
import { crawlAutotrader } from "./index.js";
import { normalizeYear } from "./year.js";

const args = process.argv.slice(2);
const get = (flag: string) => {
  const i = args.indexOf(`--${flag}`);
  return i === -1 ? undefined : args[i + 1];
};
const getAll = (flag: string) => {
  const values: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === `--${flag}` && args[i + 1]) values.push(args[i + 1]);
  }
  return values;
};

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: npx tsx src/autotrader-crawler-example.ts [options]

Options:
  --query <text>    Autotrader search term (e.g. "Toyota Alphard")
  --brand <name>    Autotrader brand (e.g. toyota)
  --model <name>    Optional Autotrader model (e.g. alphard)
  --year <n>        Optional exact year (e.g. 2023)
  --url <url>       Direct Autotrader result/listing URL; can repeat
  --max <n>         Max listings (default: 10)

Requires EXA_API_KEY, OPENROUTER_API_KEY, CONVEX_URL, and CONVEX_INGEST_SECRET.`);
  process.exit(0);
}

const result = await crawlAutotrader({
  query: get("query"),
  brand: get("brand"),
  model: get("model"),
  year: normalizeYear(get("year")),
  urls: getAll("url"),
  max: Number(get("max")) || 10,
});

console.log(`${result.totalExtracted}/${result.totalFound} Autotrader records → ${result.outputPath}`);
