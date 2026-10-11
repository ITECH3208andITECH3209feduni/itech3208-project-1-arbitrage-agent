import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { parse as parseEnv } from "dotenv";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { z } from "zod";

loadEnv({ path: ".env.local", override: true });

function isOpenRouterApiKey(value: string | undefined): value is string {
  return /^sk-or-v1-[a-f\d]{64}$/i.test(value?.trim() ?? "");
}

async function useValidOpenRouterKey(): Promise<void> {
  if (isOpenRouterApiKey(process.env.OPENROUTER_API_KEY)) return;
  try {
    const envFile = parseEnv(await readFile(".env", "utf8"));
    const fallbackKey = envFile.OPENROUTER_API_KEY?.trim();
    if (isOpenRouterApiKey(fallbackKey)) process.env.OPENROUTER_API_KEY = fallbackKey;
  } catch {
    // The service will return a configuration error if neither env file has a valid key.
  }
}

const costOverridesSchema = z.object({
  agentFeeAud: z.number().optional(),
  inlandTransportAud: z.number().optional(),
  exportPaperworkAud: z.number().optional(),
  wharfHandlingAud: z.number().optional(),
  customsBrokerageAud: z.number().optional(),
  biosecurityAud: z.number().optional(),
  adrEngineeringAud: z.number().optional(),
  registrationFee: z.number().optional(),
  tacFee: z.number().optional(),
  plateFee: z.number().optional(),
  japaneseOriginProof: z.boolean().optional(),
  modifiedVehicle: z.boolean().optional(),
  convertedToRhd: z.boolean().optional(),
  isFuelEfficient: z.boolean().optional(),
  isGreenPassengerCar: z.boolean().optional(),
});

const requestSchema = z.object({
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.number().optional(),
  urls: z.array(z.string()).optional(),
  max: z.number().int().min(1).max(100),
  costOverrides: costOverridesSchema.optional(),
});

function json(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readBody(request: import("node:http").IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString();
    if (body.length > 100_000) throw new Error("Request body is too large");
  }
  return body;
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/api/jcd/scrape") {
    json(response, 404, { error: "Not found" });
    return;
  }

  try {
    const parsed = requestSchema.safeParse(JSON.parse(await readBody(request)));
    if (!parsed.success) {
      json(response, 400, { error: parsed.error.issues[0]?.message ?? "Invalid scrape request" });
      return;
    }
    const { make, model, year, urls, max, costOverrides } = parsed.data;
    if (!make?.trim() && !urls?.length) {
      json(response, 400, { error: "Enter a Japan Car Direct make or direct URL." });
      return;
    }

    const convexUrl = process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL;
    const secret = process.env.CONVEX_INGEST_SECRET;
    await useValidOpenRouterKey();
    if (!convexUrl || !secret || !isOpenRouterApiKey(process.env.OPENROUTER_API_KEY)) {
      json(response, 503, { error: "Set CONVEX_URL and CONVEX_INGEST_SECRET, and provide a valid OPENROUTER_API_KEY in .env.local or .env." });
      return;
    }

    const { crawlJapanCarDirect } = await import("./japanCarDirectCrawler.js");
    const crawlResult = await crawlJapanCarDirect({
      make,
      model: model ?? "Any",
      year,
      urls,
      max,
      persist: false,
      interactive: false,
    });
    const saved = crawlResult.records.length === 0
      ? { upserted: 0 }
      : await new ConvexHttpClient(convexUrl).action(api.scrape.ingestJapanCarDirect, {
          secret,
          records: crawlResult.records,
          make,
          model: model && model.toLowerCase() !== "any" ? model : undefined,
          costOverrides,
        });

    json(response, 200, {
      totalFound: crawlResult.totalFound,
      totalExtracted: crawlResult.totalExtracted,
      totalFailed: crawlResult.totalFailed,
      upserted: saved.upserted,
    });
  } catch (error) {
    json(response, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

const port = Number(process.env.JCD_SERVICE_PORT ?? 3001);
server.listen(port, "127.0.0.1", () => {
  console.log(`Japan Car Direct local service listening on http://127.0.0.1:${port}`);
});