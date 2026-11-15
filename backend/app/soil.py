"""Suelo real por punto desde SSURGO via Soil Data Access (USDA NRCS). Solo EE. UU., sin cuenta."""
import json

import httpx

from .config import CACHE_DIR
SDA_URL = "https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest"
SDA_QUERY_PAGE = "https://sdmdataaccess.sc.egov.usda.gov/Query.aspx"


def sql_for(lat: float, lon: float) -> str:
    return f"""SELECT TOP 6 mu.muname, c.compname, c.comppct_r, c.drainagecl, c.hydgrp, c.slope_r,
 h.hzdepb_r, h.sandtotal_r, h.silttotal_r, h.claytotal_r, h.om_r, h.ph1to1h2o_r, h.ksat_r, h.awc_r
FROM mapunit mu
JOIN component c ON c.mukey = mu.mukey
JOIN chorizon h ON h.cokey = c.cokey
WHERE mu.mukey IN (SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point({lon} {lat})'))
AND c.majcompflag = 'Yes' AND h.hzdept_r = 0
ORDER BY c.comppct_r DESC"""


def wms_url(lat: float, lon: float, half: float = 0.01) -> str:
    bbox = f"{lon-half},{lat-half},{lon+half},{lat+half}"
    return ("https://sdmdataaccess.sc.egov.usda.gov/Spatial/SDM.wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap"
            f"&LAYERS=mapunitpoly&SRS=EPSG:4326&BBOX={bbox}&WIDTH=600&HEIGHT=600&FORMAT=image/png&STYLES=&TRANSPARENT=FALSE")


def _f(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def soil_at(lat: float, lon: float) -> dict:
    lat, lon = round(lat, 4), round(lon, 4)
    key = CACHE_DIR / f"soil_{lat}_{lon}.json"
    if key.exists():
        return json.loads(key.read_text(encoding="utf8"))
    sql = sql_for(lat, lon)
    out = {"available": False, "sql": sql, "query_page": SDA_QUERY_PAGE, "map_url": wms_url(lat, lon),
           "note": "Sin datos de SSURGO en este punto (cubre EE. UU. y no todas las zonas urbanas o de agua).", "components": []}
    try:
        r = httpx.post(SDA_URL, json={"query": sql, "format": "JSON+COLUMNNAME"}, timeout=60)
        r.raise_for_status()
        table = r.json().get("Table", [])
    except Exception:
        out["note"] = "No se pudo consultar SSURGO ahora. Intenta de nuevo."
        return out  # no se cachea el fallo
    if len(table) > 1:
        cols = table[0]
        comps = []
        for row in table[1:]:
            d = dict(zip(cols, row))
            comps.append({
                "map_unit": d["muname"], "name": d["compname"], "pct": _f(d["comppct_r"]),
                "drainage": d["drainagecl"], "hydgrp": d["hydgrp"], "slope": _f(d["slope_r"]),
                "topsoil_depth_cm": _f(d["hzdepb_r"]), "sand": _f(d["sandtotal_r"]), "silt": _f(d["silttotal_r"]),
                "clay": _f(d["claytotal_r"]), "om": _f(d["om_r"]), "ph": _f(d["ph1to1h2o_r"]),
                "ksat": _f(d["ksat_r"]), "awc": _f(d["awc_r"]),
            })
        out.update({"available": True, "components": comps, "note": "Suelo de la capa superior del componente dominante (SSURGO)."})
    key.write_text(json.dumps(out), encoding="utf8")
    return out
