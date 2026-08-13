/**
 * Quick ad-hoc Prestige Motorsport (Japanese past-auction) crawl.
 *
 * Usage: npx tsx src/prestige-motor-sport-example.ts --make toyota --model alphard --max 20
 *        npx tsx src/prestige-motor-sport-example.ts --make toyota --year-from 2015 --year-to 2020 --max 20
 *        npx tsx src/prestige-motor-sport-example.ts --url https://prestigemotorsport.com.au/auctions/lot/12345
 */
import "dotenv/config";
import { crawlPrestigeMotorsport } from "./index.js";
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
  console.log(`Usage: npx tsx src/prestige-motor-sport-example.ts [options]

Options:
  --make <name>       Make to filter by (e.g. toyota) — required unless --url is given
  --model <name>      Optional model to filter by (e.g. alphard)
  --year-from <n>     Optional year_from filter (e.g. 2015)
  --year-to <n>       Optional year_to filter (e.g. 2020)
  --url <url>         Direct Prestige Motorsport auction listing URL; can repeat
  --max <n>           Max listings (default: 10)
  --no-require-sold   Include listings that aren't confirmed SOLD (default: sold-only)

Requires OPENROUTER_API_KEY, CONVEX_URL, and CONVEX_INGEST_SECRET.`);
  process.exit(0);
}

const result = await crawlPrestigeMotorsport({
  make: get("make"),
  model: get("model"),
  yearFrom: normalizeYear(get("year-from")),
  yearTo: normalizeYear(get("year-to")),
  urls: getAll("url"),
  max: Number(get("max")) || 10,
  requireSold: !args.includes("--no-require-sold"),
});

console.log(`${result.totalExtracted}/${result.totalFound} Prestige Motorsport records → ${result.outputPath}`);