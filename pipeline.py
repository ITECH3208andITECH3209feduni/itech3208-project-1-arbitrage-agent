import re

from .discovery import discover_brand_detail_urls
from .loaders import load_html
from .normalizer import build_rich_final_record
from .parser import parse_goonet_detail_page
from .translator import translate_all_japanese_fields


# ── URL helpers ──────────────────────────────────────────────────────────────

_LISTING_ID_PATTERN = re.compile(r"(\d{15,})")
_LISTING_URL_TEMPLATE = "https://www.goo-net.com/usedcar/spread/goo/10/{id}.html"


def resolve_listing_url(id_or_url: str) -> str:
    """
    Resolve an input string to a canonical Goo-net listing URL.

    Accepts:
    - A full URL:
        ``https://www.goo-net.com/usedcar/spread/goo/10/700030247130260401001.html``
    - A bare numeric listing ID:
        ``700030247130260401001``
    - A partial path:
        ``/usedcar/spread/goo/10/700030247130260401001.html``

    Raises:
        ValueError: If the input cannot be resolved to a plausible listing URL.
    """
    s = id_or_url.strip()

    # Full URL — pass through, light sanity check
    if s.startswith("http"):
        if "/usedcar/spread/goo/" not in s:
            raise ValueError(
                f"Not a valid Goo-net listing URL: {s!r}.\n"
                "Expected pattern: /usedcar/spread/goo/<region>/<id>.html"
            )
        return s

    # Partial path
    if s.startswith("/usedcar/spread/goo/"):
        return f"https://www.goo-net.com{s}"

    # Bare numeric ID (≥15 digits to avoid false positives)
    m = _LISTING_ID_PATTERN.match(s)
    if m:
        return _LISTING_URL_TEMPLATE.format(id=m.group(1))

    raise ValueError(
        f"Cannot resolve {s!r} to a listing URL.\n"
        "Pass a full URL, a partial path, or a numeric listing ID (≥15 digits)."
    )


# ── Single-listing pipeline ──────────────────────────────────────────────────

def run_goonet_agent(source, is_url=True, translate=False, normalize=True):
    html = load_html(source, is_url=is_url)
    data = parse_goonet_detail_page(html)

    if translate:
        data = translate_all_japanese_fields(data)

    if normalize:
        data = build_rich_final_record(data)

    return data


def rescrape_listing(id_or_url: str, translate: bool = False) -> dict:
    """
    Re-fetch and re-parse a single Goo-net listing from scratch.

    The listing is identified by any of the following:

    - A full URL::

        "https://www.goo-net.com/usedcar/spread/goo/10/700030247130260401001.html"

    - A bare numeric listing ID::

        "700030247130260401001"

    - A partial path::

        "/usedcar/spread/goo/10/700030247130260401001.html"

    The function always makes a live HTTP request — it never reads from a local
    cache or database. Use it to refresh a record after a price change, updated
    inspection date, or corrected dealer details.

    Args:
        id_or_url: Listing URL, partial path, or numeric listing ID.
        translate: When ``True``, translate all Japanese fields into English
            via the Gemini API (requires ``GEMINI_API_KEY`` in the environment).

    Returns:
        A fully normalised record dict equivalent to a single element of
        ``batch_result["records"]``.  The dict always contains
        ``"rescrape_url"`` so callers know which URL was fetched.

    Raises:
        ValueError: If *id_or_url* cannot be resolved to a listing URL.
        requests.HTTPError: If the HTTP request to Goo-net fails.

    Example::

        from goonet_agent.pipeline import rescrape_listing

        # By numeric ID
        record = rescrape_listing("700030247130260401001")

        # By full URL
        record = rescrape_listing(
            "https://www.goo-net.com/usedcar/spread/goo/10/700030247130260401001.html",
            translate=True,
        )

        print(record["total_price_jpy"], record.get("vehicle_summary_en"))
    """
    url = resolve_listing_url(id_or_url)
    record = run_goonet_agent(source=url, is_url=True, translate=translate, normalize=True)
    record["rescrape_url"] = url
    return record


# ── Batch pipeline ───────────────────────────────────────────────────────────

def run_batch_goonet_agent(urls, translate=False, verbose=True, fail_fast=False):
    records = []
    failures = []

    for i, url in enumerate(urls, start=1):
        if verbose:
            print(f"[BATCH] {i}/{len(urls)} -> {url}")

        try:
            record = run_goonet_agent(
                source=url,
                is_url=True,
                translate=translate,
                normalize=True,
            )
            records.append(record)
        except Exception as e:
            failures.append({"url": url, "error": str(e)})
            if verbose:
                print(f"  -> failed: {e}")
            if fail_fast:
                raise

    return {
        "records": records,
        "failures": failures,
        "count_success": len(records),
        "count_failed": len(failures),
    }


def run_brand_pipeline(
    brand_url,
    max_model_pages=5,
    max_pages_per_model=10,
    sleep_seconds=1.0,
    translate=False,
    detail_limit=None,
    verbose=True,
):
    detail_urls = discover_brand_detail_urls(
        brand_url=brand_url,
        max_model_pages=max_model_pages,
        max_pages_per_model=max_pages_per_model,
        sleep_seconds=sleep_seconds,
        verbose=verbose,
    )

    if detail_limit is not None:
        detail_urls = detail_urls[:detail_limit]

    batch_result = run_batch_goonet_agent(
        urls=detail_urls,
        translate=translate,
        verbose=verbose,
        fail_fast=False,
    )

    batch_result["discovered_detail_urls"] = detail_urls
    return batch_result
