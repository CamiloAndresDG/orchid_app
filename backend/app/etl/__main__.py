"""CLI del ETL.  Ejecutar desde la carpeta backend:

    python -m app.etl status
    python -m app.etl build                       # todas las tablas posibles, saltando las ya hechas
    python -m app.etl build gaez_suitability --force
    python -m app.etl build gaez_actual --gaez5 C:/descargas/res06.zip
    python -m app.etl build climate_monthly --periodo 2020-01-01 2020-12-31   # requiere EARTHDATA_TOKEN
"""
import argparse
import sys
import traceback

from .config import NOMBRES_TABLAS, hecho, imprimir_estado

# tabla -> tablas que debe haber antes
DEPENDE = {"stations_validation": ["climate_monthly"], "indicators_monthly": ["climate_monthly"],
           "climatology": ["climate_monthly"], "crop_traits": []}


def _construir(tabla: str, args) -> None:
    if tabla == "cells":
        from .grid import construir_cells
        construir_cells()
    elif tabla == "coverage":
        print("coverage se llena sola al construir las demas tablas")
    elif tabla == "gaez_actual":
        from .gaez import construir_actual
        construir_actual(args.gaez5)
    elif tabla in ("climate_monthly", "climatology"):
        from .ldas import construir
        construir(tuple(args.periodo))
    elif tabla == "landcover":
        from .landcover import construir
        construir()
    elif tabla == "stations_validation":
        from .stations import construir
        construir(tuple(args.periodo_estaciones))
    elif tabla == "gaez_growing":
        from .gaez import construir_growing
        construir_growing()
    elif tabla == "gaez_suitability":
        from .gaez import construir_suitability
        construir_suitability()
    elif tabla == "crop_traits":
        from .traits import construir
        construir()
    elif tabla == "indicators_monthly":
        from .indicators import construir
        construir()


def main(argv=None):
    ap = argparse.ArgumentParser(prog="python -m app.etl", description="ETL de fuentes NASA/FAO/NOAA para Orchid")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status", help="estado de las tablas")
    b = sub.add_parser("build", help="construir tablas")
    b.add_argument("tablas", nargs="*", help=f"por defecto, todas: {', '.join(NOMBRES_TABLAS)}")
    b.add_argument("--force", action="store_true", help="recalcular aunque el parquet exista")
    b.add_argument("--gaez5", default=None, help="carpeta o archivo (.zip/.rar) del Tema 5; por defecto, el servidor FAO")
    b.add_argument("--periodo", nargs=2, default=["2000-01-01", "2024-12-31"], metavar=("INICIO", "FIN"))
    b.add_argument("--periodo-estaciones", nargs=2, default=["2020-01-01", "2024-12-31"], metavar=("INICIO", "FIN"))
    args = ap.parse_args(argv)

    if args.cmd == "status":
        imprimir_estado()
        return 0

    desconocidas = [t for t in args.tablas if t not in NOMBRES_TABLAS]
    if desconocidas:
        ap.error(f"tablas desconocidas: {', '.join(desconocidas)}. Validas: {', '.join(NOMBRES_TABLAS)}")
    tablas = args.tablas or NOMBRES_TABLAS
    forzar = set(tablas) if args.force else set()
    hechas_ahora, fallos = set(), {}
    for t in tablas:
        if t == "climatology" and "climate_monthly" in hechas_ahora:
            continue                                # se construyen juntas
        if hecho(t, forzar):
            print(f"[saltada] {t} ya existe (usa --force para recalcular)")
            continue
        faltan = [d for d in DEPENDE.get(t, []) if not hecho(d)]
        if faltan:
            print(f"[pendiente] {t}: necesita {', '.join(faltan)}")
            fallos[t] = f"necesita {', '.join(faltan)}"
            continue
        print(f"\n===== {t} =====")
        try:
            _construir(t, args)
            hechas_ahora.add(t)
        except ImportError as ex:
            fallos[t] = f"falta un paquete ({ex.name}); instala requirements-etl.txt"
            print(f"[error] {t}: {fallos[t]}")
        except Exception as ex:
            fallos[t] = f"{type(ex).__name__}: {str(ex)[:300]}"
            print(f"[error] {t}: {fallos[t]}")
            traceback.print_exc(limit=2)
    print()
    imprimir_estado()
    if fallos:
        print("\nNo construidas:")
        for t, m in fallos.items():
            print(f"  - {t}: {m}")
    return 1 if fallos and args.tablas else 0


if __name__ == "__main__":
    sys.exit(main())
