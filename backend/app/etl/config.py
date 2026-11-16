"""Paths and storage helpers for the database (parquet)."""
import os
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
DATA = Path(os.environ.get("FIELD_SHIFT_DATA", BACKEND / "data"))
DB = DATA / "db"            # output parquet (same schema as the notebook's Drive)
RAW = DATA / "raw"          # downloads and unpacked files (cache)
for _p in (DB, RAW):
    _p.mkdir(parents=True, exist_ok=True)

TABLES = [
    ("cells",               "Skeleton: GLDAS 0.25-degree grid + pilot zones"),
    ("coverage",            "Derived: source coverage per cell"),
    ("gaez_actual",         "GAEZ v4 Theme 5 (actual yields and production)"),
    ("climate_monthly",     "GLDAS 2.1 (global) and NLDAS-2 (U.S.), Earthdata"),
    ("climatology",         "Derived from climate_monthly"),
    ("landcover",           "NLCD (MRLC via pygeohydro), U.S. only"),
    ("stations_validation", "CoCoRaHS (GHCN-Daily, NOAA NCEI) + climate_monthly"),
    ("gaez_growing",        "GAEZ v4 Theme 2 (growing period, thermal and moisture regimes)"),
    ("gaez_suitability",    "GAEZ v4 Theme 4 (suitability, attainable yield, water deficit)"),
    ("crop_traits",         "Manual (botanical draft)"),
    ("indicators_monthly",  "Derived: climate_monthly"),
]
TABLE_NAMES = [t for t, _ in TABLES]


def path(name: str) -> Path:
    return DB / f"{name}.parquet"


def done(name: str, force: set[str] | frozenset = frozenset()) -> bool:
    return path(name).exists() and name not in force


def load(name: str):
    import pandas as pd

    return pd.read_parquet(path(name))


def save(df, name: str):
    df.to_parquet(path(name), index=False)
    print(f"OK {name}.parquet  {df.shape}")


def status() -> list[dict]:
    """List of tables with row count and source. Doesn't load the full data (only parquet metadata)."""
    import pyarrow.parquet as pq

    out = []
    for i, (t, source) in enumerate(TABLES, 1):
        p = path(t)
        rows = pq.ParquetFile(p).metadata.num_rows if p.exists() else None
        out.append({"n": i, "table": t, "source": source, "ready": p.exists(), "rows": rows,
                    "updated": p.stat().st_mtime if p.exists() else None})
    return out


def print_status():
    for e in status():
        if e["ready"]:
            print(f"{e['n']:>2}. [OK]      {e['table']:<20} {e['rows']:>9} rows | {e['source']}")
        else:
            print(f"{e['n']:>2}. [pending] {e['table']:<20} {'':>9}      | {e['source']}")
