from pathlib import Path
import json

import pandas as pd

from .sqlite_store import save_records_to_sqlite


def records_to_dataframe(records):
    return pd.DataFrame(records)


def export_batch_result(
    batch_result,
    json_path="goo_batch_output.json",
    csv_path="goo_batch_output.csv",
    sqlite_path=None,
    sqlite_table="vehicles",
):
    Path(json_path).write_text(
        json.dumps(batch_result, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    df = pd.DataFrame(batch_result["records"])
    df.to_csv(csv_path, index=False, encoding="utf-8-sig")

    if sqlite_path:
        save_records_to_sqlite(
            batch_result["records"],
            db_path=sqlite_path,
            table_name=sqlite_table,
        )

    return df