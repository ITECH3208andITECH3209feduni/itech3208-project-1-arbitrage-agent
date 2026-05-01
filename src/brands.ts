/**
 * Known Goo-net brand aggregator pages.
 *
 * Each brand maps to one or more listing pages. The crawler uses Exa's
 * subpages feature to extract individual vehicle detail URLs from these pages.
 *
 * To add a brand: find its listing page on goo-net.com and add it here.
 * Common patterns:
 *   /usedcar/brand-{BRAND}/           — all listings
 *   /usedcar/brand-{BRAND}/certified/  — certified pre-owned only
 *   /usedcar/brand-{BRAND}/dealer/     — dealer listings
 */

export const BRAND_PAGES: Record<string, string[]> = {
  TOYOTA: [
    "https://www.goo-net.com/usedcar/brand-TOYOTA/",
    "https://www.goo-net.com/usedcar/brand-TOYOTA/certified/",
  ],
  HONDA: [
    "https://www.goo-net.com/usedcar/brand-HONDA/",
  ],
  NISSAN: [
    "https://www.goo-net.com/usedcar/brand-NISSAN/",
  ],
  SUBARU: [
    "https://www.goo-net.com/usedcar/brand-SUBARU/",
  ],
  MAZDA: [
    "https://www.goo-net.com/usedcar/brand-MAZDA/",
  ],
  SUZUKI: [
    "https://www.goo-net.com/usedcar/brand-SUZUKI/",
  ],
  MITSUBISHI: [
    "https://www.goo-net.com/usedcar/brand-MITSUBISHI/",
  ],
  DAIHATSU: [
    "https://www.goo-net.com/usedcar/brand-DAIHATSU/",
  ],
  LEXUS: [
    "https://www.goo-net.com/usedcar/brand-LEXUS/",
  ],
};

/**
 * Look up brand pages. Returns null if brand not in the registry.
 */
export function getBrandPages(brand: string): string[] | null {
  const upper = brand.trim().toUpperCase();
  return BRAND_PAGES[upper] ?? null;
}
