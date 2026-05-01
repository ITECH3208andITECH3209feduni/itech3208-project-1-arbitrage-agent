import argparse
from pathlib import Path

from goonet_agent.pipeline import run_brand_pipeline
from goonet_agent.storage import export_batch_result


def main():
    parser = argparse.ArgumentParser(description="Goo-net brand crawler and parser")
    parser.add_argument(
        "--brand-url",
        required=True,
        help="Goo-net brand URL, e.g. https://www.goo-net.com/usedcar/brand-SUBARU/",
    )
    parser.add_argument("--max-model-pages", type=int, default=5)
    parser.add_argument("--max-pages-per-model", type=int, default=10)
    parser.add_argument("--sleep-seconds", type=float, default=1.0)
    parser.add_argument("--detail-limit", type=int, default=None, help="Only process first N discovered detail URLs")
    parser.add_argument("--translate", action="store_true", help="Enable Gemini translation")
    parser.add_argument("--quiet", action="store_true")
    parser.add_argument("--json-out", default="goo_batch_output.json")
    parser.add_argument("--csv-out", default="goo_batch_output.csv")
    parser.add_argument("--sqlite-out", default=None, help="Optional SQLite output path, e.g. goo_batch_output.db")
    parser.add_argument("--sqlite-table", default="vehicles")
    parser.add_argument("--urls-out", default="goo_detail_urls.txt")
    args = parser.parse_args()

    batch_result = run_brand_pipeline(
        brand_url=args.brand_url,
        max_model_pages=args.max_model_pages,
        max_pages_per_model=args.max_pages_per_model,
        sleep_seconds=args.sleep_seconds,
        translate=args.translate,
        detail_limit=args.detail_limit,
        verbose=not args.quiet,
    )

    df = export_batch_result(
        batch_result,
        json_path=args.json_out,
        csv_path=args.csv_out,
        sqlite_path=args.sqlite_out,
        sqlite_table=args.sqlite_table,
    )

    Path(args.urls_out).write_text(
        "\n".join(batch_result.get("discovered_detail_urls", [])),
        encoding="utf-8"
    )

    print("\nSuccess:", batch_result["count_success"])
    print("Failed :", batch_result["count_failed"])
    print("JSON   :", args.json_out)
    print("CSV    :", args.csv_out)
    print("URLs   :", args.urls_out)
    if args.sqlite_out:
        print("SQLite :", args.sqlite_out)

    if not df.empty:
        browse_cols = [
            c for c in [
                "canonical_url",
                "page_title_en",
                "page_title",
                "vehicle_summary_en",
                "vehicle_summary",
                "total_price_jpy",
                "mileage_km",
                "body_color_en",
                "body_color",
                "dealer_name_en",
                "dealer_name_jp",
            ] if c in df.columns
        ]

        print("\nSample records:")
        print(df[browse_cols].head().to_string(index=False))


if __name__ == "__main__":
    main()