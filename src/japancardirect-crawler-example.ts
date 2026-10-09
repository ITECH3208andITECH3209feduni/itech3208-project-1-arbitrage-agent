import "dotenv/config";
import { crawlJapanCarDirect } from "./japanCarDirectCrawler.js";
import { mkdir, writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
function get(flag: string) {
  const i = args.indexOf(`--${flag}`);
  return i < 0 ? undefined : args[i + 1];
}
const result = await crawlJapanCarDirect({
  make: get("make"), model: get("model"),
  year: get("year") ? Number(get("year")) : undefined,
  max: Number(get("max") ?? 10),
  detailPathPattern: get("detail-path-pattern"),
  urls: args.flatMap((arg, i) => arg === "--url" && args[i + 1] ? [args[i + 1]] : []),
  persist: !args.includes("--no-persist"),
});
console.log(`${result.totalExtracted}/${result.totalFound} JCD records extracted`);
console.log(JSON.stringify(result.records, null, 2));
await mkdir("output", { recursive: true });

await writeFile(
  "output/japancardirect-records.json",
  JSON.stringify(result.records, null, 2),
  "utf-8"
);

console.log("Records saved to output/japancardirect-records.json");
