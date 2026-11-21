"""Compact on-disk recipe store, so the API fits in 512 MB of RAM (e.g. Render's free tier).

Holding the full 338k-recipe CSV in pandas costs ~670 MB, mostly recipe text. Instead:

  * at Docker build time, `python recipe_store.py <recipes.csv[.gz]> <recipes.sqlite>` converts the CSV
    into SQLite once (chunked, low memory), dropping pregnancy-unsafe dishes exactly like the CSV loader;
  * at runtime `load()` keeps only the 9 nutrition numbers and the lower-cased search text in RAM,
    and `hydrate()` reads names, ingredients and instructions from disk for the few recipes a request
    returns.

Search, diet filters and KNN ranking operate on exactly the same data as before, so results are identical.
"""

import os
import sqlite3
import sys
from typing import List

import pandas as pd

from diet_rules import NOT_HUMAN_FOOD, PREGNANCY_UNSAFE, compile_terms
from model import NUTRITION_COLUMNS, SEARCH_COLUMN, build_search_text

TABLE = "recipes"
ROW_COLUMN = "_row"  # SQLite rowid, carried through filtering/ranking to fetch the details later
# Same column order the CSV has, so API output is unchanged.
DETAIL_COLUMNS = ["RecipeId", "Name", "CookTime", "PrepTime", "TotalTime", "RecipeIngredientParts"]
TRAILING_COLUMNS = ["RecipeInstructions"]
OUTPUT_COLUMNS = DETAIL_COLUMNS + NUTRITION_COLUMNS + TRAILING_COLUMNS

_SQLITE_MAGIC = b"SQLite format 3\x00"


def is_store(path: str) -> bool:
    try:
        with open(path, "rb") as f:
            return f.read(len(_SQLITE_MAGIC)) == _SQLITE_MAGIC
    except OSError:
        return False


def _connect_ro(path: str) -> sqlite3.Connection:
    return sqlite3.connect(f"file:{path}?mode=ro", uri=True)


def _q(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def build(csv_path: str, db_path: str, chunksize: int = 20_000) -> int:
    """Convert the recipes CSV (plain or gzipped) into a SQLite store. Returns the number of recipes kept."""
    with open(csv_path, "rb") as f:
        compression = "gzip" if f.read(2) == b"\x1f\x8b" else None
    unsafe = compile_terms(PREGNANCY_UNSAFE + NOT_HUMAN_FOOD)

    tmp = db_path + ".tmp"
    if os.path.exists(tmp):
        os.remove(tmp)
    conn = sqlite3.connect(tmp)
    total = kept = 0
    try:
        for chunk in pd.read_csv(csv_path, compression=compression, chunksize=chunksize):
            missing = set(OUTPUT_COLUMNS).difference(chunk.columns)
            if missing:
                raise ValueError(f"{csv_path}: missing columns {sorted(missing)}")
            total += len(chunk)
            chunk[SEARCH_COLUMN] = build_search_text(chunk)
            chunk = chunk[~chunk[SEARCH_COLUMN].str.contains(unsafe, regex=True, na=False)]
            kept += len(chunk)
            chunk[OUTPUT_COLUMNS + [SEARCH_COLUMN]].to_sql(TABLE, conn, if_exists="append", index=False)
        conn.commit()
    finally:
        conn.close()
    if kept == 0:
        os.remove(tmp)
        raise ValueError(f"{csv_path}: no recipes")
    os.replace(tmp, db_path)
    print(f"recipe store: kept {kept} of {total} recipes ({total - kept} pregnancy-unsafe excluded) -> {db_path}")
    return kept


def load(db_path: str) -> pd.DataFrame:
    """The in-RAM part: rowid, nutrition numbers and search text, in rowid (= original CSV) order."""
    cols = ", ".join(_q(c) for c in NUTRITION_COLUMNS + [SEARCH_COLUMN])
    conn = _connect_ro(db_path)
    try:
        parts = list(
            pd.read_sql_query(
                f"SELECT rowid AS {ROW_COLUMN}, {cols} FROM {TABLE} ORDER BY rowid", conn, chunksize=50_000
            )
        )
    finally:
        conn.close()
    if not parts:
        raise ValueError(f"{db_path}: no recipes")
    df = pd.concat(parts, ignore_index=True)
    df[NUTRITION_COLUMNS] = df[NUTRITION_COLUMNS].astype(float)
    return df


def hydrate(df: pd.DataFrame, db_path: str) -> pd.DataFrame:
    """Add the text columns back for the (few) selected rows, keeping their order."""
    rows: List[int] = [int(r) for r in df[ROW_COLUMN]]
    if not rows:
        return pd.DataFrame(columns=OUTPUT_COLUMNS)
    cols = ", ".join(_q(c) for c in DETAIL_COLUMNS + TRAILING_COLUMNS)
    conn = _connect_ro(db_path)
    try:
        details = pd.read_sql_query(
            f"SELECT rowid AS {ROW_COLUMN}, {cols} FROM {TABLE} WHERE rowid IN ({','.join('?' * len(rows))})",
            conn,
            params=rows,
        ).set_index(ROW_COLUMN)
    finally:
        conn.close()
    details = details.loc[rows].reset_index(drop=True)
    numbers = df[NUTRITION_COLUMNS].reset_index(drop=True)
    return pd.concat([details, numbers], axis=1)[OUTPUT_COLUMNS]


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: python recipe_store.py <recipes.csv[.gz]> <recipes.sqlite>")
    build(sys.argv[1], sys.argv[2])
