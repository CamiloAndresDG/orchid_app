"""ETL CLI. Run from the backend folder:

    python -m app.etl status
    python -m app.etl build                       # every table it can, skipping the ones already built
    python -m app.etl build gaez_suitability --force
    python -m app.etl build gaez_actual --gaez5 C:/downloads/res06.zip
    python -m app.etl build climate_monthly --period 2020-01-01 2020-12-31   # requires EARTHDATA_TOKEN
"""
import argparse
import sys
import traceback

from .config import TABLE_NAMES, done, print_status

# table -> tables that must exist first
DEPENDS = {"stations_validation": ["climate_monthly"], "indicators_monthly": ["climate_monthly"],
           "climatology": ["climate_monthly"], "crop_traits": []}


def _build(table: str, args) -> None:
    if table == "cells":
        from .grid import build_cells
        build_cells()
    elif table == "coverage":
        print("coverage fills itself as the other tables are built")
    elif table == "gaez_actual":
        from .gaez import build_actual
        build_actual(args.gaez5)
    elif table in ("climate_monthly", "climatology"):
        from .ldas import build
        build(tuple(args.period))
    elif table == "landcover":
        from .landcover import build
        build()
    elif table == "stations_validation":
        from .stations import build
        build(tuple(args.stations_period))
    elif table == "gaez_growing":
        from .gaez import build_growing
        build_growing()
    elif table == "gaez_suitability":
        from .gaez import build_suitability
        build_suitability()
    elif table == "crop_traits":
        from .traits import build
        build()
    elif table == "indicators_monthly":
        from .indicators import build
        build()


def main(argv=None):
    ap = argparse.ArgumentParser(prog="python -m app.etl", description="ETL of NASA/FAO/NOAA sources for ORCHID")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status", help="table status")
    b = sub.add_parser("build", help="build tables")
    b.add_argument("tables", nargs="*", help=f"defaults to all: {', '.join(TABLE_NAMES)}")
    b.add_argument("--force", action="store_true", help="rebuild even if the parquet exists")
    b.add_argument("--gaez5", default=None, help="Theme 5 folder or file (.zip/.rar); defaults to the FAO server")
    b.add_argument("--period", nargs=2, default=["2000-01-01", "2024-12-31"], metavar=("START", "END"))
    b.add_argument("--stations-period", nargs=2, default=["2020-01-01", "2024-12-31"], metavar=("START", "END"))
    args = ap.parse_args(argv)

    if args.cmd == "status":
        print_status()
        return 0

    unknown = [t for t in args.tables if t not in TABLE_NAMES]
    if unknown:
        ap.error(f"unknown tables: {', '.join(unknown)}. Valid: {', '.join(TABLE_NAMES)}")
    tables = args.tables or TABLE_NAMES
    force = set(tables) if args.force else set()
    built_now, failures = set(), {}
    for t in tables:
        if t == "climatology" and "climate_monthly" in built_now:
            continue                                # built together
        if done(t, force):
            print(f"[skipped] {t} already exists (use --force to rebuild)")
            continue
        missing = [d for d in DEPENDS.get(t, []) if not done(d)]
        if missing:
            print(f"[pending] {t}: needs {', '.join(missing)}")
            failures[t] = f"needs {', '.join(missing)}"
            continue
        print(f"\n===== {t} =====")
        try:
            _build(t, args)
            built_now.add(t)
        except ImportError as ex:
            failures[t] = f"missing package ({ex.name}); install requirements-etl.txt"
            print(f"[error] {t}: {failures[t]}")
        except Exception as ex:
            failures[t] = f"{type(ex).__name__}: {str(ex)[:300]}"
            print(f"[error] {t}: {failures[t]}")
            traceback.print_exc(limit=2)
    print()
    print_status()
    if failures:
        print("\nNot built:")
        for t, m in failures.items():
            print(f"  - {t}: {m}")
    return 1 if failures and args.tables else 0


if __name__ == "__main__":
    sys.exit(main())
