# pi-goo-net-crawler — Implementation Plan

## Goal

TypeScript pi package that crawls Goo-net used car listings using Exa + pi's LLM for structured extraction, translation, and export. Installable via `pi install`, runnable non-interactively via `pi -p`.

## Success Criteria

1. `pi install ./path/to/parser` installs extension + skill + validates Exa key
2. `pi -p "Crawl SUBARU on goo-net, max 20 listings, export JSON+CSV"` completes end-to-end
3. Extracts 15+ structured fields per listing (name, price, mileage, color, dealer, etc.)
4. Translates Japanese fields to English using pi's model
5. Exports to JSON, CSV, SQLite
6. Parallel extraction via subagents (concurrency 4)
7. Works without additional API keys (uses existing pi model + Exa config)

## Project Structure

```
pi-goo-net-crawler/
├── package.json              # pi package manifest
├── README.md                 # usage docs
├── install.sh                # setup script (validates env, installs deps)
├── extensions/
│   └── index.ts              # custom tools (crawl_listing, discover_brand, export_data)
├── skills/
│   └── goo-net-crawler/
│       └── SKILL.md          # crawl instructions for pi
├── src/
│   ├── types.ts              # TypeScript interfaces (VehicleRecord, CrawlConfig, etc.)
│   ├── exa-client.ts         # Exa API wrapper (batch contents, discovery)
│   ├── extractor.ts          # LLM extraction prompts + schema
│   ├── translator.ts         # JP→EN translation prompts
│   ├── normalizer.ts         # price/mileage parsing (万円→JPY, 万km→km)
│   ├── exporter.ts           # JSON/CSV/SQLite export
│   └── utils.ts              # URL helpers, text cleaning
├── templates/
│   ├── extract-prompt.md     # extraction system prompt
│   └── translate-prompt.md   # translation system prompt
├── docs/
│   ├── research.md           # alternatives evaluation
│   └── PLAN.md               # this file
└── tests/
    ├── extractor.test.ts     # extraction accuracy tests
    ├── normalizer.test.ts    # price/mileage parsing tests
    └── fixtures/             # sample goo-net HTML/markdown
```

## Architecture Decision

**Pattern: "Tool fetches, agent reasons"**

Extension tools cannot call pi's built-in tools (Exa) or LLM from `execute()`. Two options:

1. **Tool fetches, agent reasons** (chosen)
   - `fetch_listing` tool calls Exa REST API directly via `fetch()`
   - Returns raw markdown to pi's agent
   - SKILL.md instructs agent to extract/translate using its own reasoning
   - Simpler, proven, no `ctx.model` hacking

2. **All-in-one tool** (rejected)
   - Tool calls Exa REST + `ctx.model.generate()` for extraction
   - `ctx.model` callable pattern undocumented/risky
   - Higher complexity, harder to debug

Parallel extraction = agent-level (subagent fan-out per SKILL.md), not tool-level.

---

## Phases

### Phase 1: Scaffold + Install Script
**Deliverable**: Project skeleton, `pi install` works, validates prerequisites.

- [ ] Init `package.json` with pi manifest
- [ ] Create `install.sh`:
  - Check `node >= 18`
  - Check `pi` CLI installed
  - Check Exa API key configured (`EXA_API_KEY` env or pi auth)
  - Check pi model available (any provider)
  - Run `npm install`
  - Print success/failure summary
- [ ] Create `README.md` with install + usage instructions
- [ ] Create `src/types.ts` with core interfaces

**Validation**: `pi install ./parser` succeeds, `pi list` shows package.

### Phase 1.5: Spike — Validate Exa REST from Tool
**Deliverable**: Proof that `fetch()` from extension `execute()` works.

- [ ] Single tool `test_exa_fetch`: calls `https://api.exa.ai/contents` via `fetch()`
- [ ] Passes `x-api-key` from `process.env.EXA_API_KEY`
- [ ] Returns markdown for one known goo-net URL
- [ ] Test in print mode: `pi -p "Use test_exa_fetch on URL X"`
- [ ] **GATE**: If this fails, pivot to skill-only approach (no custom tools, just SKILL.md + agent uses built-in exa_get_contents)

**Validation**: Tool returns non-empty markdown from goo-net.

### Phase 2: Exa Fetch Layer
**Deliverable**: Can fetch Goo-net pages as clean markdown via Exa REST API.

- [ ] `src/exa-client.ts`:
  - `fetchPage(url)` → clean markdown via `fetch("https://api.exa.ai/contents")`
  - `fetchBatch(urls[])` → batch fetch (up to 50 per request)
  - `discoverBrand(brandUrl)` → model pages via /contents + subpages
  - `discoverListings(modelUrl)` → detail URLs via /contents + subpages
  - Auth: `process.env.EXA_API_KEY` → `x-api-key` header
  - Rate limiting (respect 100 QPS /contents limit)
  - Retry with backoff on failures
- [ ] `src/utils.ts`: URL canonicalization, domain check

**Validation**: `fetchPage("https://www.goo-net.com/usedcar/spread/goo/...")` returns non-empty markdown with vehicle data visible.

### Phase 3: Extraction Prompts + Normalizer
**Deliverable**: Prompts and parsing logic for structured extraction.

**Note**: Extraction is done by pi's agent (not tool). Tool returns markdown → agent applies extraction prompt → agent returns JSON.

- [ ] `src/extractor.ts`:
  - `buildExtractionPrompt(markdown)` → prompt string for agent
  - `parseExtractedJSON(llmOutput)` → VehicleRecord with validation
  - Handles missing fields gracefully (null, not crash)
- [ ] `templates/extract-prompt.md`:
  - System prompt for structured extraction
  - Schema definition (field names, types, expected formats)
  - Examples of goo-net markdown → JSON
  - Referenced by SKILL.md for agent to use
- [ ] `src/normalizer.ts`:
  - `parsePrice("150万円")` → 1500000
  - `parseMileage("3.5万km")` → 35000
  - `parseMileage("50000km")` → 50000
  - `normalizeRecord(record)` → record with numeric fields added

**Validation**: Feed sample goo-net markdown to extraction prompt, get valid VehicleRecord with 15+ fields.

### Phase 4: Translation Prompts
**Deliverable**: Translation logic for Japanese fields.

**Note**: Translation also done by pi's agent, not tool.

- [ ] `src/translator.ts`:
  - `buildTranslationPrompt(record)` → prompt string
  - `parseTranslatedJSON(llmOutput)` → record with `_en` fields
  - Preserves original Japanese fields
- [ ] `templates/translate-prompt.md`:
  - Translation system prompt
  - Field mapping rules (proper nouns, dates, addresses)
  - Referenced by SKILL.md

**Validation**: Japanese VehicleRecord → English-enriched VehicleRecord.

### Phase 5: Export
**Deliverable**: Multi-format export.

- [ ] `src/exporter.ts`:
  - `exportJSON(records, path)` — pretty-printed JSON
  - `exportCSV(records, path)` — UTF-8 BOM for Excel compat
  - `exportSQLite(records, path, table)` — dynamic schema, JSON for nested fields
  - `exportURLs(urls, path)` — plain text URL list
- [ ] Handle encoding: UTF-8 for JSON/CSV, proper SQLite TEXT columns

**Validation**: Export 10 records to all 3 formats, import CSV in Excel/Numbers, query SQLite.

### Phase 6: Pi Extension Tools
**Deliverable**: Custom tools registered in pi, usable via `pi -p`.

- [ ] `extensions/index.ts`:
  - `fetch_listing` tool: fetch one URL via Exa REST, return raw markdown
  - `fetch_listings` tool: batch fetch multiple URLs, return markdown array
  - `discover_brand` tool: find all model/detail URLs for a brand
  - `export_data` tool: export records to JSON/CSV/SQLite
  - Each tool calls Exa REST API directly via `fetch()`
  - Each tool uses `onUpdate` for progress reporting
  - Auth via `process.env.EXA_API_KEY`
  - Error handling: partial failures don't abort batch
- [ ] Tools return data; extraction/translation done by agent per SKILL.md

**Validation**: `pi -p "Use fetch_listing on URL X"` returns markdown. `pi -p "Use discover_brand for SUBARU"` returns URL list.

### Phase 7: Skill File
**Deliverable**: SKILL.md teaches pi how to use the crawler tools and do extraction/translation.

- [ ] `skills/goo-net-crawler/SKILL.md`:
  - Frontmatter: name, description
  - Phase 1: Use `discover_brand` tool to find URLs
  - Phase 2: Use `fetch_listings` tool to get markdown (batch)
  - Phase 3: Extract structured fields from markdown using `templates/extract-prompt.md`
  - Phase 4: Translate Japanese fields using `templates/translate-prompt.md`
  - Phase 5: Normalize prices/mileage using `src/normalizer.ts` logic
  - Phase 6: Use `export_data` tool to save results
  - Parallel subagent guidance: use `subagent({ tasks: [...], concurrency: 4 })` for extraction fan-out
  - Error recovery: partial failures OK, continue batch
  - Export format options: JSON, CSV, SQLite
- [ ] Register as `/goo-net-crawler` command

**Validation**: `/goo-net-crawler SUBARU max 20` in interactive pi works end-to-end.

### Phase 8: Install Script Polish
**Deliverable**: One-command setup.

- [ ] `install.sh`:
  - Detect platform (macOS/Linux)
  - Validate all prerequisites with clear error messages
  - Offer to set `EXA_API_KEY` if missing
  - Test Exa connectivity (`exa_search` test query)
  - Test pi model availability
  - Print usage examples on success
- [ ] Add `npm postinstall` hook that runs validation
- [ ] Add `npm scripts`: `test`, `check`, `clean`

**Validation**: Fresh clone → `bash install.sh` → ready to use.

### Phase 9: Tests + Fixtures
**Deliverable**: Test coverage for core logic.

- [ ] `tests/fixtures/`: 3-5 sample goo-net markdown pages
- [ ] `tests/normalizer.test.ts`: price/mileage edge cases
- [ ] `tests/extractor.test.ts`: extraction accuracy against fixtures
- [ ] `tests/exporter.test.ts`: format correctness

**Validation**: `npm test` passes.

## Dependencies

### Runtime
- None (pi provides Exa access, LLM, file I/O, bash)

### Dev
- `typescript` — type checking
- `vitest` — tests
- `@types/node` — Node.js types
- `tsx` — run .ts files directly for testing

### Peer (pi core, not bundled)
- `@mariozechner/pi-coding-agent": "*"`
- `@mariozechner/pi-ai": "*"`
- `typebox: "*"`

## Risks

| Risk | Mitigation |
|------|-----------|
| Goo-net blocks Exa requests | Test early; fallback to direct fetch with headers |
| LLM extraction misses fields | Prompt engineering + validation + retry |
| Exa /contents batch size limit | Chunk requests to 50 URLs max |
| Rate limiting on large crawls | Throttle to 50 QPS, add sleep between batches |
| Japanese encoding issues | Exa returns UTF-8 markdown; no encoding handling needed |
| Pi model unavailable | Validate in install.sh; suggest fallback providers |

## Cost Estimate

For 1000 listings:
- Exa /contents: ~$1 (1k pages at $1/1k)
- Exa /search (discovery): ~$0.07 (10 searches)
- Pi LLM extraction: $0 (included in pi model cost)
- Pi LLM translation: $0 (included in pi model cost)
- **Total: ~$1.07 for 1000 listings**

vs Firecrawl: $5.33–83/mo
vs Crawl4AI + separate LLM: $0.50–2 + infra costs
