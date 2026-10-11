import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { crawlJapanCarDirect } from "./japanCarDirectCrawler.js";
import type { JapanCarDirectConfig } from "./japanCarDirectCrawler.js";
import type { VehicleRecord } from "./types.js";

type JobStatus = "running" | "waiting" | "completed" | "failed";

interface JapanCarDirectJob {
  id: string;
  status: JobStatus;
  message: string;
  totalFound?: number;
  totalExtracted?: number;
  totalFailed?: number;
  errors?: string[];
  records?: VehicleRecord[];
  error?: string;
  continue?: () => void;
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 64 * 1024) {
        reject(new Error("Japan Car Direct request is too large."));
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Invalid JSON request."));
      }
    });
    req.on("error", reject);
  });
}

function optionalText(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > 200) {
    throw new Error(`${label} must be a string of at most 200 characters.`);
  }
  return value.trim() || undefined;
}

function parseConfig(body: unknown): Omit<JapanCarDirectConfig, "onStatus" | "waitForManualAction"> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("A scrape configuration is required.");
  }
  const value = body as Record<string, unknown>;
  const max = value.max;
  if (!Number.isInteger(max) || Number(max) < 1 || Number(max) > 100) {
    throw new Error("Maximum vehicles must be an integer from 1 to 100.");
  }
  const year = value.year;
  if (year !== undefined && (!Number.isInteger(year) || Number(year) < 1886 || Number(year) > new Date().getFullYear() + 1)) {
    throw new Error("Year must be a valid four-digit vehicle year.");
  }
  const urls = value.urls;
  if (urls !== undefined && (!Array.isArray(urls) || urls.length > 100 || urls.some((url) => typeof url !== "string" || url.length > 2048))) {
    throw new Error("URLs must be an array of at most 100 valid strings.");
  }
  return {
    make: optionalText(value.make, "Make"),
    model: optionalText(value.model, "Model"),
    year: year === undefined ? undefined : Number(year),
    max: Number(max),
    urls: Array.isArray(urls) ? urls.filter((url): url is string => typeof url === "string") : undefined,
    persist: false,
  };
}

function jobResponse(job: JapanCarDirectJob) {
  return {
    id: job.id,
    status: job.status,
    message: job.message,
    totalFound: job.totalFound,
    totalExtracted: job.totalExtracted,
    totalFailed: job.totalFailed,
    errors: job.errors,
    records: job.records,
    error: job.error,
  };
}

export function japanCarDirectDevServer(): Plugin {
  let job: JapanCarDirectJob | undefined;

  return {
    name: "japan-car-direct-local-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (!url.pathname.startsWith("/api/jcd/")) {
          next();
          return;
        }

        void (async () => {
          const origin = req.headers.origin;
          if (origin && new URL(origin).host !== req.headers.host) {
            sendJson(res, 403, { error: "Cross-origin Japan Car Direct requests are not allowed." });
            return;
          }

          if (url.pathname === "/api/jcd/scrape" && req.method === "POST") {
            const config = parseConfig(await readJson(req));
            if (job?.status === "running" || job?.status === "waiting") {
              sendJson(res, 409, { error: "A Japan Car Direct scrape is already running." });
              return;
            }
            job = {
              id: randomUUID(),
              status: "running",
              message: "Starting Japan Car Direct…",
            };
            const activeJob = job;
            sendJson(res, 202, { id: activeJob.id });
            void crawlJapanCarDirect({
              ...config,
              onStatus: (message) => {
                if (job?.id === activeJob.id && job.status === "running") job.message = message;
              },
              waitForManualAction: (message) => new Promise<void>((resolve) => {
                if (job?.id !== activeJob.id) {
                  resolve();
                  return;
                }
                activeJob.status = "waiting";
                activeJob.message = message;
                activeJob.continue = () => {
                  activeJob.status = "running";
                  activeJob.message = "Continuing Japan Car Direct scrape…";
                  activeJob.continue = undefined;
                  resolve();
                };
              }),
            }).then((result) => {
              if (job?.id === activeJob.id) {
                activeJob.status = "completed";
                activeJob.totalFound = result.totalFound;
                activeJob.totalExtracted = result.totalExtracted;
                activeJob.totalFailed = result.totalFailed;
                activeJob.errors = result.errors;
                activeJob.message = `Extracted ${result.totalExtracted} of ${result.totalFound} Japan Car Direct listings${result.totalFailed ? `; ${result.totalFailed} failed` : ""}.`;
                activeJob.records = result.records;
              }
            }).catch((error: unknown) => {
              if (job?.id === activeJob.id) {
                activeJob.status = "failed";
                activeJob.error = error instanceof Error ? error.message : String(error);
                activeJob.message = "Japan Car Direct scrape failed.";
              }
            });
            return;
          }

          if (url.pathname === "/api/jcd/status" && req.method === "GET") {
            if (!job || url.searchParams.get("id") !== job.id) {
              sendJson(res, 404, { error: "Japan Car Direct scrape not found." });
              return;
            }
            sendJson(res, 200, jobResponse(job));
            return;
          }

          if (url.pathname === "/api/jcd/continue" && req.method === "POST") {
            const body = await readJson(req);
            const activeJob = job;
            if (!activeJob || !body || typeof body !== "object" || Array.isArray(body) || (body as Record<string, unknown>).id !== activeJob.id) {
              sendJson(res, 404, { error: "Japan Car Direct scrape not found." });
              return;
            }
            if (activeJob.status !== "waiting" || !activeJob.continue) {
              sendJson(res, 409, { error: "Japan Car Direct is not waiting for a manual action." });
              return;
            }
            activeJob.continue();
            sendJson(res, 200, { resumed: true });
            return;
          }

          sendJson(res, 404, { error: "Japan Car Direct endpoint not found." });
        })().catch((error: unknown) => {
          if (!res.headersSent) {
            sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
          }
        });
      });
    },
  };
}
