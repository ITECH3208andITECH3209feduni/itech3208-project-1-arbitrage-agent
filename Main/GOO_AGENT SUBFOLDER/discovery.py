import re
import time
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from .loaders import fetch_html_from_url
from .utils import canonicalize_url, is_same_goonet_domain, get_brand_slug_from_seed

DETAIL_PATTERN = r"/usedcar/spread/goo/\d+/.+\.html"


def is_detail_page(url: str) -> bool:
    return re.search(DETAIL_PATTERN, urlparse(url).path) is not None


def is_brand_model_page(url: str, brand_slug: str) -> bool:
    """
    Accept model pages like:
    /usedcar/brand-LEXUS/car-LS/

    Reject things like:
    /map/
    /shop_review/
    """
    path = urlparse(url).path
    if f"/usedcar/brand-{brand_slug}/car-" not in path:
        return False
    if "/map/" in path:
        return False
    if "/shop_review/" in path:
        return False
    return True


def get_model_slug_from_url(model_url: str) -> str:
    """
    Example:
    /usedcar/brand-LEXUS/car-LS/ -> car-LS
    """
    return urlparse(model_url).path.rstrip("/").split("/")[-1]


def is_same_brand(url: str, brand_slug: str) -> bool:
    path = urlparse(url).path
    return (
        f"/brand-{brand_slug}/" in path
        or path.rstrip("/") == f"/usedcar/brand-{brand_slug}"
    )


def is_same_model_family(url: str, brand_slug: str, model_slug: str) -> bool:
    """
    For non-detail pages only.
    Keep crawler inside the same brand/model family.
    """
    path = urlparse(url).path
    query = urlparse(url).query

    if not is_same_brand(url, brand_slug):
        return False

    if "/map/" in path:
        return False
    if "/shop_review/" in path:
        return False
    if "/info/sitemap" in path:
        return False

    return model_slug in path or model_slug in query


def extract_links(html: str, base_url: str):
    soup = BeautifulSoup(html, "html.parser")
    links = set()

    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href:
            continue
        if href.startswith("#") or href.startswith("javascript:") or href.startswith("mailto:"):
            continue

        full = canonicalize_url(urljoin(base_url, href))
        if is_same_goonet_domain(full):
            links.add(full)

    return sorted(links)


def discover_model_pages_from_brand(brand_url: str, verbose: bool = True):
    brand_slug = get_brand_slug_from_seed(brand_url)
    html = fetch_html_from_url(brand_url)
    links = extract_links(html, brand_url)

    model_urls = sorted({link for link in links if is_brand_model_page(link, brand_slug)})

    if verbose:
        print(f"[MODEL DISCOVERY] Brand={brand_slug} Found {len(model_urls)} model pages")
        for u in model_urls[:20]:
            print(" ", u)

    return model_urls


def discover_detail_urls_from_model_page(
    model_url: str,
    max_pages_per_model: int = 20,
    sleep_seconds: float = 1.0,
    verbose: bool = True,
):
    """
    Crawl within one model family only.

    IMPORTANT:
    Detail pages are checked FIRST, because Goo-net detail URLs do not
    contain the brand slug.
    """
    brand_slug = get_brand_slug_from_seed(model_url)
    model_slug = get_model_slug_from_url(model_url)

    to_visit = [model_url]
    visited = set()
    found_details = set()

    while to_visit and len(visited) < max_pages_per_model:
        current_url = to_visit.pop(0)

        if current_url in visited:
            continue
        visited.add(current_url)

        if verbose:
            print(f"[MODEL CRAWL] {model_slug} page {len(visited)} -> {current_url}")

        try:
            html = fetch_html_from_url(current_url)
        except Exception as e:
            if verbose:
                print(f"  -> fetch failed: {e}")
            continue

        links = extract_links(html, current_url)

        for link in links:
            # FIX: detail pages must be accepted before same-brand filtering
            if is_detail_page(link):
                found_details.add(link)
                continue

            if is_same_model_family(link, brand_slug, model_slug):
                if link not in visited and link not in to_visit:
                    to_visit.append(link)

        time.sleep(sleep_seconds)

    return sorted(found_details)


def discover_brand_detail_urls(
    brand_url: str,
    max_model_pages=None,
    max_pages_per_model: int = 10,
    sleep_seconds: float = 1.0,
    verbose: bool = True,
):
    """
    brand page -> model pages -> detail pages

    Works for any Goo-net brand seed like:
    https://www.goo-net.com/usedcar/brand-LEXUS/
    https://www.goo-net.com/usedcar/brand-TOYOTA/
    https://www.goo-net.com/usedcar/brand-NISSAN/
    """
    model_urls = discover_model_pages_from_brand(brand_url=brand_url, verbose=verbose)

    if max_model_pages is not None:
        model_urls = model_urls[:max_model_pages]

    all_detail_urls = set()

    for i, model_url in enumerate(model_urls, start=1):
        if verbose:
            print(f"\n[BRAND] Crawling model {i}/{len(model_urls)}: {model_url}")

        details = discover_detail_urls_from_model_page(
            model_url=model_url,
            max_pages_per_model=max_pages_per_model,
            sleep_seconds=sleep_seconds,
            verbose=verbose,
        )

        all_detail_urls.update(details)

    return sorted(all_detail_urls)