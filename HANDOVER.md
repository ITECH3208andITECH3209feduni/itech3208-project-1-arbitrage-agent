# Arbitrage Agent: maintainer handover

## What the system does

The project collects vehicle listings, extracts structured details, estimates the Australian import and driveaway costs, and presents the results in a browser dashboard. The crawler is not an autonomous purchasing agent. A user starts each scrape and reviews the resulting listings and estimates.

## Running and maintaining the project

The main setup instructions and required environment variables are in [README.md](README.md) and [.env.example](.env.example). In short:

1. Install dependencies with `pnpm install`.
2. Set the required Exa, OpenRouter and Convex values in a local `.env` file. Configure the Convex ingest secret on the Convex deployment as well. Do not commit secrets.
3. Run the Convex development backend with `npx convex dev`.
4. Run the dashboard with `pnpm dev` and open the local Vite URL.
5. Before making a change, run `pnpm typecheck`, `pnpm test` and `pnpm build`.

The Japan Car Direct crawler uses Playwright and needs Chromium installed separately. Its command-line setup is in the README. The dashboard currently offers Goo-net, Autotrader and Prestige Motorsport as scrape sources; Japan Car Direct is exported as a library/CLI crawler rather than a dashboard source.

## How the system operates

A scrape moves through these stages:

1. The dashboard in `src/ui/main.tsx` sends the selected source, search criteria and dealership cost settings to the Convex action in `convex/scrape.ts`.
2. The source crawler discovers or receives listing URLs. `src/crawlPipeline.ts` fetches pages through Exa (or a browser fetch for sites that need it), sends page content to the configured OpenRouter model, normalizes the returned vehicle data and validates it.
3. For Japanese-market records, the Convex action loads the current exchange rate and comparable vehicle data, then `src/estimationOrchestration.ts` calls the import and compliance calculations in `src/landedCost/` and `src/compliance/`.
4. The resulting listing, cost assumptions and estimate breakdowns are upserted into the Convex `vehicles` table. The dashboard subscribes to those records and renders them.

Refreshing a listing re-extracts its source page. `prepareRefreshRecord` preserves useful stored values when the page no longer contains them, then recalculates estimates with the current comparable data and exchange rate. Recompute can update estimates without fetching the listing again. The important maintenance points are:

| Area | Main files |
| --- | --- |
| Dashboard and scrape inputs | `src/ui/main.tsx`, `src/ui/styles.css` |
| Crawling and extraction | `src/*Crawler.ts`, `src/crawlPipeline.ts`, `src/exa.ts`, `src/llm.ts` |
| Vehicle record shape and validation | `src/types.ts`, `src/vehicleValidation.ts`, `convex/schema.ts`, `convex/vehicles.ts` |
| Cost calculations | `src/landedCost/`, `src/compliance/`, `src/estimationOrchestration.ts` |
| Scrape, refresh and recompute actions | `convex/scrape.ts` |

## Dealership cost settings

The dashboard's **Dealership cost settings** are stored in the current browser's local storage under `dealership-cost-configuration`. They are sent with future scrapes and saved on the resulting vehicle records, so refresh and recompute keep using the assumptions saved for each listing. Flat costs are entered in AUD. Insurance and customs duty rates are entered as percentages. If an insurance premium is entered directly, it takes precedence over the percentage.

Blank settings keep the existing system estimates. Customs duty overrides are marked as manual inputs because eligibility and import rules need to be checked against current official guidance. Import GST and other statutory calculations are not dealership discount settings and remain calculated by the system. Settings in one browser are not shared with another browser or user. Existing listings also keep their saved values; changing the browser settings does not rewrite previously saved records.

## Current limitations and risks

- Scraping depends on third-party site access, page structure and each site's terms. A site change can break extraction without a code change in this project.
- The LLM can return incomplete or incorrect vehicle data. Schema validation rejects some bad output, but it cannot confirm that every accepted value matches the source page.
- Resale estimates depend on the quality and quantity of comparable listings. They are estimates, not guaranteed sale prices.
- Import, damage and compliance costs can vary by vehicle and circumstances. The breakdown and warnings are intended to support review, not replace quotes or official advice.
- There is no dealership login or shared configuration profile. Cost settings are currently local to one browser and are applied to new scrapes.
- No code in this project places bids or purchases vehicles.

## Suggested development roadmap

Once access to suitable industry resources is available, develop the project in this order:

1. **Validate the data sources.** Confirm permission and stable access for auction listings, auction sheets, sold results and any dealer data. Record the expected update frequency, access limits and source terms before building more crawlers.
2. **Validate the cost model with real examples.** Compare estimates with dealership invoices, shipping quotes, repair outcomes and registration costs. Add versioned assumptions and tests for the cases that materially change the result.
3. **Make configuration a proper dealership profile.** Add authentication and server-side, dealership-scoped settings so cost assumptions can be shared across staff and devices. Provide an explicit way to recalculate existing listings when a profile changes, while retaining the settings used for each past estimate.
4. **Improve crawler reliability.** Give each source a maintained adapter, health checks, retry and rate-limit handling, and tests using representative pages and auction sheets. Track extraction failures and source changes so they are visible to maintainers.
5. **Add controlled automation.** Start with scheduled data refresh and estimate recalculation. Add alerts, audit history, stale-data indicators and a manual approval step before any decision that affects money or compliance.

## Feasibility of a fully autonomous system

A system that automatically refreshes listings, extracts auction-sheet details, recalculates costs and highlights likely opportunities is technically feasible, but making the whole project fully autonomous is not currently reliable enough for purchasing or compliance decisions. The main risks are changing or restricted data sources, authentication challenges, extraction mistakes, uncertain damage assessments, incomplete comparable data and cost rules that depend on the specific vehicle and current regulation. The first steps would be to secure permitted and stable industry data access, validate the estimates against real dealership outcomes, add monitoring and audit trails, and automate only low-risk refresh and calculation work. Human review should remain required for auction condition, import eligibility, final costs and any bid or purchase. Automatic bidding would be a separate, higher-risk system and is not part of the current project.
