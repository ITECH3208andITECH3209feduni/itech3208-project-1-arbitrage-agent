import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient, useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { convertJpyToAud, getJpyAudRate } from "../exchangeRate";
import { normalizeYear } from "../year";
import { estimateResaleAud } from "../profitEstimator";
import { parseAnalystComparables, type AnalystComparable } from "../analystData";
import type { VehicleRecord } from "../types";
import { ArchitectureFlowchart } from "./ArchitectureFlowchart";
import { estimateFreshness, presentAuthoritativeEstimate } from "./vehiclePresentation";
import "./styles.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;

type Vehicle = {
  _id: string;
  url: string;
  title: string;
  price: number | null;
  mileage: number | null;
  year: number | null;
  engineSize: string;
  transmission: string;
  driveType: string;
  fuelType: string;
  color: string;
  bodyType: string;
  doors: number | null;
  seats: number | null;
  dealer: string;
  location: string;
  images: string[];
  auctionSheetImages?: string[];
  auctionNumber?: string;
  auctionHouse?: string;
  registrationYear?: number | null;
  chassisNumber?: string;
  inspectorNotes?: string;
  exteriorGrade?: string;
  exteriorGradeDescription?: string;
  interiorGrade?: string;
  interiorGradeDescription?: string;
  mileageWarning?: string;
  ownershipHistory?: string;
  auctionSalesPoints?: string[];
  damageCodes?: string[];
  soldStatus?: "sold" | "unsold" | "unknown";
  auctionEndTime?: string;
  lastBidAt?: string;
  buildDate?: string;
  estimatedProfitAud?: number | null;
  estimatedResaleAud?: number | null;
  estimatedResaleLowAud?: number | null;
  estimatedResaleHighAud?: number | null;
  importCostAud?: number | null;
  landedCostAud?: number | null;
  startingCostAud?: number | null;
  driveawayCostAud?: number | null;
  exchangeRateUsed?: number | null;
  costWarnings?: string[] | null;
  complianceWarnings?: string[] | null;
  landedCostBreakdown?: Record<string, { amount: number; confidence: string; source: string }> | null;
  complianceBreakdown?: Record<string, { amount: number; confidence: string; source: string }> | null;
  resaleConfidence?: number | null;
  resaleConfidenceLabel?: "low" | "medium" | "high";
  resaleConfidenceReasons?: string[] | null;
  purchaseAud?: number | null;
  extractedAt?: string;
  updatedAt?: string;
  market?: "JP" | "AU";
  source?: string;
  sourceType?: "auction" | "dealer" | "classified";
  currency?: "JPY" | "AUD";
  make?: string;
  model?: string;
};

type ViewVehicle = Vehicle & {
  make: string;
  model: string;
  audPrice: number | null;
  importFees: number | null;
  resale: number | null;
  profit: number | null;
  auctionNo: string;
  resaleLow: number | null;
  resaleHigh: number | null;
  confidence: number | null;
  confidenceLabel: "low" | "medium" | "high" | null;
  comparableCount: number | null;
  basis: "asking" | "sold" | "mixed" | null;
  confidenceReasons: string[];
  lastChecked?: string;
  stale: boolean;
};

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++)
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function fmtAUD(n: number | null | undefined) {
  return n == null ? "-" : `$${Math.round(n).toLocaleString("en-AU")}`;
}
function fmtKm(n: number | null | undefined) {
  return n == null ? "-" : `${Number(n).toLocaleString()}km`;
}
function fmtDate(d?: string) {
  return d
    ? new Date(d).toLocaleDateString("en-AU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "-";
}
function sameStrings(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function normalizedSource(source?: string) {
  return (source || "goo-net").toLowerCase().replace(/[^a-z0-9]+/g, "");
}
function sourcePrefix(source?: string) {
  const normalized = normalizedSource(source);
  if (normalized.includes("autotrader")) return "AUTOTRADER";
  if (normalized.includes("goo")) return "GOONET";
  if (normalized.includes("prestige")) return "PRESTIGE";
  return normalized.toUpperCase() || "SOURCE";
}
type ListingSource = "goonet" | "autotrader" | "prestigemotorsport";
function isSource(v: Vehicle, source: ListingSource) {
  const normalized = normalizedSource(v.source);
  if (source === "autotrader") return normalized.includes("autotrader");
  if (source === "prestigemotorsport") return normalized.includes("prestige");
  return normalized.includes("goo");
}
function userError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const uncaught = message.match(/Uncaught Error: ([\s\S]*?)(?:\n\s*at |$)/);
  return (uncaught?.[1] ?? message)
    .replace(/^\[CONVEX[^\]]+\]\s*/i, "")
    .replace(/\s+Called by client\s*$/i, "")
    .trim();
}
function timeAgo(iso?: string) {
  if (!iso) return "-";
  const mins = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 60) return `${mins || 1}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}
function countdown(iso?: string) {
  if (!iso) return "-";
  const seconds = Math.max(
    0,
    Math.floor((Date.parse(iso) - Date.now()) / 1000),
  );
  if (!seconds) return "Expired";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function toView(v: Vehicle, rate: number, analystComparables: readonly AnalystComparable[] = []): ViewVehicle {
  const authoritative = presentAuthoritativeEstimate(v);
  const localResale = v.market === "JP" && analystComparables.length
    ? estimateResaleAud(v as unknown as VehicleRecord, analystComparables as unknown as VehicleRecord[], { now: new Date() })
    : null;
  const estimate = localResale ? {
    resale: localResale.estimatedResaleAud,
    low: localResale.estimatedResaleLowAud,
    high: localResale.estimatedResaleHighAud,
    profit: v.purchaseAud == null || v.importCostAud == null ? null : Math.round((localResale.estimatedResaleAud - v.purchaseAud - v.importCostAud) * 100) / 100,
    confidence: Math.round(localResale.resaleConfidence * 100),
    confidenceLabel: localResale.resaleConfidenceLabel,
    comparableCount: localResale.resaleComparableCount,
    basis: localResale.resaleBasis,
    reasons: [...localResale.resaleConfidenceReasons, "Analyst-owned local data included"],
  } : authoritative;
  const audPrice = v.purchaseAud ?? (v.currency === "AUD" ? v.price : convertJpyToAud(v.price, rate));
  const lastChecked = v.updatedAt ?? v.extractedAt;
  return {
    ...v,
    make: v.make || "-",
    model: v.model || "-",
    audPrice,
    importFees: v.importCostAud ?? null,
    resale: estimate.resale,
    profit: estimate.profit,
    resaleLow: estimate.low,
    resaleHigh: estimate.high,
    confidence: estimate.confidence,
    confidenceLabel: estimate.confidenceLabel,
    comparableCount: estimate.comparableCount,
    basis: estimate.basis,
    confidenceReasons: estimate.reasons,
    lastChecked,
    stale: estimateFreshness(lastChecked).stale,
    auctionNo: v.auctionNumber ?? `${sourcePrefix(v.source)}-${String(hashStr(v.url)).slice(0, 9).padEnd(9, "0")}`,
  };
}

function App() {
  const [rate, setRate] = useState(0.0099);
  const [rateLabel, setRateLabel] = useState("loading");
  const [tick, setTick] = useState(0);
  const [sort, setSort] = useState("");
  const [search, setSearch] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minProfit, setMinProfit] = useState("");
  const [maxOdo, setMaxOdo] = useState("");
  const [trans, setTrans] = useState(["auto", "manual", "other"]);
  const [makes, setMakes] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [selected, setSelected] = useState<ViewVehicle | null>(null);
  const [bid, setBid] = useState("");
  const [scrapeSource, setScrapeSource] = useState<ListingSource>("goonet");
  const [scrapeBrand, setScrapeBrand] = useState("TOYOTA");
  const [scrapeModel, setScrapeModel] = useState("");
  const [scrapeYear, setScrapeYear] = useState("");
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scrapeMax, setScrapeMax] = useState("5");
  const [scrapeStatus, setScrapeStatus] = useState("");
  const [refreshingUrl, setRefreshingUrl] = useState<string | null>(null);
  const [refreshStatus, setRefreshStatus] = useState<{ url: string; message: string; error: boolean } | null>(null);
  const [scraping, setScraping] = useState(false);
  const [scrapeSeconds, setScrapeSeconds] = useState(0);
  const [requireSold, setRequireSold] = useState(true);
  const [auctionDate, setAuctionDate] = useState<"Today" | "Future" | "Past">("Past");
  const [japaneseOriginProof, setJapaneseOriginProof] = useState(false);
  const [modifiedVehicle, setModifiedVehicle] = useState(false);
  const [convertedToRhd, setConvertedToRhd] = useState(false);
  const [costInputs, setCostInputs] = useState<Record<string, string>>({});
  const costFields = [
    ["agentFeeAud", "Agent fee"], ["inlandTransportAud", "Japan inland transport"], ["exportPaperworkAud", "Export paperwork"],
    ["wharfHandlingAud", "Wharf/port handling"], ["customsBrokerageAud", "Customs brokerage"], ["biosecurityAud", "Biosecurity"], ["adrEngineeringAud", "ADR engineering"],
    ["registrationFee", "Registration"], ["tacFee", "TAC"], ["plateFee", "Plates"], ["ravAssessmentFee", "RAV assessment"],
  ] as const;
  const [analystComparables, setAnalystComparables] = useState<AnalystComparable[]>(() => {
    try { return parseAnalystComparables(window.localStorage.getItem("analyst-comparables") ?? "[]", "json"); } catch { return []; }
  });
  const FACETS_PAGE_SIZE = 500;
  type FacetPage = {
    makes: string[];
    modelsByMake: Record<string, string[]>;
    cursor?: string | null;
    isDone: boolean;
  };

  const scrapeVehicles = useAction(api.scrape.vehicles);
  const importAnalystSales = useMutation(api.analystSales.importBatch);
  const remoteAnalystSales = useQuery(api.analystSales.list, { limit: 1000 }) as AnalystComparable[] | undefined;
  const refreshVehicle = useAction(api.scrape.refreshVehicle);
  const allAnalystComparables = useMemo(() => {
    const combined = [...(remoteAnalystSales ?? []), ...analystComparables];
    const key = (sale: AnalystComparable) => [sale.make?.toLowerCase(), sale.model?.toLowerCase(), sale.price, sale.year ?? "", sale.mileage ?? ""].join("\u0000");
    return [...new Map(combined.map((sale) => [key(sale), sale])).values()];
  }, [remoteAnalystSales, analystComparables]);
  const [facetCursor, setFacetCursor] = useState<string | undefined>(undefined);
  const [loadedFacetCursor, setLoadedFacetCursor] = useState<string | null>(null);
  const [facetsDone, setFacetsDone] = useState(false);
  const [filtersInitialized, setFiltersInitialized] = useState(false);
  const [makeFilterTouched, setMakeFilterTouched] = useState(false);
  const [modelFilterTouched, setModelFilterTouched] = useState(false);
  const [allMakes, setAllMakes] = useState<string[]>([]);
  const [modelsByMake, setModelsByMake] = useState<Record<string, string[]>>({});
  const previousAllModelsRef = useRef<string[]>([]);
  const facets = useQuery(api.vehicles.facets, {
    cursor: facetCursor,
    limit: FACETS_PAGE_SIZE,
  }) as FacetPage | undefined;
  const goonetVehicles = useQuery(api.vehicles.list, {
    limit: 250,
    source: "goo-net",
  }) as Vehicle[] | undefined;
  const autotraderVehicles = useQuery(api.vehicles.list, {
    limit: 250,
    source: "autotrader",
  }) as Vehicle[] | undefined;
  const prestigeVehicles = useQuery(api.vehicles.list, {
    limit: 250,
    source: "prestigemotorsport",
  }) as Vehicle[] | undefined;
  const loading = goonetVehicles === undefined || autotraderVehicles === undefined || prestigeVehicles === undefined;
  const raw = useMemo(
    () => [...(goonetVehicles ?? []), ...(autotraderVehicles ?? []), ...(prestigeVehicles ?? [])],
    [goonetVehicles, autotraderVehicles, prestigeVehicles],
  );

  useEffect(() => {
    getJpyAudRate().then((c) => {
      setRate(c.rate);
      setRateLabel(new Date(c.cachedAt).toLocaleTimeString("en-AU"));
    });
  }, []);
  useEffect(() => {
    const id = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (!scraping) {
      setScrapeSeconds(0);
      return;
    }

    const id = window.setInterval(
      () => setScrapeSeconds((seconds) => seconds + 1),
      1000,
    );
    return () => window.clearInterval(id);
  }, [scraping]);

  const all = useMemo(() => raw.map((v) => toView(v, rate, allAnalystComparables)), [raw, rate, allAnalystComparables]);
  useEffect(() => {
    if (!selected) return;
    const current = all.find((vehicle) => vehicle._id === selected._id);
    if (current) setSelected(current);
  }, [all, selected?._id]);
  const loadedModelsByMake = useMemo(() => {
    const next: Record<string, string[]> = {};
    for (const vehicle of raw) {
      const make = vehicle.make?.trim();
      const model = vehicle.model?.trim();
      if (!make) continue;
      next[make] ??= [];
      if (model && !next[make].includes(model)) next[make].push(model);
    }
    for (const make of Object.keys(next)) next[make].sort();
    return next;
  }, [raw]);
  const availableModelsByMake = useMemo(() => {
    const next: Record<string, string[]> = {};
    for (const make of [...new Set([...Object.keys(modelsByMake), ...Object.keys(loadedModelsByMake)])]) {
      next[make] = [...new Set([...(modelsByMake[make] ?? []), ...(loadedModelsByMake[make] ?? [])])].sort();
    }
    return next;
  }, [modelsByMake, loadedModelsByMake]);
  const availableMakes = useMemo(
    () => [...new Set([...allMakes, ...Object.keys(loadedModelsByMake)])].sort(),
    [allMakes.join("|"), loadedModelsByMake],
  );
  const allModels = useMemo(
    () =>
      [
        ...new Set(
          (makes.length ? makes : availableMakes).flatMap(
            (make) => availableModelsByMake[make] ?? [],
          ),
        ),
      ].sort(),
    [availableMakes.join("|"), makes.join("|"), availableModelsByMake],
  );

  useEffect(() => {
    if (!facets) return;

    const currentCursor = facetCursor ?? null;
    if (loadedFacetCursor === currentCursor) return;
    setLoadedFacetCursor(currentCursor);

    setAllMakes((prev) => {
      const merged = [...new Set([...prev, ...facets.makes])].sort();
      return merged;
    });

    setModelsByMake((prev) => {
      const next: Record<string, string[]> = { ...prev };
      for (const [make, models] of Object.entries(facets.modelsByMake)) {
        const mergedSet = new Set([...(prev[make] ?? []), ...models]);
        next[make] = [...mergedSet].sort();
      }
      return next;
    });

    if (facets.isDone) {
      setFacetsDone(true);
    } else if (facets.cursor) {
      setFacetCursor(facets.cursor);
    }
  }, [facets, facetCursor, loadedFacetCursor]);

  useEffect(() => {
    if (makeFilterTouched || modelFilterTouched || !facetsDone) return;

    setMakes((prev) => (sameStrings(prev, availableMakes) ? prev : availableMakes));
    setModels((prev) => (sameStrings(prev, allModels) ? prev : allModels));
    setFiltersInitialized(true);
  }, [facetsDone, makeFilterTouched, modelFilterTouched, availableMakes.join("|"), allModels.join("|")]);

  useEffect(() => {
    const previousAllModels = previousAllModelsRef.current;
    previousAllModelsRef.current = allModels;

    if (!filtersInitialized && !makeFilterTouched && !modelFilterTouched) return;

    setModels((prev) => {
      const visibleModels = new Set(allModels);
      const hadAllVisibleModels =
        previousAllModels.length > 0 &&
        previousAllModels.every((model) => prev.includes(model));
      const next = hadAllVisibleModels
        ? allModels
        : prev.filter((model) => visibleModels.has(model));

      return next.length === prev.length && next.every((model, index) => model === prev[index])
        ? prev
        : next;
    });
  }, [allModels.join("|"), filtersInitialized, makeFilterTouched, modelFilterTouched]);

  const filtered = useMemo(() => {
    const minP = Number(minPrice) || 0,
      maxP = Number(maxPrice) || Infinity,
      minPr = Number(minProfit) || -Infinity,
      maxK = Number(maxOdo) || Infinity;
    const q = search.toLowerCase().trim();
    const f = all.filter((v) => {
      if (v.audPrice != null && (v.audPrice < minP || v.audPrice > maxP))
        return false;
      if (v.profit != null && v.profit < minPr) return false;
      if (v.mileage != null && v.mileage > maxK) return false;
      if (makeFilterTouched) {
        if (makes.length === 0) return false;
        const makeKey = v.make.toLowerCase();
        const selectedMakes = makes.map((make) => make.toLowerCase());
        if (!selectedMakes.includes(makeKey)) return false;
      }
      if (modelFilterTouched) {
        if (models.length === 0) return false;
        const modelKey = v.model.toLowerCase();
        const selectedModels = models.map((model) => model.toLowerCase());
        if (!selectedModels.includes(modelKey)) return false;
      }

      const t = v.transmission.toLowerCase();
      const isAuto = /(at|cvt|auto)/.test(t);
      const isManual = /(mt|manual)/.test(t);
      const okTrans =
        (trans.includes("auto") && isAuto) ||
        (trans.includes("manual") && isManual) ||
        (trans.includes("other") && !isAuto && !isManual);
      if (!okTrans) return false;
      if (
        q &&
        !(v.title + v.make + v.model + v.color + v.dealer + v.location)
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
    if (sort === "price-asc")
      f.sort((a, b) => (a.audPrice ?? 0) - (b.audPrice ?? 0));
    if (sort === "price-desc")
      f.sort((a, b) => (b.audPrice ?? 0) - (a.audPrice ?? 0));
    if (sort === "profit-desc")
      f.sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0));
    if (sort === "profit-asc")
      f.sort((a, b) => (a.profit ?? 0) - (b.profit ?? 0));
    if (sort === "mileage-asc")
      f.sort((a, b) => (a.mileage ?? 999999) - (b.mileage ?? 999999));
    if (sort === "year-desc") f.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    return f;
  }, [
    all,
    minPrice,
    maxPrice,
    minProfit,
    maxOdo,
    search,
    makes,
    models,
    makeFilterTouched,
    modelFilterTouched,
    trans,
    sort,
  ]);

  const goonetFiltered = useMemo(
    () => filtered.filter((vehicle) => isSource(vehicle, "goonet")),
    [filtered],
  );
  const autotraderFiltered = useMemo(
    () => filtered.filter((vehicle) => isSource(vehicle, "autotrader")),
    [filtered],
  );
  const prestigeFiltered = useMemo(
    () => filtered.filter((vehicle) => isSource(vehicle, "prestigemotorsport")),
    [filtered],
  );

  const toggle = (
    arr: string[],
    set: (v: string[]) => void,
    value: string,
    touch?: () => void,
  ) => {
    touch?.();
    set(arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value]);
  };
  const submitBid = () => {
    const n = Number(bid);
    if (!n) return alert("Please enter a valid bid amount.");
    alert(
      `Bid of ${fmtAUD(n)} AUD submitted!\n\nNote: This is a demo - no real bid was placed.`,
    );
    setBid("");
  };

  const refreshListing = async (url: string) => {
    if (refreshingUrl) return;
    setRefreshingUrl(url);
    setRefreshStatus(null);
    try {
      const result = await refreshVehicle({ url });
      const checked = result.updatedAt ? new Date(result.updatedAt).toLocaleString("en-AU") : "now";
      setRefreshStatus({ url, error: false, message: `Refresh successful. Updated ${checked}. Status: ${result.changed ? "changed" : "unchanged"}. Confidence: ${result.resaleConfidenceLabel ?? "not available"}. Comparables: ${result.resaleComparableCount}.` });
    } catch (err) {
      setRefreshStatus({ url, error: true, message: `Refresh failed: ${userError(err)}` });
    } finally {
      setRefreshingUrl(null);
    }
  };

  const renderVehicleCards = (items: ViewVehicle[], emptyText: string) => {
    if (loading) return <div className="loading">Loading vehicle listings...</div>;
    if (!items.length) return <div className="no-results">{emptyText}</div>;

    return items.map((v) => (
      <div
        className="card"
        key={v._id}
        role="button"
        tabIndex={0}
        onClick={() => setSelected(v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSelected(v);
          }
        }}
      >
        {v.images?.[0] ? (
          <img className="card-img" src={v.images[0]} alt="" loading="lazy" />
        ) : (
          <div className="card-img-placeholder">No Image</div>
        )}
        <div className="card-body">
          <div className="card-name">{v.title}</div>
          <div className="card-make">
            {v.make} {v.model}
          </div>
          <div className="card-rows">
            <Row l="Auction Number:" v={v.auctionNo} />
            <Row l="Current Auction Price:" v={fmtAUD(v.audPrice)} />
            <Row
              l="Estimated Profit at Price:"
              v={fmtAUD(v.profit)}
              cls={(v.profit ?? 0) >= 0 ? "profit-val" : "profit-neg"}
            />
            <Row l="Auction Time Remaining:" v={countdown(v.auctionEndTime)} />
            <Row l="Last Bid:" v={timeAgo(v.lastBidAt)} />
            <Row l="Odometer:" v={fmtKm(v.mileage)} />
            <Row l="Build Date:" v={v.buildDate ?? (v.year ? `${v.year}/01` : "-")} />
            <Row l="Last checked:" v={v.lastChecked ? fmtDate(v.lastChecked) : "-"} />
            <Row l="Confidence:" v={v.confidenceLabel ? `${v.confidenceLabel}${v.confidence == null ? "" : ` ${v.confidence}%`}` : "-"} />
          </div>
          {v.stale && <span className="stale-badge">Stale</span>}
          {isSource(v, "goonet") && <button
            type="button"
            className="refresh-button"
            disabled={refreshingUrl === v.url}
            aria-busy={refreshingUrl === v.url}
            onClick={(event) => { event.stopPropagation(); void refreshListing(v.url); }}
          >{refreshingUrl === v.url ? "Refreshing" : "Refresh"}</button>}
        </div>
      </div>
    ));
  };

  const runScrape = async (event: React.FormEvent) => {
    event.preventDefault();
    if (scraping) return;

    const max = Math.max(1, Math.min(100, Number(scrapeMax) || 5));
    const urls = scrapeUrl
      .split(/\s+/)
      .map((url) => url.trim())
      .filter(Boolean);
    const rawBrand = scrapeBrand.trim();
    const brand = rawBrand
      ? scrapeSource === "goonet"
        ? rawBrand.toUpperCase()
        : rawBrand
      : undefined;
    const model = scrapeModel.trim() || undefined;
    let year: number | undefined;
    try {
      year = normalizeYear(scrapeYear);
    } catch (err) {
      setScrapeStatus(userError(err));
      return;
    }
    const query = [brand, model, year].filter(Boolean).join(" ") || undefined;

    if (scrapeSource === "goonet" && !brand && urls.length === 0) {
      setScrapeStatus("Enter Goo-net brand or URL.");
      return;
    }
    if (scrapeSource === "autotrader" && !query && urls.length === 0) {
      setScrapeStatus("Enter Autotrader brand/model or URL.");
      return;
    }
    if (scrapeSource === "prestigemotorsport" && !brand && urls.length === 0) {
      setScrapeStatus("Enter Prestige Motorsport make or URL.");
      return;
    }
    if (scrapeSource === "prestigemotorsport" && !model && urls.length === 0) {
      setScrapeStatus("Enter a Prestige Motorsport model, make, or direct URL.");
      return;
    }
    const costOverrides = {
      ...Object.fromEntries(costFields.flatMap(([key]) => {
        const value = Number(costInputs[key]);
        return Number.isFinite(value) && value >= 0 ? [[key, value]] : [];
      })),
      japaneseOriginProof,
      modifiedVehicle,
      convertedToRhd,
    };
    setScraping(true);
    setScrapeStatus("Scraping… this can take a minute.");
    try {
      const result = await scrapeVehicles({
        source: scrapeSource,
        brand,
        model,
        brandUrl: scrapeSource === "goonet" ? urls[0] : undefined,
        query: scrapeSource === "autotrader" && urls.length === 0 ? query : undefined,
        urls: scrapeSource !== "goonet" && urls.length ? urls : undefined,
        year,
        auctionDate: scrapeSource === "prestigemotorsport" ? auctionDate : undefined,
        costOverrides,
        max,
        requireSold: scrapeSource === "prestigemotorsport" ? requireSold : undefined,
      });
      setScrapeStatus(`Done: ${result.upserted} saved, ${result.totalFailed} failed.`);
    } catch (err) {
      setScrapeStatus(userError(err));
    } finally {
      setScraping(false);
    }
  };

  return (
    <>
      <header className="top-bar">
        <div className="sort-group">
          <label>Sort Listings</label>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="">Select Sort</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="profit-desc">Est. Profit: High to Low</option>
            <option value="profit-asc">Est. Profit: Low to High</option>
            <option value="mileage-asc">Odometer: Low to High</option>
            <option value="year-desc">Year: Newest First</option>
          </select>
        </div>
        <h1 className="site-title">Arbitrage Agent</h1>
        <div className="search-group">
          <label>Search Live Auctions</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Here"
          />
        </div>
      </header>
      <div className={`refresh-announcement ${refreshStatus?.error ? "error" : ""}`} role="status" aria-live="polite">
        {refreshStatus?.message}
      </div>
      <div className="layout">
        <aside className="sidebar">
          <h2>Filters</h2>
          <div className="rate-note">
            JPY→AUD {rate.toFixed(6)} · cached {rateLabel}
          </div>
          <form className="scrape-panel" onSubmit={runScrape}>
            <h3>Scrape New Vehicles</h3>
            <select
              value={scrapeSource}
              onChange={(e) => setScrapeSource(e.target.value as ListingSource)}
            >
              <option value="goonet">Goo-net</option>
              <option value="autotrader">Autotrader</option>
              <option value="prestigemotorsport">Prestige Motorsport</option>
            </select>
            {scrapeSource === "prestigemotorsport" && <select value={auctionDate} onChange={(e) => setAuctionDate(e.target.value as "Today" | "Future" | "Past")} aria-label="Prestige auction date">
              <option value="Today">Today auctions</option>
              <option value="Future">Future auctions</option>
              <option value="Past">Past auctions</option>
            </select>}
            <input
              value={scrapeBrand}
              onChange={(e) => setScrapeBrand(e.target.value)}
              placeholder="Brand, e.g. Toyota"
            />
            <input
              value={scrapeModel}
              onChange={(e) => setScrapeModel(e.target.value)}
              placeholder={scrapeSource === "prestigemotorsport" ? "Model optional (or use URL)" : "Model optional"}
            />
            <input
              type="number"
              value={scrapeYear}
              onChange={(e) => setScrapeYear(e.target.value)}
              placeholder="Exact year optional"
            />
            <input
              value={scrapeUrl}
              onChange={(e) => setScrapeUrl(e.target.value)}
              placeholder={
                scrapeSource === "goonet"
                  ? "Optional Goo-net URL"
                  : scrapeSource === "autotrader"
                    ? "Optional Autotrader URL(s)"
                    : "Optional Prestige URL(s)"
              }
            />
            <div className="scrape-row">
            {scrapeSource === "prestigemotorsport" && <label className="check-item"><input type="checkbox" checked={requireSold} onChange={(e) => setRequireSold(e.target.checked)} /> Only confirmed sold listings</label>}
              <input
                type="number"
                min="1"
                max="100"
                value={scrapeMax}
                onChange={(e) => setScrapeMax(e.target.value)}
                aria-label="Max vehicles"
                disabled={scraping}
              />
              <button type="submit" disabled={scraping} aria-busy={scraping}>
                {scraping ? (
                  <span className="scrape-button-loading">
                    <span className="scrape-spinner" aria-hidden="true" />
                    Scraping
                  </span>
                ) : (
                  "Scrape"
                )}
              </button>
            </div>
            {scraping && (
              <div className="scrape-loading" role="status" aria-live="polite">
                <span className="scrape-spinner" aria-hidden="true" />
                <span>Scraper running</span>
                <span aria-hidden="true">· {scrapeSeconds}s</span>
              </div>
            )}
            {scrapeStatus && <p>{scrapeStatus}</p>}
          </form>
          <div className="filter-section cost-config-panel">
            <h3>Import and compliance inputs</h3>
            <p className="config-note">Optional values override defaults for the next scrape. Blank values remain estimates/warnings.</p>
            {costFields.map(([key, label]) => <input key={key} type="number" min="0" placeholder={`${label} AUD`} value={costInputs[key] ?? ""} onChange={(e) => setCostInputs((current) => ({ ...current, [key]: e.target.value }))} />)}
            <label className="check-item"><input type="checkbox" checked={japaneseOriginProof} onChange={(e) => setJapaneseOriginProof(e.target.checked)} /> Japanese origin proof (JAEPA)</label>
            <label className="check-item"><input type="checkbox" checked={modifiedVehicle} onChange={(e) => setModifiedVehicle(e.target.checked)} /> Modified vehicle</label>
            <label className="check-item"><input type="checkbox" checked={convertedToRhd} onChange={(e) => setConvertedToRhd(e.target.checked)} /> Converted to RHD</label>
          </div>
          <div className="filter-section analyst-panel">
            <h3>Analyst sale data</h3>
            <input type="file" accept=".csv,.json,application/json,text/csv" onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                const format = file.name.toLowerCase().endsWith(".json") ? "json" : "csv";
                const parsed = parseAnalystComparables(await file.text(), format);
                const importable = parsed.filter((sale): sale is AnalystComparable & { make: string; model: string; price: number } => sale.make != null && sale.model != null && sale.price != null);
                const batchId = globalThis.crypto?.randomUUID?.() ?? `analyst-${Date.now()}`;
                const result = await importAnalystSales({
                  batchId,
                  sales: importable.map(({ make, model, price, year, mileage, soldStatus }) => ({ make, model, price, year: year ?? null, mileage: mileage ?? null, soldStatus })),
                });
                setAnalystComparables(parsed);
                window.localStorage.setItem("analyst-comparables", JSON.stringify(parsed));
                setScrapeStatus(`Synced ${result.imported} analyst comparables to Convex; ${result.skipped} duplicates/invalid rows skipped.`);
              } catch (error) { setScrapeStatus(`Analyst file error: ${userError(error)}`); }
            }} />
            <small>{allAnalystComparables.length} analyst comparables synced from Convex; provenance remains separate from scraped data.</small>
          </div>
          <div className="ui-legend"><strong>Key</strong><span>Confidence: official rule = statutory; official but variable = fee varies; estimate = team default; manual input required = verify.</span><span>Auction sheet: exterior grade is condition (higher is better); interior A–D is trim condition; mileage warnings flag odometer reliability.</span></div>
          {[
            ["Min Price:", minPrice, setMinPrice, "Min Price Here"],
            ["Max Price:", maxPrice, setMaxPrice, "Max Price Here"],
            ["Min Estimated Profit:", minProfit, setMinProfit, "Enter $ Here"],
            ["Max Odometer", maxOdo, setMaxOdo, "Enter KM Here"],
          ].map(([label, value, setter, ph]) => (
            <div className="filter-section" key={label as string}>
              <h3>{label as string}</h3>
              <input
                className="filter-input"
                type="number"
                value={value as string}
                onChange={(e) =>
                  (setter as React.Dispatch<React.SetStateAction<string>>)(
                    e.target.value,
                  )
                }
                placeholder={ph as string}
              />
            </div>
          ))}
          <div className="filter-section">
            <div className="filter-title-row">
              <h3>Transmission:</h3>
              <div>
                <button type="button" onClick={() => setTrans(["auto", "manual", "other"])}>All</button>
                <button type="button" onClick={() => setTrans([])}>Clear</button>
              </div>
            </div>
            <div className="check-list">
              {[
                ["auto", "Auto"],
                ["manual", "Manual"],
                ["other", "Other"],
              ].map(([v, l]) => (
                <label className="check-item" key={v}>
                  <input
                    type="checkbox"
                    checked={trans.includes(v)}
                    onChange={() => toggle(trans, setTrans, v)}
                  />{" "}
                  {l}
                </label>
              ))}
            </div>
          </div>
          <div className="filter-section">
            <div className="filter-title-row">
              <h3>Make:</h3>
              <div>
                <button type="button" onClick={() => { setMakeFilterTouched(false); setMakes(availableMakes); }}>All</button>
                <button type="button" onClick={() => { setMakeFilterTouched(true); setMakes([]); }}>Clear</button>
              </div>
            </div>
            <div className="check-list">
              {availableMakes.map((m) => (
                <label className="check-item" key={m}>
                  <input
                    type="checkbox"
                    checked={makes.includes(m)}
                    onChange={() => toggle(makes, setMakes, m, () => setMakeFilterTouched(true))}
                  />{" "}
                  {m}
                </label>
              ))}
            </div>
          </div>
          <div className="filter-section">
            <div className="filter-title-row">
              <h3>Model</h3>
              <div>
                <button type="button" onClick={() => { setModelFilterTouched(false); setModels(allModels); }}>All</button>
                <button type="button" onClick={() => { setModelFilterTouched(true); setModels([]); }}>Clear</button>
              </div>
            </div>
            <div className="check-list">
              {allModels.map((m) => (
                <label className="check-item" key={m}>
                  <input
                    type="checkbox"
                    checked={models.includes(m)}
                    onChange={() => toggle(models, setModels, m, () => setModelFilterTouched(true))}
                  />{" "}
                  {m}
                </label>
              ))}
            </div>
          </div>
        </aside>
        <main>
          <div className="split-view">
            <section className="source-panel">
              <div className="grid-header">
                <h2>Goo-net</h2>
                <span className="count">
                  {loading
                    ? "Loading..."
                    : `${goonetFiltered.length} listing${goonetFiltered.length !== 1 ? "s" : ""}`}
                </span>
              </div>
              <div className="grid source-grid">
                {renderVehicleCards(goonetFiltered, "No Goo-net listings match your filters.")}
              </div>
            </section>
            <section className="source-panel">
              <div className="grid-header">
                <h2>Prestige Motorsport</h2>
                <span className="count">
                  {loading
                    ? "Loading..."
                    : `${prestigeFiltered.length} listing${prestigeFiltered.length !== 1 ? "s" : ""}`}
                </span>
              </div>
              <div className="grid source-grid">
                {renderVehicleCards(prestigeFiltered, "No Prestige Motorsport listings match your filters.")}
              </div>
            </section>
            <section className="source-panel">
              <div className="grid-header">
                <h2>Autotrader</h2>
                <span className="count">
                  {loading
                    ? "Loading..."
                    : `${autotraderFiltered.length} listing${autotraderFiltered.length !== 1 ? "s" : ""}`}
                </span>
              </div>
              <div className="grid source-grid">
                {renderVehicleCards(autotraderFiltered, "No Autotrader listings match your filters.")}
              </div>
            </section>
          </div>
        </main>
      </div>
      {selected && (
        <div
          className="modal-overlay open"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <div className="modal">
            <div className="modal-header">
              <h2>Auction Details</h2>
              <button
                type="button"
                className="modal-close"
                onClickCapture={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setSelected(null);
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setSelected(null);
                }}
                aria-label="Close auction details"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-col">
                {selected.images?.[0] ? (
                  <img
                    className="modal-car-img"
                    src={selected.images[0]}
                    alt=""
                  />
                ) : (
                  <div className="modal-car-img placeholder">No Image</div>
                )}
                {selected.auctionSheetImages?.length ? <div className="auction-gallery"><strong>Auction sheet images</strong><div>{selected.auctionSheetImages.map((image) => <img key={image} src={image} alt="Auction sheet" loading="lazy" />)}</div></div> : null}
                <div className="modal-section-title">Buyers Details</div>
                <Detail l="Auction Number:" v={selected.auctionNo} />
                <Detail
                  l="Current Price:"
                  v={fmtAUD(selected.audPrice)}
                  cls="price"
                />
                <Detail l="JPY→AUD rate used:" v={selected.exchangeRateUsed == null ? "-" : selected.exchangeRateUsed.toFixed(6)} />
                <Detail l="Est. Resale Price:" v={fmtAUD(selected.resale)} />
                <Detail l="Resale Range:" v={selected.resaleLow == null || selected.resaleHigh == null ? "-" : `${fmtAUD(selected.resaleLow)} - ${fmtAUD(selected.resaleHigh)}`} />
                <Detail l="Est. Import/Driveaway Costs:" v={fmtAUD(selected.importFees)} />
                <Detail l="Starting cost to Australia:" v={fmtAUD(selected.startingCostAud)} />
                <Detail l="Landed cost:" v={fmtAUD(selected.landedCostAud)} />
                <Detail l="Victorian driveaway:" v={fmtAUD(selected.driveawayCostAud)} />
                {selected.landedCostBreakdown && <div className="cost-breakdown"><strong>Landed cost breakdown</strong><ul>{Object.entries(selected.landedCostBreakdown).map(([name, item]) => <li key={`landed-${name}`}><span>{name}</span><span>{fmtAUD(item.amount)} <small>({item.confidence})</small></span></li>)}</ul></div>}
                {selected.complianceBreakdown && <div className="cost-breakdown"><strong>Victorian compliance breakdown</strong><ul>{Object.entries(selected.complianceBreakdown).map(([name, item]) => <li key={`compliance-${name}`}><span>{name}</span><span>{fmtAUD(item.amount)} <small>({item.confidence})</small></span></li>)}</ul></div>}
                <Detail
                  l="Est. Profit at Price:"
                  v={fmtAUD(selected.profit)}
                  cls={(selected.profit ?? 0) >= 0 ? "profit" : ""}
                />
                <Detail l="Confidence:" v={selected.confidenceLabel ? `${selected.confidenceLabel}${selected.confidence == null ? "" : ` (${selected.confidence}%)`}` : "-"} />
                <Detail l="Comparables:" v={selected.comparableCount == null ? "-" : String(selected.comparableCount)} />
                <Detail l="Basis:" v={selected.basis ?? "-"} />
                <Detail l="Last checked:" v={selected.lastChecked ? fmtDate(selected.lastChecked) : "-"} />
                {selected.stale && <span className="stale-badge">Stale</span>}
                {selected.confidenceReasons.length > 0 && <div className="estimate-reasons"><strong>Confidence reasons</strong><ul>{selected.confidenceReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>}
                <Detail
                  l="Auction Start Date:"
                  v={fmtDate(selected.lastBidAt)}
                />
                <Detail
                  l="Auction End Date:"
                  v={fmtDate(selected.auctionEndTime)}
                />
                <Detail l="Auction House:" v={selected.auctionHouse ?? selected.source ?? "-"} />
                <Detail l="Sale Status:" v={selected.soldStatus ?? "-"} />
                <Detail l="Most Recent Bid:" v={timeAgo(selected.lastBidAt)} />
                <Detail l="Min. Bid Increase:" v="$500" />
                <p className="est-note">*Estimated from Australian market comparables</p>
                {(selected.exteriorGrade || selected.interiorGrade || selected.ownershipHistory || selected.auctionSalesPoints?.length || selected.mileageWarning) && (
                  <div className="auction-sheet">
                    <div className="modal-section-title">Auction Sheet</div>
                    <Detail l="Exterior grade:" v={selected.exteriorGrade ? `${selected.exteriorGrade}${selected.exteriorGradeDescription ? ` — ${selected.exteriorGradeDescription}` : ""}` : "-"} />
                    <Detail l="Interior grade:" v={selected.interiorGrade ? `${selected.interiorGrade}${selected.interiorGradeDescription ? ` — ${selected.interiorGradeDescription}` : ""}` : "-"} />
                    <Detail l="Ownership history:" v={selected.ownershipHistory ?? "-"} />
                    <Detail l="Mileage note:" v={selected.mileageWarning ?? "-"} />
                    <Detail l="Registration year:" v={selected.registrationYear == null ? "-" : String(selected.registrationYear)} />
                    <Detail l="Chassis:" v={selected.chassisNumber ?? "-"} />
                    <Detail l="Inspector notes:" v={selected.inspectorNotes ?? "-"} />
                    <Detail l="Damage codes:" v={selected.damageCodes?.join(", ") ?? "-"} />
                    {selected.auctionSalesPoints?.length ? <div className="sheet-points"><strong>Equipment and sales points</strong><ul>{selected.auctionSalesPoints.map((point) => <li key={point}>{point}</li>)}</ul></div> : null}
                  </div>
                )}
              </div>
              <div className="modal-col">
                <div className="modal-section-title">Car Details</div>
                {[
                  ["Name:", selected.title],
                  ["Make:", selected.make],
                  ["Model:", selected.model],
                  ["Series:", selected.title],
                  [
                    "Build Date:",
                    selected.buildDate ??
                      (selected.year ? `${selected.year}/01` : "-"),
                  ],
                  ["Odometer:", fmtKm(selected.mileage)],
                  ["Body:", selected.bodyType],
                  ["Transmission:", selected.transmission],
                  ["Engine:", selected.engineSize],
                  ["Fuel Type:", selected.fuelType],
                  ["Drive Type:", selected.driveType],
                  ["Colour:", selected.color],
                  ["Doors:", selected.doors ?? "-"],
                  ["Seats:", selected.seats ?? "-"],
                  ["Condition:", "Used"],
                  ["Location:", selected.location],
                  ["Dealer:", selected.dealer],
                ].map(([l, v]) => (
                  <Detail key={l} l={String(l)} v={String(v)} />
                ))}
                <a href={selected.url} target="_blank">
                  View original listing →
                </a>
              </div>
              <div className="modal-col">
                <div className="modal-section-title">Recent Bids</div>
                <div className="bids-list">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div className="bid-item" key={i}>
                      <div className="bid-amount">
                        {fmtAUD(
                          (selected.audPrice ?? 5000) * (0.95 - i * 0.02),
                        )}
                      </div>
                      <div className="bid-meta">
                        Bid Time: {i + 1}h{" "}
                        {String(hashStr(selected.url + i) % 60).padStart(
                          2,
                          "0",
                        )}
                        m ago · Bidder: Anon{100 + i}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="make-bid-bar">
              <label>Make Bid</label>
              <span className="bid-label-bold">Bid:</span>
              <div className="bid-amount-wrap">
                <span className="bid-prefix">AUD</span>
                <input
                  className="bid-input"
                  type="number"
                  placeholder="Enter Bid Amount (AUD)"
                  value={bid}
                  onChange={(e) => setBid(e.target.value)}
                />
              </div>
              <button className="submit-btn" onClick={submitBid}>
                Submit Bid
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ l, v, cls = "" }: { l: string; v: string; cls?: string }) {
  return (
    <div className="card-row">
      <span className="lbl">{l}</span>
      <span className={`val ${cls}`}>{v}</span>
    </div>
  );
}
function Detail({ l, v, cls = "" }: { l: string; v: string; cls?: string }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{l}</span>
      <span className={`detail-val ${cls}`}>{v}</span>
    </div>
  );
}

function Root() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  if (path === "/architect") return <ArchitectureFlowchart />;
  if (!convexUrl) return <div className="error">Missing VITE_CONVEX_URL</div>;
  return (
    <ConvexProvider client={new ConvexReactClient(convexUrl)}>
      <App />
    </ConvexProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
