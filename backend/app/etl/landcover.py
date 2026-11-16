"""Table 6: landcover. NLCD (MRLC via pygeohydro), only pilot zones in the contiguous U.S.

pygeohydro provides the "classic" NLCD (2001-2021), not the annual series since 1985.
Requires: pygeohydro, geopandas, shapely, pyproj, rioxarray (see requirements-etl.txt).
"""
import numpy as np
import pandas as pd

from .config import save
from .grid import AOIS, PILOTS, cell_id, register_coverage

# Class labels are stored data (column "clase"), so they stay in Spanish.
NLCD_CLASSES = {11: "Agua", 12: "Hielo/nieve", 21: "Desarrollado (abierto)", 22: "Desarrollado (bajo)",
                23: "Desarrollado (medio)", 24: "Desarrollado (alto)", 31: "Suelo desnudo",
                41: "Bosque caducifolio", 42: "Bosque perennifolio", 43: "Bosque mixto",
                52: "Matorral", 71: "Pastizal", 81: "Pasto/heno", 82: "Cultivos",
                90: "Humedal leñoso", 95: "Humedal herbáceo"}
NLCD_YEARS, NLCD_RES = [2001, 2011, 2021], 120          # meters; drop to 30 if the service can handle it


def in_conus(lat, lon):
    return 24.5 <= lat <= 49.5 and -125 <= lon <= -66.5


def build(years=NLCD_YEARS, resolution=NLCD_RES):
    import geopandas as gpd
    from pygeohydro import nlcd_bygeom
    from shapely.geometry import box

    us_zones = {z: AOIS[z] for z, c in PILOTS.items() if in_conus(*c)}
    print("zones with NLCD:", list(us_zones))
    rows = []
    for zone, (w, s, e, n) in us_zones.items():
        try:
            res = nlcd_bygeom(gpd.GeoSeries([box(w, s, e, n)], crs=4326), resolution=resolution,
                              years={"cover": list(years)})
        except Exception as ex:
            print("NLCD failed in", zone, type(ex).__name__, ex)
            continue
        ds = res[0] if isinstance(res, dict) else res
        for y in years:
            da = ds[f"cover_{y}"]
            X, Y = np.meshgrid(da["x"].values, da["y"].values)
            if np.nanmax(np.abs(X)) > 360:                   # projected coordinates -> lon/lat
                from pyproj import Transformer
                try:
                    crs_in = ds.rio.crs
                except Exception:
                    crs_in = None
                X, Y = Transformer.from_crs(crs_in or 5070, 4326, always_xy=True).transform(X, Y)
            v = da.values.astype(float)
            ok = np.isfinite(v) & (v > 0)
            d = pd.DataFrame({"cell_id": cell_id(Y[ok], X[ok]), "clase_id": v[ok].astype(int)})
            t = d.groupby(["cell_id", "clase_id"]).size().rename("px").reset_index()
            t["pct"] = 100 * t["px"] / t.groupby("cell_id")["px"].transform("sum")
            t["año"], t["zona"] = y, zone
            rows.append(t)
    if not rows:
        raise RuntimeError("landcover has no data: check the errors above")
    lc = pd.concat(rows)
    lc["clase"] = lc["clase_id"].map(NLCD_CLASSES).fillna("Otra")
    lc["es_cultivo"] = lc["clase_id"].isin([81, 82])
    lc = lc[["zona", "cell_id", "año", "clase_id", "clase", "es_cultivo", "pct"]]
    save(lc, "landcover")
    register_coverage("NLCD", lc["cell_id"].unique())
    return lc
