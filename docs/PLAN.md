# goo-net-crawler — Implementation Plan

## Goal

**Standalone TypeScript product** that crawls Goo-net used car listings using Exa + pi SDK (headless). No pi CLI interaction required. Ships as:

- **CLI binary**: `npx goo-net-crawler --brand SUBARU --max 20 --out ./data`
- **Library API**: `import { crawl } from "goo-net-crawler"`

## Success Criteria

1. `npx goo-net-crawler --brand SUBARU --max 20` runs end-to-end with zero human interaction
2. User needs only: Node.js 18+, Exa API key, one LLM provider key (OpenAI/Anthropic/Google)
3. Extracts 15+ structured fields per listing (name, price, mileage, color, dealer, etc.)
4. Translates Japanese fields to English automatically
5. Exports to JSON, CSV, SQLite
6. Parallel extraction via SDK session prompts (concurrency 4)
7. `npm install goo-net-crawler` + set env vars = ready to go

## Architecture

**Headless SDK with custom tools.** Product is a standalone Node.js app. Uses pi SDK (`createAgentSession`) internally to create a headless agent with custom tools. No pi CLI, no interactive prompts, no SKILL.md needed.

```
User runs CLI/API
  ↓
Headless pi agent session (in-memory, custom tools)
  ├─ Tool: exa_fetch → fetches page via Exa REST API
  ├─ Tool: exa_discover → discovers URLs via Exa REST API
  ├─ Tool: export_data → writes JSON/CSV/SQLite
  └─ Agent: extracts fields, translates JP→EN, orchestrates pipeline
  ↓
Output files (JSON, CSV, SQLite)
```

**Why SDK, not pi-package:**
- End user doesn't have pi installed
- End user shouldn't know pi exists
- Product is the interface, pi is the engine

**Key SDK pattern:**
```typescript
const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  model: resolvedModel,
  customTools: [exaFetchTool, exaDiscoverTool, exportTool],
  resourceLoader: customLoader,
});

// Programmatic prompt — no human interaction
await session.prompt("Crawl SUBARU brand, max 20 listings...");
```

---

## Project Structure

```
goo-net-crawler/
├── package.json              # npm package
├── README.md                 # usage docs
├── bin/
│   └── cli.ts                # CLI entry point
├── src/
│   ├── index.ts              # library API export ({ crawl })
│   ├── crawler.ts            # main pipeline orchestrator
│   ├── agent.ts              # headless pi session setup
│   ├── tools/
│   │   ├── exa-fetch.ts      # tool: fetch page via Exa REST
│   │   ├── exa-discover.ts   # tool: discover URLs via Exa REST
│   │   └── export-data.ts    # tool: write JSON/CSV/SQLite
│   ├── prompts/
│   │   ├── system.md         # system prompt for crawl agent
│   │   ├── extract.md        # extraction prompt template
│   │   └── translate.md      # translation prompt template
│   ├── types.ts              # TypeScript interfaces
│   ├── normalizer.ts         # price/mileage parsing
│   ├── exporter.ts           # JSON/CSV/SQLite writers
│   └── utils.ts              # URL helpers, text cleaning
├── docs/
│   ├── research.md           # alternatives evaluation
│   └── PLAN.md               # this file
└── tests/
    ├── crawler.test.ts       # integration test
    ├── normalizer.test.ts    # price/mileage parsing tests
    ├── exporter.test.ts      # export format tests
    └── fixtures/             # sample goo-net markdown
```

---

## Phases

### Phase 1: Scaffold
**Deliverable**: Project skeleton, builds, basic CLI works.

- [ ] Init `package.json` (name: `goo-net-crawler`, bin, type: module)
- [ ] `tsconfig.json` (target: ES2022, module: ESM)
- [ ] Create `bin/cli.ts` entry point (parses args, prints help)
- [ ] Create `src/index.ts` (library export stub)
- [ ] Create `src/types.ts` (VehicleRecord, CrawlConfig, CrawlResult interfaces)
- [ ] Create `README.md` with install + usage
- [ ] `npm install` deps:
  - prod: `@mariozechner/pi-coding-agent`
  - dev: `typescript`, `tsx`, `vitest`, `@types/node`

**Validation**: `npx tsx bin/cli.ts --help` prints usage.

### Phase 1.5: Spike — Headless SDK + Exa Tool
**Deliverable**: Proof that headless pi session + Exa REST tool works.

- [ ] `src/tools/exa-fetch.ts`: tool that calls `https://api.exa.ai/contents` via `fetch()`
- [ ] `src/agent.ts`: create headless session with custom tools
- [ ] Spike test: `session.prompt("Use exa_fetch on URL X, return the markdown")`
- [ ] Validate: agent calls tool, gets markdown, returns it
- [ ] **GATE**: If SDK session + custom tool doesn't work, pivot to direct LLM API calls (bypass pi SDK)

**Validation**: Headless session returns goo-net markdown via custom tool.

### Phase 2: Exa Fetch + Discover Tools
**Deliverable**: Tools for fetching pages and discovering URLs.

- [ ] `src/tools/exa-fetch.ts`:
  - `exa_fetch(url)` → markdown via Exa REST
  - `exa_fetch_batch(urls[])` → batch fetch (up to 50/request)
  - Auth: `process.env.EXA_API_KEY` → `x-api-key` header
  - Retry with backoff
- [ ] `src/tools/exa-discover.ts`:
  - `exa_discover(brand_url)` → detail URLs via Exa /contents + subpages
  - Returns structured URL list
- [ ] `src/utils.ts`: URL canonicalization, domain validation

**Validation**: Fetch returns goo-net markdown. Discover returns 10+ detail URLs for SUBARU.

### Phase 3: Extraction + Translation Prompts
**Deliverable**: Prompts that extract structured data and translate JP→EN.

- [ ] `src/prompts/system.md`: system prompt for crawl agent (role, tools, workflow)
- [ ] `src/prompts/extract.md`: extraction prompt (schema, examples, goo-net field mapping)
- [ ] `src/prompts/translate.md`: translation prompt (field mapping, proper noun rules)
- [ ] `src/normalizer.ts`:
  - `parsePrice("150万円")` → 1500000
  - `parseMileage("3.5万km")` → 35000
  - `normalizeRecord(record)` → record with numeric fields

**Validation**: Feed sample markdown → extraction prompt → valid VehicleRecord with 15+ fields.

### Phase 4: Export Tool + Module
**Deliverable**: Export to JSON, CSV, SQLite.

- [ ] `src/tools/export-data.ts`: tool that writes records to file
- [ ] `src/exporter.ts`:
  - `exportJSON(records, path)` — pretty-printed
  - `exportCSV(records, path)` — UTF-8 BOM
  - `exportSQLite(records, path, table)` — dynamic schema

**Validation**: Export 10 records to all 3 formats, verify correctness.

### Phase 5: Crawler Orchestrator
**Deliverable**: `crawl()` function that runs full pipeline programmatically.

- [ ] `src/crawler.ts`:
  - `crawl(config)` → CrawlResult
  - Creates headless pi session with all custom tools
  - Sends orchestrated prompts (discover → fetch → extract → translate → export)
  - Handles parallelism (batch fetch, sequential extract)
  - Progress callbacks for CLI/API consumers
  - Error handling: partial failures continue
- [ ] `src/agent.ts`:
  - `createCrawlAgent(config)` → AgentSession with tools + system prompt
  - Model resolution from env vars (ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY)
  - In-memory session, no persistence

**Validation**: `await crawl({ brand: "SUBARU", max: 5, outDir: "./test-out" })` produces files.

### Phase 6: CLI
**Deliverable**: `npx goo-net-crawler` command.

- [ ] `bin/cli.ts`:
  - Args: `--brand`, `--brand-url`, `--max`, `--out`, `--format`, `--translate`
  - Env var validation (EXA_API_KEY + one LLM key)
  - Progress output to stderr
  - Results summary to stdout
  - Exit codes (0=success, 1=partial, 2=error)
- [ ] `package.json` bin field: `{ "goo-net-crawler": "./bin/cli.ts" }`

**Validation**: `npx tsx bin/cli.ts --brand SUBARU --max 10 --out ./data` completes.

### Phase 7: Library API
**Deliverable**: `import { crawl, CrawlConfig } from "goo-net-crawler"`

- [ ] `src/index.ts`:
  - Export `crawl(config)` function
  - Export types: `CrawlConfig`, `CrawlResult`, `VehicleRecord`
  - Export `createCrawlAgent(config)` for advanced use
- [ ] JSDoc on all public APIs

**Validation**: `import { crawl } from "./src/index"` works in test script.

### Phase 8: Tests
**Deliverable**: Test coverage.

- [ ] `tests/fixtures/`: sample goo-net markdown pages (3-5)
- [ ] `tests/normalizer.test.ts`: price/mileage edge cases
- [ ] `tests/exporter.test.ts`: format correctness
- [ ] `tests/crawler.test.ts`: integration test with mock Exa responses

**Validation**: `npm test` passes.

### Phase 9: Polish + Publish
**Deliverable**: Production-ready npm package.

- [ ] `README.md`: full docs, examples, env var setup
- [ ] `.npmignore` / `files` field in package.json
- [ ] `postinstall` script: validate env vars, print setup guidance
- [ ] Error messages: clear guidance when keys missing
- [ ] `npm publish` (or `npm pack` for local use)

**Validation**: `npm install -g goo-net-crawler && goo-net-crawler --help` works on clean machine.

---

## Dependencies

### Runtime (bundled)
- `@mariozechner/pi-coding-agent` — SDK for headless agent sessions
- `better-sqlite3` — SQLite export

### Dev
- `typescript` — type checking
- `tsx` — run .ts directly
- `vitest` — tests
- `@types/node` — Node.js types

### User Requirements (not bundled)
- Node.js >= 18
- `EXA_API_KEY` env var
- One of: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`

---

## Risks

| Risk | Mitigation |
|------|-----------|
| SDK custom tools can't call Exa from execute() | Phase 1.5 spike gates this; fallback: direct LLM API calls |
| Goo-net blocks Exa requests | Test early; fallback to direct fetch with headers |
| LLM extraction misses fields | Prompt engineering + validation + retry |
| Exa /contents batch size limit | Chunk requests to 50 URLs max |
| Rate limiting on large crawls | Throttle to 50 QPS, add sleep between batches |
| Japanese encoding issues | Exa returns UTF-8 markdown; no encoding handling needed |
| SDK session overhead for simple tasks | Benchmark; fallback: direct LLM API if too slow |

---

## Cost Estimate

For 1000 listings:
- Exa /contents: ~$1 (1k pages at $1/1k)
- Exa /search (discovery): ~$0.07 (10 searches)
- LLM extraction: ~$0.50–2 (depends on model, GPT-4o-mini cheapest)
- LLM translation: ~$0.50–1 (same model)
- **Total: ~$2–4 for 1000 listings**

vs Firecrawl: $5.33–83/mo
vs Crawl4AI + separate LLM: $0.50–2 + infra costs
