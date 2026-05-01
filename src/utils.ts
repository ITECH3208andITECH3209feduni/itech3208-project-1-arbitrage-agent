/**
 * URL utilities for goo-net crawler.
 */

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