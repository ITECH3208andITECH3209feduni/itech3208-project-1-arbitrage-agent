import "dotenv/config";
import { chromium, type Page } from "playwright";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { runCrawlPipeline, buildTargetInstruction } from "./crawlPipeline.js";
import type { CrawlResult } from "./types.js";

const START_URL = "https://auc.japancardirect.com/aj_neo";
const ALLOWED_HOST = "auc.japancardirect.com";

export interface JapanCarDirectConfig {
  make?: string;
  model?: string;
  year?: number;
  max: number;
  persist?: boolean;
  /** Optional override; default matches the confirmed /aj-<id>.htm format. */
  detailPathPattern?: string;
  /** Direct detail URLs, bypassing interactive search discovery. */
  urls?: string[];
}

function safeAuctionUrl(raw: string): string {
  const url = new URL(raw, START_URL);
  if (url.protocol !== "https:" || url.hostname !== ALLOWED_HOST) {
    throw new Error(`Refusing non-JCD URL: ${url.origin}`);
  }
  url.hash = "";
  return url.href;
}

interface AuctionGalleryLink {
  id: string;
  href: string;
}

export function classifyAuctionImages(links: AuctionGalleryLink[]): {
  images: string[];
  auctionSheetImages: string[];
} {
  const gallery = links.flatMap(({ id, href }) => {
    const match = /^thumb(\d+)$/.exec(id);
    if (!match) return [];
    try {
      const imageUrl = new URL(href, START_URL);
      if (imageUrl.protocol !== "https:" ||
        !/^(?:\d+\.)?ajes\.com$/i.test(imageUrl.hostname) ||
        !imageUrl.pathname.startsWith("/imgs/")) return [];
      return [{ position: Number(match[1]), url: imageUrl.href }];
    } catch { return []; }
  }).sort((a, b) => a.position - b.position);
  const unique = (items: string[]) => [...new Set(items)];
  let images = unique(gallery.filter((entry) => entry.position > 0).map((entry) => entry.url));
  let auctionSheetImages = unique(gallery.filter((entry) => entry.position === 0).map((entry) => entry.url));

  if (!auctionSheetImages.length && images.length > 1) {
    auctionSheetImages = [images[images.length - 1]!];
    images = images.slice(0, -1);
  }
  return { images, auctionSheetImages };
}

async function pause(message: string): Promise<void> {
  const rl = createInterface({ input, output });
  try { await rl.question(`${message}\nPress Enter to continue... `); }
  finally { rl.close(); }
}

async function attemptLogin(page: Page): Promise<void> {
  const user = process.env.JCD_USERNAME;
  const pass = process.env.JCD_PASSWORD;
  if (!user || !pass) {
    console.log("JCD credentials not configured. Sign in manually in the browser.");
    return;
  }
  const username = page.locator('#form_auth input[name="username"], input[autocomplete="username"], input[name="username"], input[name="login"], input[name="user"], input[type="email"]').first();
  const password = page.locator('#form_auth input[type="password"], input[type="password"]').first();
  if (!(await username.isVisible().catch(() => false)) || !(await password.isVisible().catch(() => false))) {
    console.log("Login fields not identified automatically; use the browser to sign in.");
    return;
  }
  await username.fill(user);
  await password.fill(pass);
  // Do not guess which control submits the form. This allows CAPTCHA/2FA if present.
  console.log("Credentials entered. Complete the sign-in in the browser (including any verification).");
}

/** Apply the site's own search UI; do not navigate to undocumented API endpoints. */
async function applyAuctionSearch(page: Page, config: JapanCarDirectConfig): Promise<boolean> {
  if (!config.make || !config.model) return false;
  const lotSelector = '#aj_out_poisk a.my_bids[href], #aj_out_poisk a[href*="/aj-"][href$=".htm"]';
  try {
    await page.locator('#poisk').waitFor({ state: 'attached', timeout: 20000 });
    const choice = await page.evaluate(({ make, model }) => {
      const makerRows = (document.querySelector<HTMLTextAreaElement>('#manuf_str')?.value || '')
        .split(';').map(row => row.split(':'));
      const maker = makerRows.find(([id, name]) => id && name?.trim().toLowerCase() === make.trim().toLowerCase());
      if (!maker) return null;
      const modelRows = (document.querySelector<HTMLTextAreaElement>('#model_str')?.value || '')
        .split(';').map(row => { const n = row.indexOf(':'); return [row.slice(0, n), row.slice(n + 1)] as const; });
      const target = model.trim().toLowerCase();
      const matched = modelRows.find(([id, label]) => id === maker[0] &&
        label.replace(/\s*\(\d+\)\s*$/, '').trim().toLowerCase() === target);
      return matched ? { makerId: maker[0], modelLabel: matched[1], modelName: target } : null;
    }, { make: config.make, model: config.model });
    if (!choice) {
      console.warn(`[jcd-crawl] Could not find ${config.make} ${config.model} in search lookup tables.`);
      return false;
    }

    // The post-search HTML calls model_submit('1','SUPRA (3)',1) from model links.
    // It separately offers SEARCH (Fline_before; Fline; model_submit()).
    // Select the model first, then explicitly initiate the search if necessary.
    await page.evaluate(({ makerId, modelLabel, year }) => {
      const win = window as unknown as { model_submit?: (...args: unknown[]) => void };
      if (typeof win.model_submit !== 'function') throw new Error('model_submit unavailable');
      const form = document.querySelector<HTMLFormElement>('#poisk');
      if (!form) throw new Error('#poisk is missing');
      if (year !== undefined) {
        for (const name of ['year', 'year2', '_year', '_year2']) {
          const el = form.querySelector<HTMLInputElement>(`input[name="${name}"]`);
          if (el) el.value = String(year);
        }
      }
      win.model_submit(makerId, modelLabel, 1);
    }, { ...choice, year: config.year });

    const results = page.locator(lotSelector);
    // A few searches complete with the model click itself; don't submit twice.
    let found = await results.first().waitFor({ state: 'attached', timeout: 8000 })
      .then(() => true).catch(() => false);
    if (!found) {
      const formState = await page.locator('#poisk').evaluate((form) => {
        const f = form as HTMLFormElement;
        const field = (name: string) => f.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value || '';
        return { vendor: field('vendor'), model: field('model'), year: field('year') };
      });
      console.log('[jcd-crawl] No lot links after choosing model. Search form state:', JSON.stringify(formState));
      const desired = choice.modelName;
      const currentModel = formState.model.replace(/\s*\(\d+\)\s*$/, '').trim().toLowerCase();
      if (formState.vendor !== choice.makerId || currentModel !== desired) {
        console.warn('[jcd-crawl] Site did not apply the requested make/model; declining to scrape unrelated results.');
        return false;
      }
      await page.evaluate(() => {
        const win = window as unknown as {
          Fline_before?: () => void;
          Fline?: () => void;
          model_submit?: () => void;
        };
        if (typeof win.model_submit !== 'function') throw new Error('model_submit unavailable');
        if (typeof win.Fline_before === 'function') win.Fline_before();
        if (typeof win.Fline === 'function') win.Fline();
        win.model_submit();
      });
      found = await results.first().waitFor({ state: 'attached', timeout: 20000 })
        .then(() => true).catch(() => false);
    }
    if (!found) {
      const diagnostic = await page.evaluate(() => ({
        urlPath: location.pathname,
        resultText: document.querySelector('#aj_out_poisk')?.textContent?.trim().slice(0, 250) || '',
        anchors: document.querySelectorAll('#aj_out_poisk a[href]').length,
      }));
      console.warn('[jcd-crawl] Search completed without detectable auction links:', JSON.stringify(diagnostic));
      return false;
    }
    console.log(`[jcd-crawl] Automated search applied: ${config.make} ${config.model}` +
      (config.year ? ` (${config.year})` : ''));
    return true;
  } catch (error) {
    console.warn('[jcd-crawl] Automated search did not complete:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

export async function crawlJapanCarDirect(config: JapanCarDirectConfig): Promise<CrawlResult> {
  if (!Number.isInteger(config.max) || config.max < 1) throw new Error("max must be a positive integer");
  const profile = resolve(process.env.JCD_PROFILE_DIR || ".jcd-browser-profile");
  await mkdir(profile, { recursive: true, mode: 0o700 });
  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    viewport: { width: 1440, height: 900 },
  });
  try {
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(START_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await attemptLogin(page);
    if (!config.urls?.length) {
      let authenticated = await page.evaluate(() =>
        (window as unknown as { is_auth?: number }).is_auth === 1).catch(() => false);
      if (!authenticated) {
        await pause("Sign in to Japan Car Direct in the browser (complete any verification).");
        authenticated = await page.evaluate(() =>
          (window as unknown as { is_auth?: number }).is_auth === 1).catch(() => false);
      }
      const searched = authenticated && await applyAuctionSearch(page, config);
      if (!searched) {
        await pause("Automated filters unavailable. Apply your filters and run a search manually in the browser.");
      }
    }

    // Japan Car Direct returns auction lots as /aj-<opaque-id>.htm.
    // Results are inserted inside #aj_out_poisk after the JS-driven search.
    // Tabs/popups can be involved, so inspect all open pages in this context.
    const detailPattern = config.detailPathPattern
      ? new RegExp(config.detailPathPattern)
      : /^\/aj-[A-Za-z0-9_-]+\.htm$/;
    const rawUrls: string[] = config.urls?.length ? config.urls : [];
    if (!config.urls?.length) {
      for (const tab of context.pages()) {
        const links = await tab.locator('#aj_out_poisk a.my_bids[href], a.my_bids[href^="/aj-"], a[href*="/aj-"][href$=".htm"]').evaluateAll(
          (anchors) => anchors.map((a) => (a as HTMLAnchorElement).href),
        ).catch(() => [] as string[]);
        rawUrls.push(...links);
      }
    }
    const urls = [...new Set(rawUrls.flatMap((raw) => {
      try {
        const url = safeAuctionUrl(raw);
        return detailPattern.test(new URL(url).pathname) ? [url] : [];
      } catch { return []; }
    }))].slice(0, config.max);
    if (urls.length === 0) {
      console.log("No auction lot URLs found. Verify results are visible in #aj_out_poisk before pressing Enter.");
      console.log("Sample same-domain links (no credentials or cookies):");
      for (const raw of rawUrls.slice(0, 25)) {
        try { console.log(new URL(safeAuctionUrl(raw)).pathname); } catch { /* ignore */ }
      }
      return { totalFound: 0, totalExtracted: 0, totalFailed: 0, records: [], outputPath: "convex" };
    }

    const listingImagesByUrl = new Map<string, { images: string[]; auctionSheetImages: string[] }>();

    const systemPrompt = `Extract Japan Car Direct Japanese vehicle auction records. Return ONLY a JSON array. Fields: url, sourceId, make, model, title, titleRaw, price, priceRaw, mileage, mileageRaw, year, color, colorRaw, transmission, transmissionRaw, driveType, driveTypeRaw, fuelType, fuelTypeRaw, bodyType, bodyTypeRaw, description, descriptionRaw, dealer, dealerRaw, location, locationRaw, engineSize, doors, seats, images, auctionSheetImages, auctionNumber, auctionHouse, exteriorGrade, interiorGrade, inspectorNotes, soldStatus, extractedAt. Translate Japanese text to English in non-Raw fields. Missing numeric fields null, missing string fields empty, missing arrays empty. Never invent prices, winning bids, sold status, or vehicle details. IMPORTANT: price_start is an opening bid, NOT a purchase price; price_finish=0 does NOT mean sold. Only set soldStatus="sold" if an explicit sale is confirmed; otherwise unknown. Use price=null when only an opening price or unsold/zero finish is available. Prefer the detail form #poisk hidden fields for make/model/year/chassis/mileage/grade when populated. Preserve original auction sheet images and source URLs. The auction sheet is the dedicated thumb0 image when present; otherwise the final gallery image is the auction sheet. Keep it in auctionSheetImages, not images.`;
    return await runCrawlPipeline({
      label: "jcd-crawl",
      urls,
      model: process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash",
      systemPrompt,
      buildExtractionUser: (blocks) => `${buildTargetInstruction(config)}\nExtract one auction vehicle per supplied detail page:\n${blocks.join("\n\n---\n\n")}\nReturn a JSON array only.`,
      target: { make: config.make, model: config.model, year: config.year },
      persist: config.persist,
      extractBatchSize: 1,
      extractConcurrency: 2,
      prepareRecord: (record, url) => ({
        ...record,
        url,
        ...(listingImagesByUrl.get(url) ?? {}),
        market: "JP",
        source: "japancardirect",
        sourceType: "auction",
        currency: "JPY",
        soldStatus: ["sold", "unsold"].includes(record.soldStatus ?? "") ? record.soldStatus : "unknown",
      }),
      fetchPages: async (detailUrls) => {
        const results: Record<string, string> = {};
        const errors: Record<string, string> = {};
        for (const url of detailUrls) {
          const tab = await context.newPage();
          try {
            const response = await tab.goto(safeAuctionUrl(url), { waitUntil: "domcontentloaded", timeout: 60000 });
            if (!response?.ok()) throw new Error(`HTTP ${response?.status() ?? "no response"}`);
            const text = await tab.locator("body").innerText({ timeout: 15000 });
            const pageTitle = await tab.title();
            const fields = await tab.locator('form input[name]').evaluateAll((inputs) =>
              Object.fromEntries(inputs.map((el) => [(el as HTMLInputElement).name, (el as HTMLInputElement).value])),
            ).catch(() => ({}));
            // JCD exposes full-size images as links, not necessarily lazy images.
            // The auction sheet is the dedicated #thumb0 link (located separately
            // from the vehicle gallery); #thumb1, #thumb2, ... are vehicle photos.
            const galleryLinks = await tab.locator('a[id^="thumb"][href]').evaluateAll((anchors) =>
              anchors.map((anchor) => ({
                id: (anchor as HTMLAnchorElement).id,
                href: (anchor as HTMLAnchorElement).href,
              })),
            );
            const { images, auctionSheetImages } = classifyAuctionImages(galleryLinks);
            console.error(`[jcd-crawl] ${new URL(url).pathname}: ${images.length} vehicle photos, ${auctionSheetImages.length} auction sheets`);
            listingImagesByUrl.set(url, { images, auctionSheetImages });
            if (!text.trim()) throw new Error("Empty page; content may require additional loading");
            results[url] = `Page title: ${pageTitle}\nDetail form values (source evidence):\n${JSON.stringify(fields)}\n\nPage text:\n${text.slice(0, 22000)}\n\nVehicle photo URLs:\n${images.join("\n")}\nAuction sheet image URL:\n${auctionSheetImages.join("\n")}`;
          } catch (err) {
            errors[url] = err instanceof Error ? err.message : String(err);
          } finally { await tab.close(); }
          await new Promise(r => setTimeout(r, 1000));
        }
        return { results, errors };
      },
    });
  } finally {
    await context.close();
  }
}
