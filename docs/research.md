# Research Notes

## Alternatives Evaluated

### Firecrawl /extract
- LLM-driven structured extraction from web pages
- Glob-based domain crawling (`/*`)
- $83/mo for 100k pages, credit-based
- Managed infra, zero ops
- **Verdict**: Too expensive at scale, vendor lock-in

### Crawl4AI (64k+ stars, Apache 2.0)
- Playwright-based, Python
- LLMExtractionStrategy + Pydantic schemas
- Adaptive crawling, anti-bot, virtual scroll
- Self-hosted, $0 + LLM API costs
- **Verdict**: Best OSS option but Python, heavy infra (Playwright/Docker)

### ScrapeGraphAI (23k stars, MIT)
- Graph-based LLM extraction pipelines
- Natural language → structured JSON
- Self-hosted, pay own LLM costs
- **Verdict**: Good extraction but no crawling built-in

### Scrapling (BSD-3)
- Adaptive selectors, anti-bot
- CSS/XPath only, no LLM extraction
- **Verdict**: Resilient scraping but no structured extraction

## Chosen Approach: Pi Native

Use pi's existing infrastructure:
- **Exa** for web fetching (handles JS, proxies, caching, clean markdown)
- **Pi's LLM** for structured extraction + translation (already paid)
- **Pi subagents** for parallel fan-out
- **Pi skills** for crawl configuration (no-code)
- **Pi extensions** for custom tools (TypeScript)

### Why
- $0 additional cost (pi model + Exa already configured)
- No new dependencies (Playwright, Docker, etc.)
- LLM adapts to layout changes automatically
- Translation is free (same model)
- Parallel via subagents
- Distributable as pi package

## Exa API Details

### Pricing (per 1k requests)
- Search: $7 (includes 10 results)
- Contents: $1/1k pages
- AI Summaries: $1/1k pages
- Free tier: 1,000 requests/month

### Rate Limits
- /search: 10 QPS
- /contents: 100 QPS (high throughput)
- /findSimilar: 10 QPS

### Batch Support
- POST /contents accepts `urls: string[]` — batch in single request
- `subpages` + `subpageTarget` for domain-level discovery
- `maxAgeHours`: 0=livecrawl, -1=cache-only

## Pi Package Structure

```json
{
  "name": "pi-goo-net-crawler",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"]
  }
}
```

- Extensions load raw `.ts` via jiti (no compile step)
- Skills are `SKILL.md` with YAML frontmatter
- `pi install npm:pkg` or `pi install git:github.com/user/repo`
- `postinstall` script for setup validation
- peerDependencies for pi core: `"*"` range

## Pi Extension Tool Pattern

```typescript
import { Type } from "typebox";
import { StringEnum } from "@mariozechner/pi-ai";

pi.registerTool({
  name: "tool_name",
  label: "Tool Label",
  description: "Shown to LLM",
  parameters: Type.Object({ ... }),
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    return { content: [{ type: "text", text: "result" }], details: {} };
  },
});
```
