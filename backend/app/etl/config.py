"""Rutas y utilidades de almacenamiento de la base de datos (parquet)."""
import os
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
DATA = Path(os.environ.get("FIELD_SHIFT_DATA", BACKEND / "data"))
DB = DATA / "db"            # parquet de salida (mismo esquema que el Drive del notebook)
RAW = DATA / "raw"          # descargas y archivos descomprimidos (cache)
for _p in (DB, RAW):
    _p.mkdir(parents=True, exist_ok=True)

TABLAS = [
    ("cells",               "Esqueleto: cuadricula GLDAS 0.25 grados + zonas piloto"),
    ("coverage",            "Derivada: cobertura de fuentes por celda"),
    ("gaez_actual",         "GAEZ v4 Tema 5 (rendimientos y produccion reales)"),
    ("climate_monthly",     "GLDAS 2.1 (global) y NLDAS-2 (EE. UU.), Earthdata"),
    ("climatology",         "Derivada de climate_monthly"),
    ("landcover",           "NLCD (MRLC via pygeohydro), solo EE. UU."),
    ("stations_validation", "CoCoRaHS (GHCN-Daily, NOAA NCEI) + climate_monthly"),
    ("gaez_growing",        "GAEZ v4 Tema 2 (periodo de crecimiento, regimenes termico y de humedad)"),
    ("gaez_suitability",    "GAEZ v4 Tema 4 (idoneidad, rendimiento alcanzable, deficit hidrico)"),
    ("crop_traits",         "Manual (borrador botanico)"),
    ("indicators_monthly",  "Derivada: climate_monthly"),
]
NOMBRES_TABLAS = [t for t, _ in TABLAS]


def ruta(nombre: str) -> Path:
    return DB / f"{nombre}.parquet"


def hecho(nombre: str, forzar: set[str] | frozenset = frozenset()) -> bool:
    return ruta(nombre).exists() and nombre not in forzar


def cargar(nombre: str):
    import pandas as pd

    return pd.read_parquet(ruta(nombre))


def guardar(df, nombre: str):
    df.to_parquet(ruta(nombre), index=False)
    print(f"OK {nombre}.parquet  {df.shape}")


def estado() -> list[dict]:
    """Lista de tablas con filas y fuente. No carga los datos completos (solo metadatos del parquet)."""
    import pyarrow.parquet as pq

    out = []
    for i, (t, fuente) in enumerate(TABLAS, 1):
        p = ruta(t)
        filas = pq.ParquetFile(p).metadata.num_rows if p.exists() else None
        out.append({"n": i, "tabla": t, "fuente": fuente, "lista": p.exists(), "filas": filas,
                    "actualizada": p.stat().st_mtime if p.exists() else None})
    return out


def imprimir_estado():
    for e in estado():
        if e["lista"]:
            print(f"{e['n']:>2}. [OK]        {e['tabla']:<20} {e['filas']:>9} filas | {e['fuente']}")
        else:
            print(f"{e['n']:>2}. [pendiente] {e['tabla']:<20} {'':>9}       | {e['fuente']}")
