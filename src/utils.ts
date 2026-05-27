/**
 * URL utilities for goo-net crawler.
 */

const TRACKING_PARAM_NAMES = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "utm_name",
  "utm_cid",
  "utm_reader",
  "gclid",
  "fbclid",
  "mc_cid",
  "mc_eid",
  "msclkid",
  "ttclid",
  "irclickid",
  "yclid",
  "ref",
  "source",
  "_ga",
];

/** Strip tracking params, normalise trailing slashes, lowercase host. */
export function canonicalizeUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }

  u.hostname = u.hostname.toLowerCase();
  if (u.pathname !== "/" && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.replace(/\/+$/, "");
  }

  if (u.search) {
    const params = new URLSearchParams(u.search);
    for (const key of [...params.keys()]) {
      const lower = key.toLowerCase();
      if (
        TRACKING_PARAM_NAMES.includes(lower)
        || lower.startsWith("utm_")
      ) {
        params.delete(key);
      }
    }
    const sortedParams = new URLSearchParams(
      [...params.entries()].sort(([aKey, aValue], [bKey, bValue]) =>
        aKey === bKey ? aValue.localeCompare(bValue) : aKey.localeCompare(bKey),
      ),
    );
    u.search = sortedParams.toString();
  }

  u.hash = "";
  return u.toString();
}

/** Check if URL belongs to goo-net.com domain. */
export function isValidGooNetUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === "www.goo-net.com" || u.hostname === "goo-net.com";
  } catch {
    return false;
  }
}

/** Check if URL belongs to an Australian local-market vehicle site. */
export function isAustralianVehicleUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "www.carsales.com.au" || host === "carsales.com.au";
  } catch {
    return false;
  }
}

/** Check if URL is an Australian vehicle listing detail page. */
export function isAustralianVehicleListingUrl(url: string): boolean {
  if (!isAustralianVehicleUrl(url)) return false;
  try {
    const u = new URL(url);
    return u.pathname.startsWith("/cars/details/");
  } catch {
    return false;
  }
}

/** Check if URL is an individual vehicle listing detail page. */
export function isGooNetListingUrl(url: string): boolean {
  if (!isValidGooNetUrl(url)) return false;
  try {
    const u = new URL(url);
    return u.pathname.startsWith("/usedcar/spread/goo/") || u.pathname.startsWith("/usedcar/spread/goo_sort/");
  } catch {
    return false;
  }
}
