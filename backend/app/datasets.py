"""Lectura de las tablas del ETL (backend/data/db/*.parquet) para la API.

Las tablas se cargan una vez y se recargan solas si el parquet cambia (por ejemplo tras
`python -m app.etl build`). Tambien sirven los parquet que genere el notebook en Colab:
basta con copiarlos a backend/data/db.
"""
import math
from threading import Lock

from .etl.config import NOMBRES_TABLAS, estado, ruta
from .etl.grid import AOIS, PILOTOS, RADIO_KM, cell_center, cell_id, zona_de

_cache: dict[str, tuple[float, object]] = {}
_lock = Lock()


class DatasetError(Exception):
    def __init__(self, status: int, msg: str):
        self.status, self.msg = status, msg


def tabla(nombre: str):
    """DataFrame de la tabla o None si aun no se construyo."""
    import pandas as pd

    if nombre not in NOMBRES_TABLAS:
        raise DatasetError(404, f"Tabla desconocida: {nombre}")
    p = ruta(nombre)
    if not p.exists():
        return None
    mtime = p.stat().st_mtime
    with _lock:
        hit = _cache.get(nombre)
        if hit and hit[0] == mtime:
            return hit[1]
        df = pd.read_parquet(p)
        _cache[nombre] = (mtime, df)
        return df


def _limpio(v):
    """Valores serializables en JSON (NaN -> None, numpy -> python)."""
    if v is None:
        return None
    if hasattr(v, "item"):
        v = v.item()
    if isinstance(v, float) and not math.isfinite(v):
        return None
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return v


def registros(df, limite: int | None = None) -> list[dict]:
    if df is None:
        return []
    if limite is not None:
        df = df.head(limite)
    cols = list(df.columns)
    return [{c: _limpio(v) for c, v in zip(cols, fila)} for fila in df.itertuples(index=False, name=None)]


def resumen_estado() -> dict:
    return {
        "tables": estado(),
        "pilot_zones": zonas(),
        "build_command": "cd backend && python -m app.etl build",
    }


def zonas() -> list[dict]:
    return [{"id": z, "lat": c[0], "lon": c[1], "radius_km": RADIO_KM, "bbox": AOIS[z]} for z, c in PILOTOS.items()]


def filas_tabla(nombre: str, zona: str | None, cid: int | None, filtros: dict, limite: int, offset: int) -> dict:
    df = tabla(nombre)
    if df is None:
        raise DatasetError(404, f"La tabla {nombre} aun no se ha construido. Ejecuta: python -m app.etl build {nombre}")
    if zona and "zona" in df:
        df = df[df["zona"] == zona]
    if cid is not None and "cell_id" in df:
        df = df[df["cell_id"] == cid]
    for c, v in filtros.items():
        if c in df and v is not None:
            df = df[df[c].astype(str) == str(v)]
    total = len(df)
    return {"table": nombre, "total": total, "offset": offset, "limit": limite,
            "columns": list(df.columns), "rows": registros(df.iloc[offset:offset + limite])}


def _por_celda(nombre: str, cid: int):
    df = tabla(nombre)
    if df is None or "cell_id" not in df:
        return None
    return df[df["cell_id"] == cid]


def celda(lat: float, lon: float) -> dict:
    """Todo lo que la base sabe de la celda de 0.25 grados que contiene el punto."""
    cid = int(cell_id(lat, lon))
    clat, clon = cell_center(cid)
    out = {"cell_id": cid, "cell_center": {"lat": clat, "lon": clon}, "zone": zona_de(lat, lon),
           "in_database": False, "coverage": [], "gaez_actual": [], "gaez_suitability": [], "gaez_growing": [],
           "climatology": [], "indicators_recent": [], "landcover": [], "stations_validation": None}

    cov = _por_celda("coverage", cid)
    if cov is not None and len(cov):
        out["coverage"] = registros(cov[["fuente", "disponible"]])
        out["in_database"] = bool(cov["disponible"].any())

    ga = _por_celda("gaez_actual", cid)
    if ga is not None and len(ga):
        ga = ga[~ga["es_grupo"]] if "es_grupo" in ga else ga
        last = ga[ga["year"] == ga["year"].max()]
        tot = last[last["water_supply"] == "Total"].sort_values("area_cosechada_kha", ascending=False)
        out["gaez_actual"] = registros(tot[["crop", "crop_code", "year", "area_cosechada_kha", "produccion_kt",
                                            "rendimiento_t_ha"]])

    gs = _por_celda("gaez_suitability", cid)
    if gs is not None and len(gs):
        cols = [c for c in ("crop", "indicador", "regimen_agua", "tipo_riego", "input_level", "valor_std", "unidad_std")
                if c in gs]
        out["gaez_suitability"] = registros(gs[cols])

    gg = _por_celda("gaez_growing", cid)
    if gg is not None and len(gg):
        out["gaez_growing"] = registros(gg[[c for c in ("sub_theme_name", "variable", "units", "valor") if c in gg]])

    cl = _por_celda("climatology", cid)
    if cl is not None and len(cl):
        out["climatology"] = registros(cl.sort_values(["fuente", "mes"]))

    ind = _por_celda("indicators_monthly", cid)
    if ind is not None and len(ind):
        out["indicators_recent"] = registros(ind.sort_values(["año", "mes"]).tail(24))

    lc = _por_celda("landcover", cid)
    if lc is not None and len(lc):
        out["landcover"] = registros(lc.sort_values(["año", "pct"], ascending=[True, False]))

    sv = _por_celda("stations_validation", cid)
    if sv is not None and len(sv):
        from .etl.stations import resumen_validacion

        out["stations_validation"] = {"summary": resumen_validacion(sv), "rows": registros(sv)}
    return out


def zona_resumen(zona: str) -> dict:
    """Resumen agregado de una zona piloto: cultivos principales, sequia reciente y validacion."""
    if zona not in PILOTOS:
        raise DatasetError(404, "Zona piloto no encontrada")
    out = {"zone": zona, "center": dict(zip(("lat", "lon"), PILOTOS[zona])), "bbox": AOIS[zona],
           "top_crops": [], "drought_recent": [], "stations_validation": [], "landcover_latest": []}

    ga = tabla("gaez_actual")
    if ga is not None:
        g = ga[(ga["zona"] == zona) & (ga["water_supply"] == "Total")]
        if "es_grupo" in g:
            g = g[~g["es_grupo"]]
        if len(g):
            g = g[g["year"] == g["year"].max()]
            top = (g.groupby("crop", as_index=False)
                     .agg(area_cosechada_kha=("area_cosechada_kha", "sum"), produccion_kt=("produccion_kt", "sum")))
            top["rendimiento_t_ha"] = top["produccion_kt"] / top["area_cosechada_kha"]
            out["top_crops"] = registros(top.sort_values("area_cosechada_kha", ascending=False), 15)

    ind = tabla("indicators_monthly")
    if ind is not None:
        i = ind[ind["zona"] == zona]
        if len(i):
            m = (i.groupby(["año", "mes"], as_index=False)
                   .agg(z_humedad_radicular=("z_humedad_radicular", "mean"),
                        celdas_sequia=("nivel_sequia", lambda s: int((s >= 1).sum())),
                        celdas=("cell_id", "nunique")))
            out["drought_recent"] = registros(m.sort_values(["año", "mes"]).tail(24))

    sv = tabla("stations_validation")
    if sv is not None:
        from .etl.stations import resumen_validacion

        s = sv[sv["zona"] == zona]
        if len(s):
            out["stations_validation"] = resumen_validacion(s)

    lc = tabla("landcover")
    if lc is not None:
        l = lc[lc["zona"] == zona]
        if len(l):
            l = l[l["año"] == l["año"].max()]
            agg = l.groupby("clase", as_index=False)["pct"].mean().sort_values("pct", ascending=False)
            out["landcover_latest"] = registros(agg)
    return out
