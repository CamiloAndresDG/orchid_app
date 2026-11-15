"""Cuadricula canonica (GLDAS 0.25 grados), zonas piloto y tablas 1 (cells) y 2 (coverage)."""
import math
import warnings

import numpy as np
import pandas as pd

from .config import DB, guardar

RES = 0.25
NLON = int(360 / RES)

PILOTOS = {                      # nombre: (lat, lon)
    "california_central": (38.5, -121.4),
    "iowa":               (42.0,  -93.5),
    "pampas_argentina":   (-33.0, -61.5),
    "bajio_mexico":       (20.9, -101.0),
    "punjab_india":       (30.9,  75.8),
    "ebro_espana":        (41.6,  -0.9),
    "rift_kenia":         (-0.3,  35.3),
}
RADIO_KM = 100


def bbox_from_point(lat, lon, radio_km=RADIO_KM):
    dlat = radio_km / 111.0
    dlon = radio_km / (111.0 * np.cos(np.radians(lat)))
    return (lon - dlon, lat - dlat, lon + dlon, lat + dlat)


def snap(b):
    w, s, e, n = b
    return (float(np.floor(w / RES) * RES), float(np.floor(s / RES) * RES),
            float(np.ceil(e / RES) * RES), float(np.ceil(n / RES) * RES))


def cell_id(lat, lon):
    i = np.floor((np.asarray(lat) + 90) / RES).astype(int)
    j = np.floor((np.asarray(lon) + 180) / RES).astype(int)
    return i * NLON + j


def cell_center(cid: int) -> tuple[float, float]:
    i, j = divmod(int(cid), NLON)
    return (i * RES - 90 + RES / 2, j * RES - 180 + RES / 2)


AOIS = {z: snap(bbox_from_point(*c)) for z, c in PILOTOS.items()}


def zona_de(lat: float, lon: float) -> str | None:
    """Zona piloto cuyo recuadro contiene el punto (o None)."""
    for z, (w, s, e, n) in AOIS.items():
        if s <= lat <= n and w <= lon <= e:
            return z
    return None


def distancia_km(lat1, lon1, lat2, lon2) -> float:
    p = math.pi / 180
    a = (math.sin((lat2 - lat1) * p / 2) ** 2
         + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2)
    return 12742 * math.asin(math.sqrt(a))


def tabla_cells() -> pd.DataFrame:
    filas = []
    for zona, (w, s, e, n) in AOIS.items():
        lats = np.arange(s + RES / 2, n, RES)
        lons = np.arange(w + RES / 2, e, RES)
        LA, LO = np.meshgrid(lats, lons, indexing="ij")
        filas.append(pd.DataFrame({"cell_id": cell_id(LA, LO).ravel(),
                                   "lat": LA.ravel(), "lon": LO.ravel(), "zona": zona}))
    return pd.concat(filas).drop_duplicates("cell_id").reset_index(drop=True)


def construir_cells() -> pd.DataFrame:
    cells = tabla_cells()
    guardar(cells, "cells")
    return cells


def registrar_cobertura(fuente, cell_ids):
    """TABLA 2: marca que celdas cubre cada fuente (se llena sola al construir las demas)."""
    cells = tabla_cells()
    ruta = DB / "coverage.parquet"
    nuevo = pd.DataFrame({"cell_id": cells["cell_id"], "fuente": fuente,
                          "disponible": cells["cell_id"].isin(set(cell_ids))})
    if ruta.exists():
        ant = pd.read_parquet(ruta)
        nuevo = pd.concat([ant[ant["fuente"] != fuente], nuevo])
    nuevo.to_parquet(ruta, index=False)


# ---------- utilidades de rasters ----------
def leer_bloques(src, bbox, agg="sum", cero_es_nodata=True):
    """Lee la ventana del bbox de un raster abierto con rasterio y agrega a la cuadricula de 0.25 grados."""
    from rasterio.windows import Window

    w, s, e, n = bbox
    rx, ry = src.res
    x0, y0 = src.transform.c, src.transform.f
    c0 = int(round((w - x0) / rx)); c1 = int(round((e - x0) / rx))
    r0 = int(round((y0 - n) / ry)); r1 = int(round((y0 - s) / ry))
    a = src.read(1, window=Window(c0, r0, c1 - c0, r1 - r0), boundless=True,
                 fill_value=src.nodata if src.nodata is not None else 0).astype("float64")
    malo = ~np.isfinite(a)
    if src.nodata is not None:
        malo |= (a == src.nodata)
    if cero_es_nodata:
        malo |= (a <= 0)
    f = max(1, int(round(RES / rx)))
    nr, nc = a.shape[0] // f, a.shape[1] // f
    bl = np.where(malo, np.nan, a)[:nr * f, :nc * f].reshape(nr, f, nc, f)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        if agg == "sum":
            v = np.nansum(bl, axis=(1, 3))
            v[np.all(np.isnan(bl), axis=(1, 3))] = np.nan
        else:
            v = np.nanmean(bl, axis=(1, 3))
    lat_c = n - (np.arange(nr) + 0.5) * RES
    lon_c = w + (np.arange(nc) + 0.5) * RES
    LA, LO = np.meshgrid(lat_c, lon_c, indexing="ij")
    return pd.DataFrame({"cell_id": cell_id(LA, LO).ravel(), "lat": LA.ravel(),
                         "lon": LO.ravel(), "valor": v.ravel()})
