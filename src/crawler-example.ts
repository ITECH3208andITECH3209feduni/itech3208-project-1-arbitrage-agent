/**
 * Quick ad-hoc crawl for testing. Not part of the library API.
 *
 * Usage: npx tsx src/crawler-example.ts
 *        npx tsx src/crawler-example.ts --brand SUBARU --max 20 --out ./data
 */
import "dotenv/config";
import { crawl } from "./index.js";

const args = process.argv.slice(2);
const get = (flag: string) => {
  const i = args.indexOf(`--${flag}`);
  return i === -1 ? undefined : args[i + 1];
};

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: npx tsx src/crawler-example.ts [options]

Options:
  --brand <name>     Car brand (e.g. SUBARU)
  --brand-url <url>  Direct Goo-net brand URL
  --max <n>          Max listings (default: 10)
  --out <dir>        Output dir (default: ./data)`);
  process.exit(0);
}

const result = await crawl({
  brand: get("brand"),
  brandUrl: get("brand-url"),
  max: Number(get("max")) || 10,
  outDir: get("out") || "./data",
});

console.log(`${result.totalExtracted}/${result.totalFound} records → ${result.outputPath}`);
