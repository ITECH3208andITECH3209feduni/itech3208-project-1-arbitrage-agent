import json
import sqlite3
from pathlib import Path


def _prepare_value(value):
    """
    SQLite-friendly conversion:
    - dict/list -> JSON string
    - bool/int/float/str/None -> unchanged
    - everything else -> string
    """
    if value is None:
        return None
    if isinstance(value, (str, int, float)):
        return value
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def save_records_to_sqlite(records, db_path="goo_batch_output.db", table_name="vehicles"):
    """
    Save records to SQLite with a dynamic schema based on record keys.
    """
    if not records:
        return

    Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    # Collect all keys across all records
    all_keys = set()
    for rec in records:
        all_keys.update(rec.keys())

    columns = sorted(all_keys)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    # Create table
    col_defs = ", ".join([f'"{col}" TEXT' for col in columns])
    cur.execute(f'CREATE TABLE IF NOT EXISTS "{table_name}" ({col_defs})')

    # Optional: clear old contents each run
    cur.execute(f'DELETE FROM "{table_name}"')

    placeholders = ", ".join(["?"] * len(columns))
    col_names = ", ".join([f'"{col}"' for col in columns])

    rows = []
    for rec in records:
        row = [_prepare_value(rec.get(col)) for col in columns]
        rows.append(row)

    cur.executemany(
        f'INSERT INTO "{table_name}" ({col_names}) VALUES ({placeholders})',
        rows
    )

    conn.commit()
    conn.close()