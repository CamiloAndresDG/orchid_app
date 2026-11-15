"""Tabla 6: landcover. NLCD (MRLC via pygeohydro), solo zonas piloto de EE. UU. contiguo.

pygeohydro da el NLCD "clasico" (2001-2021), no la serie anual desde 1985.
Requiere: pygeohydro, geopandas, shapely, pyproj, rioxarray (ver requirements-etl.txt).
"""
import numpy as np
import pandas as pd

from .config import guardar
from .grid import AOIS, PILOTOS, cell_id, registrar_cobertura

NLCD_CLASSES = {11: "Agua", 12: "Hielo/nieve", 21: "Desarrollado (abierto)", 22: "Desarrollado (bajo)",
                23: "Desarrollado (medio)", 24: "Desarrollado (alto)", 31: "Suelo desnudo",
                41: "Bosque caducifolio", 42: "Bosque perennifolio", 43: "Bosque mixto",
                52: "Matorral", 71: "Pastizal", 81: "Pasto/heno", 82: "Cultivos",
                90: "Humedal leñoso", 95: "Humedal herbáceo"}
NLCD_ANIOS, NLCD_RES = [2001, 2011, 2021], 120          # metros; baja a 30 si el servicio lo aguanta


def en_conus(lat, lon):
    return 24.5 <= lat <= 49.5 and -125 <= lon <= -66.5


def construir(anios=NLCD_ANIOS, resolucion=NLCD_RES):
    import geopandas as gpd
    from pygeohydro import nlcd_bygeom
    from shapely.geometry import box

    zonas_us = {z: AOIS[z] for z, c in PILOTOS.items() if en_conus(*c)}
    print("zonas con NLCD:", list(zonas_us))
    filas = []
    for zona, (w, s, e, n) in zonas_us.items():
        try:
            res = nlcd_bygeom(gpd.GeoSeries([box(w, s, e, n)], crs=4326), resolution=resolucion,
                              years={"cover": list(anios)})
        except Exception as ex:
            print("NLCD fallo en", zona, type(ex).__name__, ex)
            continue
        ds = res[0] if isinstance(res, dict) else res
        for y in anios:
            da = ds[f"cover_{y}"]
            X, Y = np.meshgrid(da["x"].values, da["y"].values)
            if np.nanmax(np.abs(X)) > 360:                   # coordenadas proyectadas -> lon/lat
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
            t["año"], t["zona"] = y, zona
            filas.append(t)
    if not filas:
        raise RuntimeError("landcover sin datos: revisa los errores de arriba")
    lc = pd.concat(filas)
    lc["clase"] = lc["clase_id"].map(NLCD_CLASSES).fillna("Otra")
    lc["es_cultivo"] = lc["clase_id"].isin([81, 82])
    lc = lc[["zona", "cell_id", "año", "clase_id", "clase", "es_cultivo", "pct"]]
    guardar(lc, "landcover")
    registrar_cobertura("NLCD", lc["cell_id"].unique())
    return lc
