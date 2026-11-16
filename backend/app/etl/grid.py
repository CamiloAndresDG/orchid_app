"""Canonical grid (GLDAS 0.25 degrees), pilot zones, and tables 1 (cells) and 2 (coverage).

Persisted column names (zona, fuente, disponible, valor) are kept in Spanish: they are the parquet schema.
"""
import math
import warnings

import numpy as np
import pandas as pd

from .config import DB, save

RES = 0.25
NLON = int(360 / RES)

PILOTS = {                       # name: (lat, lon)
    "california_central": (38.5, -121.4),
    "iowa":               (42.0,  -93.5),
    "pampas_argentina":   (-33.0, -61.5),
    "bajio_mexico":       (20.9, -101.0),
    "punjab_india":       (30.9,  75.8),
    "ebro_espana":        (41.6,  -0.9),
    "rift_kenia":         (-0.3,  35.3),
}
RADIUS_KM = 100


def bbox_from_point(lat, lon, radius_km=RADIUS_KM):
    dlat = radius_km / 111.0
    dlon = radius_km / (111.0 * np.cos(np.radians(lat)))
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


AOIS = {z: snap(bbox_from_point(*c)) for z, c in PILOTS.items()}


def zone_of(lat: float, lon: float) -> str | None:
    """Pilot zone whose box contains the point (or None)."""
    for z, (w, s, e, n) in AOIS.items():
        if s <= lat <= n and w <= lon <= e:
            return z
    return None


def distance_km(lat1, lon1, lat2, lon2) -> float:
    p = math.pi / 180
    a = (math.sin((lat2 - lat1) * p / 2) ** 2
         + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2)
    return 12742 * math.asin(math.sqrt(a))


def cells_table() -> pd.DataFrame:
    rows = []
    for zone, (w, s, e, n) in AOIS.items():
        lats = np.arange(s + RES / 2, n, RES)
        lons = np.arange(w + RES / 2, e, RES)
        LA, LO = np.meshgrid(lats, lons, indexing="ij")
        rows.append(pd.DataFrame({"cell_id": cell_id(LA, LO).ravel(),
                                  "lat": LA.ravel(), "lon": LO.ravel(), "zona": zone}))
    return pd.concat(rows).drop_duplicates("cell_id").reset_index(drop=True)


def build_cells() -> pd.DataFrame:
    cells = cells_table()
    save(cells, "cells")
    return cells


def register_coverage(source, cell_ids):
    """TABLE 2: records which cells each source covers (fills itself as the other tables are built)."""
    cells = cells_table()
    path = DB / "coverage.parquet"
    new = pd.DataFrame({"cell_id": cells["cell_id"], "fuente": source,
                        "disponible": cells["cell_id"].isin(set(cell_ids))})
    if path.exists():
        prev = pd.read_parquet(path)
        new = pd.concat([prev[prev["fuente"] != source], new])
    new.to_parquet(path, index=False)


# ---------- raster helpers ----------
def read_blocks(src, bbox, agg="sum", zero_is_nodata=True):
    """Reads the bbox window of a raster opened with rasterio and aggregates it to the 0.25-degree grid."""
    from rasterio.windows import Window

    w, s, e, n = bbox
    rx, ry = src.res
    x0, y0 = src.transform.c, src.transform.f
    c0 = int(round((w - x0) / rx)); c1 = int(round((e - x0) / rx))
    r0 = int(round((y0 - n) / ry)); r1 = int(round((y0 - s) / ry))
    a = src.read(1, window=Window(c0, r0, c1 - c0, r1 - r0), boundless=True,
                 fill_value=src.nodata if src.nodata is not None else 0).astype("float64")
    bad = ~np.isfinite(a)
    if src.nodata is not None:
        bad |= (a == src.nodata)
    if zero_is_nodata:
        bad |= (a <= 0)
    f = max(1, int(round(RES / rx)))
    nr, nc = a.shape[0] // f, a.shape[1] // f
    bl = np.where(bad, np.nan, a)[:nr * f, :nc * f].reshape(nr, f, nc, f)
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
