import { useMemo, useState } from "react";

type Kind = "entry" | "external" | "data" | "logic" | "ui" | "test";
type Tag = "ingest" | "backend" | "ui";

type Node = {
  id: string;
  x: number;
  y: number;
  kind: Kind;
  file: string;
  title: string;
  desc: string;
  tags: Tag[];
  detail: string;
};

type Edge = [from: string, to: string, label: string];

const colors: Record<Kind, string> = {
  entry: "#111111",
  external: "#111111",
  data: "#4fb361",
  logic: "#ef4e1b",
  ui: "#111111",
  test: "#8a867d",
};

const nodes: Node[] = [
  { id: "env", x: 40, y: 55, kind: "entry", file: ".env / process.env", title: "Runtime config", desc: "API keys and Convex URLs gate external integrations.", tags: ["ingest", "backend", "ui"], detail: "Environment provides EXA_API_KEY, OPENROUTER_API_KEY, CONVEX_URL, CONVEX_INGEST_SECRET, and VITE_CONVEX_URL." },
  { id: "cli", x: 300, y: 55, kind: "entry", file: "src/goonet-crawler-example.ts / src/autotrader-crawler-example.ts", title: "CLI crawl commands", desc: "pnpm crawl:* parses flags then calls source crawler.", tags: ["ingest"], detail: "Thin executable wrappers for ad-hoc runs. Handles --brand, --model, --brand-url, --url, and --max." },
  { id: "api", x: 560, y: 55, kind: "entry", file: "src/index.ts", title: "Library API", desc: "Exports source crawlers and lower-level building blocks.", tags: ["ingest"], detail: "Public package surface for crawlGoonet(), crawlAutotrader(), discover(), fetchBatch(), prompt(), exportToConvex(), brands, and types." },
  { id: "crawler", x: 820, y: 55, kind: "logic", file: "src/goonetCrawler.ts / src/autotraderCrawler.ts / src/crawlPipeline.ts", title: "Source crawlers + shared pipeline", desc: "discover → fetch → LLM → normalize → export.", tags: ["ingest"], detail: "Source-specific discovery/prompts feed shared pipeline. Pipeline batches LLM extraction, tracks failures, validates, normalizes, and exports records." },

  { id: "brands", x: 40, y: 230, kind: "data", file: "src/brands.ts", title: "Brand pages", desc: "Known Goo-net brand aggregator URLs.", tags: ["ingest"], detail: "Seed pages used when the user passes a brand instead of a direct Goo-net URL." },
  { id: "exa", x: 300, y: 230, kind: "external", file: "src/exa.ts + api.exa.ai", title: "Exa discovery/fetch", desc: "Finds listing URLs and fetches markdown/images.", tags: ["ingest"], detail: "discover() uses Exa subpages. fetchBatch() chunks URLs and returns per-URL markdown plus errors." },
  { id: "utils", x: 560, y: 230, kind: "logic", file: "src/utils.ts", title: "URL utilities", desc: "Filters Goo-net URLs and canonicalizes dedupe keys.", tags: ["ingest"], detail: "Protects discovery quality and lets crawler compare discovered URLs with extracted URLs." },
  { id: "prompts", x: 820, y: 230, kind: "data", file: "src/prompts.ts", title: "Extraction prompts", desc: "Structured extraction and translation instructions.", tags: ["ingest"], detail: "Prompt text enumerates VehicleRecord fields and Japanese → English translation rules." },
  { id: "llm", x: 1080, y: 230, kind: "external", file: "src/llm.ts + OpenRouter", title: "OpenRouter LLM", desc: "OpenAI-compatible chat completion client.", tags: ["ingest"], detail: "Uses OPENROUTER_API_KEY and model env var. Returns raw JSON-ish extraction text." },

  { id: "types", x: 40, y: 465, kind: "data", file: "src/types.ts", title: "VehicleRecord types", desc: "Shared listing shape across crawler, storage, UI.", tags: ["ingest", "backend", "ui"], detail: "Defines raw fields, translated fields, normalized numerics, images, timestamps, and optional auction metadata." },
  { id: "normalizer", x: 300, y: 465, kind: "logic", file: "src/normalizer.ts + mileage.ts", title: "Normalizer", desc: "Parses price/mileage and fills defaults.", tags: ["ingest"], detail: "parsePrice handles 万円/円 and placeholders. parseMileageToKm handles Japanese mileage strings." },
  { id: "exporter", x: 560, y: 465, kind: "logic", file: "src/convexExporter.ts", title: "Convex exporter", desc: "Calls api.vehicles.upsertMany with secret.", tags: ["ingest", "backend"], detail: "ConvexHttpClient writes normalized records to Convex. Empty batches are no-op." },
  { id: "schema", x: 820, y: 465, kind: "data", file: "convex/schema.ts", title: "Convex schema", desc: "vehicles table and indexes.", tags: ["backend"], detail: "Schema mirrors VehicleRecord plus updatedAt. by_url supports idempotent upserts." },
  { id: "vehicles", x: 1080, y: 465, kind: "logic", file: "convex/vehicles.ts", title: "Vehicles functions", desc: "upsertMany mutation and list/getByUrl queries.", tags: ["backend", "ui"], detail: "upsertMany checks shared secret, patches existing rows by URL, or inserts new rows. list feeds UI." },
  { id: "convexdb", x: 820, y: 705, kind: "data", file: "Convex cloud", title: "Convex database", desc: "Persistent live vehicle table.", tags: ["backend", "ui"], detail: "Source of truth for browser subscriptions. Updated by crawler export." },
  { id: "react", x: 1080, y: 705, kind: "ui", file: "src/ui/main.tsx", title: "React auction UI", desc: "Convex subscriptions, filters, sort, modal.", tags: ["ui"], detail: "Transforms rows into ViewVehicle with make/model, AUD price, fees, resale, profit, and auction number." },
  { id: "rate", x: 1320, y: 705, kind: "external", file: "src/exchangeRate.ts", title: "JPY→AUD rates", desc: "Fetches/caches conversion for UI profit math.", tags: ["ui"], detail: "getJpyAudRate() supplies conversion rate; convertJpyToAud() maps JPY listing price to AUD." },
  { id: "vite", x: 1080, y: 895, kind: "entry", file: "index.html / vite.config.ts", title: "Vite app shell", desc: "pnpm dev/build serves React UI.", tags: ["ui"], detail: "Browser entry renders #root. Vite builds the React app and CSS." },
  { id: "tests", x: 1320, y: 895, kind: "test", file: "tests/*.test.ts", title: "Vitest coverage", desc: "Crawler, Exa, exporter, normalizer, rates.", tags: ["ingest", "backend", "ui"], detail: "Validation suite covers parsing, mocked external wrappers, and pipeline accounting." },
];

const edges: Edge[] = [
  ["env", "crawler", "env"], ["env", "exa", "EXA key"], ["env", "llm", "OpenRouter key"], ["env", "exporter", "Convex URL + secret"], ["env", "react", "VITE URL"],
  ["cli", "api", "imports"], ["api", "crawler", "crawlGoonet()/crawlAutotrader()"], ["crawler", "exa", "discover/fetch"], ["brands", "exa", "seed pages"], ["utils", "exa", "filter"], ["utils", "crawler", "dedupe"],
  ["crawler", "prompts", "build prompt"], ["prompts", "llm", "instructions"], ["crawler", "llm", "batch markdown"], ["llm", "crawler", "JSON array"],
  ["crawler", "normalizer", "records"], ["types", "crawler", "types"], ["types", "normalizer", "types"], ["normalizer", "exporter", "VehicleRecord[]"], ["exporter", "vehicles", "mutation"],
  ["schema", "vehicles", "tables/indexes"], ["vehicles", "convexdb", "upsert/query"], ["convexdb", "react", "subscriptions"], ["vehicles", "react", "api.vehicles.list"],
  ["rate", "react", "AUD math"], ["vite", "react", "mounts app"], ["tests", "crawler", "validate"], ["tests", "normalizer", "validate"], ["tests", "exporter", "validate"], ["tests", "exa", "validate"],
];

function center(node: Node) {
  return { x: node.x + 105, y: node.y + 59 };
}

function edgePath(from: Node, to: Node) {
  const a = center(from);
  const b = center(to);
  const midX = Math.round((a.x + b.x) / 2);
  return `M ${a.x} ${a.y} H ${midX} V ${b.y} H ${b.x}`;
}

function graphSets(selectedId: string | null) {
  const upstream = new Set<string>();
  const downstream = new Set<string>();
  if (!selectedId) return { upstream, downstream };

  let changed = true;
  while (changed) {
    changed = false;
    for (const [from, to] of edges) {
      if ((to === selectedId || upstream.has(to)) && from !== selectedId && !upstream.has(from)) {
        upstream.add(from);
        changed = true;
      }
      if ((from === selectedId || downstream.has(from)) && to !== selectedId && !downstream.has(to)) {
        downstream.add(to);
        changed = true;
      }
    }
  }
  return { upstream, downstream };
}

export function ArchitectureFlowchart() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | Tag>("all");
  const [query, setQuery] = useState("");

  const selected = nodes.find((node) => node.id === selectedId) ?? null;
  const sets = useMemo(() => graphSets(selectedId), [selectedId]);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), []);
  const normalizedQuery = query.trim().toLowerCase();

  const visible = (node: Node) => {
    const haystack = `${node.title} ${node.file} ${node.desc} ${node.kind}`.toLowerCase();
    return (filter === "all" || node.tags.includes(filter)) && (!normalizedQuery || haystack.includes(normalizedQuery));
  };

  const incoming = selected ? edges.filter(([, to]) => to === selected.id).map(([from]) => nodeById.get(from)?.title).filter(Boolean) : [];
  const outgoing = selected ? edges.filter(([from]) => from === selected.id).map(([, to]) => nodeById.get(to)?.title).filter(Boolean) : [];

  return (
    <div className="arch-page">
      <header className="arch-header">
        <div>
          <h1>goo-net-crawler architecture</h1>
          <div className="arch-sub">Interactive React flowchart · sharp system map · live filters</div>
        </div>
        <div className="arch-toolbar">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search nodes / files" />
          {(["all", "ingest", "backend", "ui"] as const).map((item) => (
            <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>
          ))}
          <button onClick={() => { setSelectedId(null); setFilter("all"); setQuery(""); }}>Reset</button>
          <button onClick={() => { window.history.pushState(null, "", "/"); window.dispatchEvent(new PopStateEvent("popstate")); }}>App</button>
        </div>
      </header>

      <main className="arch-wrap">
        <section className="arch-stage">
          <div className="arch-canvas">
            <div className="arch-lane" style={{ top: 155 }} /><div className="arch-lane-label" style={{ top: 28 }}>Entry + configuration</div>
            <div className="arch-lane" style={{ top: 375 }} /><div className="arch-lane-label" style={{ top: 185 }}>Discovery / fetch / extraction</div>
            <div className="arch-lane" style={{ top: 610 }} /><div className="arch-lane-label" style={{ top: 405 }}>Normalize + persist</div>
            <div className="arch-lane-label" style={{ top: 642 }}>Live data + browser UI</div>
            <svg className="arch-edges" viewBox="0 0 1580 1020" aria-hidden="true">
              <defs>
                <marker id="arch-arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M2,2 L10,6 L2,10 Z" fill="#111111" /></marker>
                <marker id="arch-arrow-active" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M2,2 L10,6 L2,10 Z" fill="#ef4e1b" /></marker>
              </defs>
              {edges.map(([from, to, label]) => {
                const fromNode = nodeById.get(from);
                const toNode = nodeById.get(to);
                if (!fromNode || !toNode) return null;
                const active = selectedId && (from === selectedId || to === selectedId);
                const up = selectedId && sets.upstream.has(from) && (to === selectedId || sets.upstream.has(to));
                const down = selectedId && (from === selectedId || sets.downstream.has(from)) && sets.downstream.has(to);
                const a = center(fromNode);
                const b = center(toNode);
                return (
                  <g key={`${from}-${to}-${label}`}>
                    <path className={`arch-edge ${active ? "active" : ""} ${up ? "up" : ""} ${down ? "down" : ""}`} d={edgePath(fromNode, toNode)} markerEnd={active ? "url(#arch-arrow-active)" : "url(#arch-arrow)"} />
                    <text className={`arch-edge-label ${active ? "active" : ""}`} x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 8}>{label}</text>
                  </g>
                );
              })}
            </svg>
            {nodes.map((node) => {
              const focus = selectedId === node.id;
              const upstream = selectedId ? sets.upstream.has(node.id) : false;
              const downstream = selectedId ? sets.downstream.has(node.id) : false;
              const dim = !visible(node) || (Boolean(selectedId) && !focus && !upstream && !downstream);
              return (
                <button
                  type="button"
                  key={node.id}
                  className={`arch-node ${focus ? "focus" : ""} ${upstream ? "upstream" : ""} ${downstream ? "downstream" : ""} ${dim ? "dim" : ""}`}
                  style={{ left: node.x, top: node.y }}
                  onClick={() => setSelectedId(node.id)}
                >
                  <span className="arch-kind"><span className="arch-dot" style={{ background: colors[node.kind] }} />{node.kind}</span>
                  <span className="arch-title">{node.title}</span>
                  <span className="arch-file">{node.file}</span>
                  <span className="arch-desc">{node.desc}</span>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="arch-side">
          <h2>{selected?.title ?? "Select node"}</h2>
          <div className="arch-pillrow">
            {selected ? <>
              <span className="arch-pill">{selected.kind}</span>
              <span className="arch-pill">{selected.file}</span>
              {selected.tags.map((tag) => <span className="arch-pill" key={tag}>{tag}</span>)}
            </> : <><span className="arch-pill">Click any box</span><span className="arch-pill">Edges highlight</span></>}
          </div>
          <div className="arch-detail">
            {selected ? <>
              <p>{selected.detail}</p>
              <p><b>Inputs:</b> {incoming.length ? incoming.join(", ") : "none"}</p>
              <p><b>Outputs:</b> {outgoing.length ? outgoing.join(", ") : "none"}</p>
            </> : <p><b>Main path:</b> CLI/API calls source crawler, Exa discovers and fetches pages, OpenRouter extracts vehicle JSON, shared pipeline validates and normalizes records, Convex upserts by URL, React subscribes to Convex and renders auction-style listings.</p>}
          </div>
          <div className="arch-legend">
            <h3>Legend</h3>
            <div><span className="arch-dot" style={{ background: colors.entry }} /> Entry / API</div>
            <div><span className="arch-dot" style={{ background: colors.external }} /> External service</div>
            <div><span className="arch-dot" style={{ background: colors.data }} /> Data / storage</div>
            <div><span className="arch-dot" style={{ background: colors.logic }} /> Transform / logic</div>
            <div><span className="arch-dot" style={{ background: colors.ui }} /> UI</div>
          </div>
          <div className="arch-hint">Yellow/orange = upstream. Green = downstream. Labels appear only on selected-node edges.</div>
        </aside>
      </main>
    </div>
  );
}
