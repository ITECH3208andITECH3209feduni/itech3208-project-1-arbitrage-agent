# Changelog

## [0.1.0] - 2026-04-30

### Added
- Initial release
- CLI: `goo-net-crawler --brand <name> --max <n> --out <dir>`
- Library: `import { crawl } from "goo-net-crawler"`
- Batch fetch via Exa API with retries and backoff
- URL discovery via Exa search and subpage crawling
- LLM extraction of 15+ vehicle fields from Goo-net listings
- Automatic Japanese → English translation of extracted fields
- Price/mileage parsing from Japanese notation (万円, 万km)
- JSON export with pretty-printing
- Headless pi SDK session management