from .discovery import discover_brand_detail_urls
from .loaders import load_html
from .normalizer import build_rich_final_record
from .parser import parse_goonet_detail_page
from .translator import translate_all_japanese_fields


def run_goonet_agent(source, is_url=True, translate=False, normalize=True):
    html = load_html(source, is_url=is_url)
    data = parse_goonet_detail_page(html)

    if translate:
        data = translate_all_japanese_fields(data)

    if normalize:
        data = build_rich_final_record(data)

    return data


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