/**
 * Known brand aggregator pages.
 *
 * Goo-net maps each brand to one or more listing pages. The JP crawler uses
 * Exa's subpages feature to extract individual vehicle detail URLs.
 *
 * Autotrader uses slug URLs:
 *   /for-sale/{brand}
 *   /for-sale/{brand}/{model}
 */

export const GOO_NET_BRANDS = [
  "TOYOTA",
  "HONDA",
  "NISSAN",
  "SUBARU",
  "MAZDA",
  "SUZUKI",
  "MITSUBISHI",
  "DAIHATSU",
  "LEXUS",
] as const;

export type GooNetBrand = (typeof GOO_NET_BRANDS)[number];

function slugifyGooNetSegment(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/&/g, "AND")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function gooNetBrandPages(brand: GooNetBrand): string[] {
  return [
    `https://www.goo-net.com/usedcar/brand-${brand}/list/`,
    `https://www.goo-net.com/usedcar/brand-${brand}/certified/`,
  ];
}

export const GOO_NET_BRAND_PAGES: Record<string, string[]> = Object.fromEntries(
  GOO_NET_BRANDS.map((brand) => [brand, gooNetBrandPages(brand)]),
);

export const BRAND_PAGES = GOO_NET_BRAND_PAGES;

const AUTOTRADER_MULTI_WORD_BRANDS = [
  "MERCEDES BENZ",
  "MERCEDES-BENZ",
  "LAND ROVER",
  "ALFA ROMEO",
  "ASTON MARTIN",
] as const;

export const AUTOTRADER_BRAND_SLUGS: Record<string, string> = {
  TOYOTA: "toyota",
  HONDA: "honda",
  NISSAN: "nissan",
  SUBARU: "subaru",
  MAZDA: "mazda",
  SUZUKI: "suzuki",
  MITSUBISHI: "mitsubishi",
  DAIHATSU: "daihatsu",
  LEXUS: "lexus",
  PORSCHE: "porsche",
  BMW: "bmw",
  MERCEDES: "mercedes-benz",
  "MERCEDES BENZ": "mercedes-benz",
  "MERCEDES-BENZ": "mercedes-benz",
  "LAND ROVER": "land-rover",
  "ALFA ROMEO": "alfa-romeo",
  "ASTON MARTIN": "aston-martin",
  AUDI: "audi",
  VOLKSWAGEN: "volkswagen",
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Return base model family for trim/grade searches like LS500H -> LS. */
export function getModelFamily(value?: string): string | undefined {
  const normalized = value?.trim().replace(/\s+/g, " ");
  if (!normalized) return undefined;
  const compact = normalized.replace(/[^A-Za-z0-9]/g, "");
  const match = compact.match(/^([A-Za-z]+)\d+[A-Za-z]*$/);
  return match?.[1];
}

export function getModelSearchCandidates(model?: string): string[] {
  const trimmed = model?.trim();
  if (!trimmed) return [];
  const family = getModelFamily(trimmed);
  return [...new Set([trimmed, family].filter((v): v is string => Boolean(v)))];
}

/** Build a Goo-net URL for a brand, optionally narrowed by model. */
export function getGooNetBrandPage(brand: string, model?: string): string {
  const brandSlug = slugifyGooNetSegment(brand);
  const modelSlug = model ? slugifyGooNetSegment(model) : undefined;
  return `https://www.goo-net.com/usedcar/brand-${brandSlug}/${modelSlug ? `car-${modelSlug}/` : ""}`;
}

/** Look up Goo-net brand pages. Returns model page when model is provided. */
export function getBrandPages(brand: string, model?: string): string[] | null {
  const upper = brand.trim().toUpperCase();
  if (model) return [getGooNetBrandPage(upper, model)];
  return GOO_NET_BRAND_PAGES[upper] ?? null;
}

/** Build an Autotrader AU listing URL for a brand, optionally narrowed by model. */
export function getAutotraderBrandPage(brand: string, model?: string, year?: number): string {
  const upper = brand.trim().toUpperCase();
  const brandSlug = AUTOTRADER_BRAND_SLUGS[upper] ?? slugify(brand);
  const modelSlug = model ? slugify(model) : undefined;
  const yearSlug = year ? `/year-${year}` : "";
  return `https://www.autotrader.com.au/for-sale/${brandSlug}${modelSlug ? `/${modelSlug}` : ""}${yearSlug}`;
}

/** Build an Autotrader AU listing URL from a free-text query like "Toyota Alphard". */
export function getAutotraderPageFromQuery(query: string, year?: number): string | null {
  const normalized = query.trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  const upper = normalized.toUpperCase();

  for (const brand of AUTOTRADER_MULTI_WORD_BRANDS) {
    if (upper === brand || upper.startsWith(`${brand} `)) {
      const model = normalized.slice(brand.length).trim();
      return getAutotraderBrandPage(brand, model || undefined, year);
    }
  }

  const parts = normalized.split(" ");
  const [brand, ...modelParts] = parts;
  return getAutotraderBrandPage(brand, modelParts.join(" ") || undefined, year);
}
