"""GAEZ v4 (FAO/IIASA): server catalog, tables 3, 8 and 9, and live point queries.

- Theme 2 (res01): growing period and thermal and moisture regimes        -> gaez_growing
- Theme 4 (res05): suitability, attainable yield and water deficit         -> gaez_suitability
- Theme 5 (res06): actual harvested area, production and yield (2010)      -> gaez_actual

Tables are built by reading only each pilot zone's window from the GeoTIFFs (COG) the catalog
publishes in `download_url` (requires rasterio). Point queries use the ImageServer `identify`
operation, which returns the value of every raster in the filter in a single call (no rasterio needed).

Text returned to the farmer (notes, sources, class words) stays in Spanish here; localize.py translates
it on the way out. Response keys such as `secano`/`riego` and the parquet columns are part of the API
contract and the stored schema, so they stay as they are.
"""
import json
import re
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

from .config import RAW, DB, save

GAEZ = "https://gaez-services.fao.org/server/rest/services"
from ..config import CACHE_DIR  # noqa: E402  (shared cache; on Azure it is Azure Files)

SERV_T2 = "res01"
WHERE_T2 = (
    "rcp = 'Historical' AND model = 'CRUTS32' AND year = '1981-2010' "
    "AND sub_theme_name IN ('Growing Period', 'Moisture Regime', 'Thermal Regime') "
    "AND units <> 'Class'"
)
SERV_T4 = "res05"
WHERE_T4 = (
    "rcp = 'Historical' AND model = 'CRUTS32' AND year = '1981-2010' AND ("
    "variable LIKE 'Suitability index%current cropland%' OR "
    "variable LIKE 'Average attainable yield of current cropland%' OR "
    "variable LIKE 'Water deficit/net irrigation requirement%current cropland%')"
)
SERV_T5 = "res06"
WHERE_T5 = "year = '2010' AND water_supply IN ('Irrigated', 'Rainfed', 'Total') " \
           "AND (variable IN ('Harvested area', 'Production') OR (variable = 'Yield' AND units = 't/ha'))"
MAX_RASTERS = 3000

# GAEZ Theme 5 aggregates: flagged so they aren't summed with the individual crops.
GROUPS = {"Pulses", "Other cereals", "Rest of crops", "Fruits and nuts", "Vegetables",
          "Fodder crops", "Stimulants", "Oil seeds", "Root crops", "Cereals", "Main crops"}


# ---------------------------------------------------------------- catalog
def _gaez(url, params, post=True):
    p = {**params, "f": "json"}
    err = None
    for attempt in range(3):
        try:
            r = (httpx.post(url, data=p, timeout=httpx.Timeout(180, connect=15)) if post
                 else httpx.get(url, params=p, timeout=httpx.Timeout(180, connect=15)))
            r.raise_for_status()
            j = r.json()
            if "error" in j:
                raise RuntimeError(j["error"])
            return j
        except Exception as ex:
            err = ex
            time.sleep(2 * (attempt + 1))
    raise err


def _lower(attrs: dict) -> dict:
    """GAEZ services disagree on casing (res06 uses Name/OBJECTID): lowercase everything."""
    return {k.lower(): v for k, v in attrs.items()}


def light_fields(service):
    info = _gaez(f"{GAEZ}/{service}/ImageServer", {}, post=False)
    return ",".join(f["name"] for f in info["fields"]
                    if "Blob" not in f["type"] and "Geometry" not in f["type"])


def service_ids(service, where="1=1"):
    j = _gaez(f"{GAEZ}/{service}/ImageServer/query", {"where": where, "returnIdsOnly": "true"})
    return sorted(j.get("objectIds") or [])


def records(service, ids, fields, batch=300):
    import pandas as pd

    rows = []
    for i in range(0, len(ids), batch):
        j = _gaez(f"{GAEZ}/{service}/ImageServer/query",
                  {"objectIds": ",".join(map(str, ids[i:i + batch])), "outFields": fields, "returnGeometry": "false"})
        rows += [_lower(f["attributes"]) for f in j.get("features", [])]
    return pd.DataFrame(rows)


def list_services():
    j = _gaez(GAEZ, {}, post=False)
    out = [(s["name"], s["type"]) for s in j.get("services", [])]
    for folder in j.get("folders", []):
        jj = _gaez(f"{GAEZ}/{folder}", {}, post=False)
        out += [(s["name"], s["type"]) for s in jj.get("services", [])]
    return out


def summarize_catalog(service, n=1500, show=25):
    """Spread sample of the catalog (evenly spaced ids) and distinct values per text field."""
    import pandas as pd

    ids = service_ids(service)
    print(f"{service}: {len(ids)} rasters in the catalog")
    if not ids:
        return pd.DataFrame()
    step = max(1, len(ids) // n)
    m = records(service, ids[::step], light_fields(service))
    print("fields:", list(m.columns), "| has download_url?:", "download_url" in m.columns)
    for c in m.columns:
        if c in ("download_url", "filepath", "renderer", "file_id", "file_description", "Shape") or m[c].dtype != object:
            continue
        print(f"\n{c} ({m[c].nunique()} values in the sample):", m[c].value_counts().head(show).to_dict())
    return m


def preview(service, where, show=20):
    """Counts the rasters matching the filter and summarizes their attributes before building a table."""
    ids = service_ids(service, where)
    print(f"{service}: {len(ids)} rasters match the filter (cap {MAX_RASTERS})")
    if not ids:
        return None
    m = records(service, ids, "objectid,name,sub_theme_name,variable,crop,water_supply,input_level,units")
    for c in ("sub_theme_name", "variable", "crop", "water_supply", "input_level", "units"):
        if c in m and m[c].notna().any():
            print(f"  {c} ({m[c].nunique()}):", m[c].value_counts().head(show).to_dict())
    return m


# ---------------------------------------------------------------- table building (ETL)
def _read_raster(source, agg, zero_is_nodata, aois=None):
    """Reads a raster (local path or URL) over every pilot zone. Returns a DataFrame or None."""
    import pandas as pd
    import rasterio

    from .grid import AOIS, read_blocks

    aois = aois or AOIS
    try:
        with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_TIMEOUT="60",
                          GDAL_HTTP_MAX_RETRY="3", GDAL_HTTP_RETRY_DELAY="2"):
            with rasterio.open(str(source)) as src:
                parts = []
                for zone, bbox in aois.items():
                    d = read_blocks(src, bbox, agg=agg, zero_is_nodata=zero_is_nodata)
                    d["zona"] = zone
                    parts.append(d)
    except Exception as ex:
        print("failed", str(source)[-60:], type(ex).__name__, str(ex)[:200])
        return None
    return pd.concat(parts)


def build_gaez(service, where, name, source, agg="mean", zero_is_nodata=False, threads=8):
    """Tables 8 and 9: reads every raster in the filter over the pilot zones and saves a long table."""
    import pandas as pd

    from .grid import register_coverage

    if not where:
        print(name, "skipped (no filter)")
        return None
    ids = service_ids(service, where)
    print(f"{name}: {len(ids)} rasters in {service}")
    if not ids:
        return None
    if len(ids) > MAX_RASTERS:
        raise ValueError(f"{len(ids)} rasters exceed the cap of {MAX_RASTERS}: narrow the filter")
    cat = records(service, ids, light_fields(service))
    cat = cat[cat["download_url"].notna()]
    meta = [c for c in ("objectid", "name", "sub_theme_name", "variable", "year", "model", "rcp", "crop",
                        "water_supply", "input_level", "units") if c in cat]

    def process(row):
        d = _read_raster(row["download_url"], agg, zero_is_nodata)
        if d is None:
            return None
        d = d.dropna(subset=["valor"])
        for c in meta:
            d[c] = row[c]
        return d

    t0 = time.time()
    with ThreadPoolExecutor(threads) as ex:
        parts = [p for p in ex.map(process, [r for _, r in cat.iterrows()]) if p is not None and len(p)]
    print(f"{name}: {len(parts)}/{len(cat)} rasters read in {time.time() - t0:.0f}s")
    if not parts:
        return None
    df = pd.concat(parts, ignore_index=True)
    for c in ("sub_theme_name", "water_supply", "variable", "units"):
        if c in df:
            df[c] = df[c].astype(str).str.strip()
    if name == "gaez_suitability":
        df = normalize_suitability(df)
    save(df, name)
    register_coverage(source, df["cell_id"].unique())
    return df


def normalize_suitability(gs):
    """Readable columns: indicator, water regime, irrigation type and standard units (idempotent)."""
    import numpy as np

    if "indicador" in gs.columns:
        return gs
    v = gs["variable"].str.lower()
    gs["indicador"] = np.select(
        [v.str.startswith("suitability index"), v.str.startswith("average attainable yield"),
         v.str.startswith("water deficit")],
        ["idoneidad_0_10000", "rendimiento_alcanzable", "deficit_hidrico_mm"], default="otro")
    ws = gs["water_supply"].str.strip()
    gs["regimen_agua"] = np.where(ws.str.startswith("Rainfed"), "secano", "riego")
    gs["tipo_riego"] = ws.where(gs["regimen_agua"] == "riego")
    u = gs["units"].str.strip()
    gs["valor_std"] = np.where(u == "10kg DW/ha", gs["valor"] * 10, gs["valor"])
    gs["unidad_std"] = u.replace({"10kg DW/ha": "kg DW/ha"})
    return gs


def build_growing():
    return build_gaez(SERV_T2, WHERE_T2, "gaez_growing", "GAEZ_T2")


def build_suitability():
    return build_gaez(SERV_T4, WHERE_T4, "gaez_suitability", "GAEZ_T4")


# ---- Table 3: gaez_actual ----
SUPPLY = {"I": "Irrigated", "R": "Rainfed", "T": "Total"}      # 'V' (value aggregates) is left out
VARIABLE = {"har": "area_cosechada_kha", "prd": "produccion_kt"}
SERVER_VARIABLE = {"Harvested area": "area_cosechada_kha", "Production": "produccion_kt"}
PAT = re.compile(r"^(?P<crop_code>[a-z0-9]+)_(?P<year>\d{4})_(?P<var>[a-z]+)$", re.I)


def crop_names():
    """code -> crop name (light query to the FAO server, saved in db/nombres_cultivo.csv)."""
    import pandas as pd

    path = DB / "nombres_cultivo.csv"
    if not path.exists():
        try:
            j = _gaez(f"{GAEZ}/{SERV_T5}/ImageServer/query",
                      {"where": "1=1", "outFields": "name,crop", "returnGeometry": "false", "resultRecordCount": 2000})
            cs = pd.DataFrame([_lower(f["attributes"]) for f in j["features"]])
            cs["crop_code"] = cs["name"].str.split("_").str[0].str.lower()
            cs[["crop_code", "crop"]].drop_duplicates("crop_code").to_csv(path, index=False)
        except Exception as ex:
            print("Couldn't get crop names; the code will be used instead:", type(ex).__name__)
            return {}
    names = pd.read_csv(path).drop_duplicates("crop_code")
    return dict(zip(names["crop_code"], names["crop"]))


def extract(archive: Path, dest: Path):
    """Extracts a .rar/.zip/.7z with 7-Zip (must be installed and on the PATH)."""
    if dest.exists() and any(dest.rglob("*.tif")):
        return
    dest.mkdir(parents=True, exist_ok=True)
    subprocess.run(["7z", "x", str(archive), f"-o{dest}", "-y"], check=True, stdout=subprocess.DEVNULL)
    print("extracted to", dest)


def _local_catalog(origin: Path):
    """Catalog of the Theme 5 .tif files downloaded by hand (folders I, R, T with crop_year_var.tif files)."""
    import pandas as pd

    if origin.is_file():
        dest = RAW / "gaez_t5"
        extract(origin, dest)
        origin = dest
    cand = [p.parent for p in origin.rglob("I") if p.is_dir() and (p.parent / "R").is_dir()]
    if not cand:
        raise FileNotFoundError(f"Can't find a folder with I and R inside {origin}")
    base = cand[0]
    rows = []
    for p in sorted(base.rglob("*.tif")):
        m = PAT.match(p.stem)
        if m:
            rows.append({"source": p, "folder": p.relative_to(base).parts[0],
                         "crop_code": m["crop_code"].lower(), "year": int(m["year"]), "var": m["var"].lower()})
    loc = pd.DataFrame(rows)
    names = crop_names()
    loc["crop"] = loc["crop_code"].map(names).fillna(loc["crop_code"])
    sel = loc[loc["folder"].isin(SUPPLY) & loc["var"].isin(VARIABLE)].copy()
    sel["water_supply"] = sel["folder"].map(SUPPLY)
    sel["var"] = sel["var"].map(VARIABLE)
    return sel


def _server_catalog():
    cat = records(SERV_T5, service_ids(SERV_T5, WHERE_T5 + " AND variable IN ('Harvested area', 'Production')"),
                  light_fields(SERV_T5))
    cat = cat[cat["download_url"].notna()].copy()
    cat["source"] = cat["download_url"]
    cat["crop_code"] = cat["name"].str.split("_").str[0].str.lower()
    cat["year"] = cat["year"].astype(int)
    cat["var"] = cat["variable"].str.strip().map(SERVER_VARIABLE)
    cat["water_supply"] = cat["water_supply"].str.strip()
    return cat[["source", "crop_code", "crop", "year", "var", "water_supply"]]


def build_actual(origin: str | Path | None = None, threads=8):
    """Table 3. `origin`: None = FAO server (res06, 2010); or path to the downloaded Theme 5 folder/file."""
    import pandas as pd

    from .grid import register_coverage

    sel = _local_catalog(Path(origin)) if origin else _server_catalog()
    print("gaez_actual: rasters to process:", len(sel))

    def process(row):
        d = _read_raster(row["source"], "sum", True)
        if d is None:
            return None
        d = d.dropna(subset=["valor"])
        d["crop"], d["crop_code"] = row["crop"], row["crop_code"]
        d["water_supply"], d["year"], d["var"] = row["water_supply"], row["year"], row["var"]
        return d

    with ThreadPoolExecutor(threads) as ex:
        parts = [p for p in ex.map(process, [r for _, r in sel.iterrows()]) if p is not None and len(p)]
    print("gaez_actual: rasters read:", len(parts))
    long = pd.concat(parts)
    wide = long.pivot_table(index=["cell_id", "lat", "lon", "zona", "crop_code", "crop", "water_supply", "year"],
                            columns="var", values="valor", aggfunc="sum").reset_index()
    wide.columns.name = None
    wide["rendimiento_t_ha"] = wide["produccion_kt"] / wide["area_cosechada_kha"]   # 1000 t / 1000 ha
    wide = wide[wide["area_cosechada_kha"] > 0].reset_index(drop=True)
    wide["es_grupo"] = wide["crop"].isin(GROUPS)
    save(wide, "gaez_actual")
    register_coverage("GAEZ_T5", wide["cell_id"].unique())
    return wide


# ---------------------------------------------------------------- live point queries
def identify(service: str, where: str, lat: float, lon: float) -> list[dict]:
    """Value of every raster in the filter at the point: [{...attributes, 'valor': float|None}]."""
    j = _gaez(f"{GAEZ}/{service}/ImageServer/identify", {
        "geometry": json.dumps({"x": lon, "y": lat, "spatialReference": {"wkid": 4326}}),
        "geometryType": "esriGeometryPoint",
        "mosaicRule": json.dumps({"mosaicMethod": "esriMosaicAttribute", "where": where}),
        "returnGeometry": "false", "returnCatalogItems": "true", "returnPixelValues": "true",
        "maxItemCount": 5000,
    })
    items = (j.get("catalogItems") or {}).get("features", [])
    vals = (j.get("properties") or {}).get("Values", [])
    out = []
    for f, v in zip(items, vals):
        a = {k: (x.strip() if isinstance(x, str) else x) for k, x in _lower(f["attributes"]).items()
             if k in ("objectid", "name", "sub_theme_name", "variable", "crop", "water_supply", "input_level", "units", "year")}
        try:
            a["valor"] = float(v)
        except (TypeError, ValueError):
            a["valor"] = None        # NoData
        out.append(a)
    return out


def _cached(kind: str, lat: float, lon: float, fn):
    key = CACHE_DIR / f"gaez_{kind}_{lat:.3f}_{lon:.3f}.json"
    if key.exists():
        return json.loads(key.read_text(encoding="utf8"))
    out = fn()
    if out.get("available"):
        key.write_text(json.dumps(out), encoding="utf8")
    return out


def suitability_class(si: float | None) -> str | None:
    """GAEZ suitability classes from the 0-10000 index (Spanish words; localize.py translates them)."""
    if si is None:
        return None
    for limit, name in ((8500, "muy alta"), (7000, "alta"), (5500, "buena"), (4000, "media"),
                        (2500, "moderada"), (1000, "marginal"), (1, "muy marginal")):
        if si >= limit:
            return name
    return "no apta"


def _num(v, nd=0):
    return None if v is None else round(v, nd)


def suitability_at(lat: float, lon: float, input_level: str = "High") -> dict:
    """Theme 4 at the point: per crop, suitability and attainable yield rainfed (secano) and irrigated (riego)."""
    lat, lon = round(lat, 3), round(lon, 3)

    def calc():
        base = {"available": False, "lat": lat, "lon": lon, "input_level": input_level, "crops": [],
                "source": "GAEZ v4 Tema 4 (FAO/IIASA), clima 1981-2010 (CRU TS 3.2), tierra de cultivo actual",
                "note": ""}
        try:
            rows = identify(SERV_T4, WHERE_T4 + f" AND input_level = '{input_level}'", lat, lon)
        except Exception as ex:
            base["note"] = f"No se pudo consultar GAEZ ahora ({type(ex).__name__}). Intenta de nuevo."
            return base
        crops: dict[str, dict] = {}
        for r in rows:
            v, var = r["valor"], (r.get("variable") or "").lower()
            if v is None or v < 0:
                continue
            c = crops.setdefault(r["crop"], {"crop": r["crop"], "secano": {}, "riego": {}})
            ws = r.get("water_supply") or ""
            regime = "secano" if ws.startswith("Rainfed") else "riego"
            slot = c[regime]
            units = (r.get("units") or "").strip()
            if var.startswith("suitability index"):
                if regime == "riego" and slot.get("suitability", -1) >= v:
                    continue
                slot["suitability"] = v
                slot["suitability_class"] = suitability_class(v)
                if regime == "riego":
                    slot["irrigation_type"] = ws
            elif var.startswith("average attainable yield"):
                if units == "10kg DW/ha":
                    v, units = v * 10, "kg DW/ha"
                if regime == "riego" and slot.get("attainable_yield", -1) >= v:
                    continue
                slot["attainable_yield"] = _num(v)
                slot["yield_units"] = units
            elif var.startswith("water deficit"):
                slot["water_deficit_mm"] = _num(v)
        found = [c for c in crops.values() if c["secano"] or c["riego"]]
        found.sort(key=lambda c: -max(c["secano"].get("suitability", 0), c["riego"].get("suitability", 0)))
        base.update(available=bool(found), crops=found,
                    note="Idoneidad 0-10000 (clases GAEZ). Rendimiento alcanzable en kg de materia seca por "
                         "hectarea salvo que se indique otra unidad. Riego: el mejor sistema disponible."
                    if found else "GAEZ no tiene datos de tierra de cultivo en este punto (agua, ciudad o fuera de tierra cultivada).")
        return base

    return _cached(f"suit_{input_level}", lat, lon, calc)


# GAEZ variable -> short key for the most used indicators
T2_KEYS = {
    "Total number of growing period days": "growing_period_days",
    "Number of days with Tmin < 0 °C": "frost_days",
    "Number of days with Tmax > 35 °C": "heat_days_35",
    "Number of days with Tmax > 40 °C": "heat_days_40",
    "Annual precipitation (mm)": "annual_precip_mm",
    "Annual P/PET ratio (*100)": "p_pet_pct",
    "Annual temperature sum for days with Ta>5 °C (degree-days)": "degree_days_5",
    "Beginning date of earliest growing period (day-of-year; for": "growing_period_start_doy",
    "Mean annual temperature": "mean_temp_c",
    "Temperature of coolest month (°C*100)": "coolest_month_c",
    "Temperature of warmest month (°C*100)": "warmest_month_c",
    "Total number of rain days (days with P > 1 mm)": "rain_days",
}


def growing_at(lat: float, lon: float) -> dict:
    """Theme 2 at the point: growing period and thermal and moisture regimes (1981-2010)."""
    lat, lon = round(lat, 3), round(lon, 3)

    def calc():
        base = {"available": False, "lat": lat, "lon": lon, "highlights": {}, "variables": [],
                "source": "GAEZ v4 Tema 2 (FAO/IIASA), clima historico 1981-2010 (CRU TS 3.2)", "note": ""}
        try:
            rows = identify(SERV_T2, WHERE_T2, lat, lon)
        except Exception as ex:
            base["note"] = f"No se pudo consultar GAEZ ahora ({type(ex).__name__}). Intenta de nuevo."
            return base
        variables, highlights = [], {}
        for r in rows:
            v, var = r["valor"], r.get("variable") or ""
            if v is None:
                continue
            if "*100" in var and "P/PET" not in var:
                v = v / 100            # temperatures stored as degrees C x 100
            item = {"theme": r.get("sub_theme_name"), "variable": var, "units": r.get("units"),
                    "code": (r.get("name") or "").split("_")[0], "value": round(v, 2)}
            variables.append(item)
            for prefix, key in T2_KEYS.items():
                if var.startswith(prefix):
                    highlights[key] = item["value"]
        variables.sort(key=lambda x: (x["theme"] or "", x["variable"]))
        ok = bool(variables) and any(x["value"] != 0 for x in variables)
        base.update(available=ok, variables=variables, highlights=highlights,
                    note="" if ok else "GAEZ no tiene datos agroclimaticos en este punto (agua o fuera de tierra).")
        return base

    return _cached("grow", lat, lon, calc)


def actual_at(lat: float, lon: float) -> dict:
    """Theme 5 at the point (~9 km pixel): actual harvested area, production and yield in 2010."""
    lat, lon = round(lat, 3), round(lon, 3)

    def calc():
        base = {"available": False, "lat": lat, "lon": lon, "year": 2010, "crops": [],
                "source": "GAEZ v4 Tema 5 (FAO/IIASA), produccion y rendimiento reales 2010, pixel de 5 minutos de arco",
                "note": ""}
        try:
            rows = identify(SERV_T5, WHERE_T5, lat, lon)
        except Exception as ex:
            base["note"] = f"No se pudo consultar GAEZ ahora ({type(ex).__name__}). Intenta de nuevo."
            return base
        crops: dict[str, dict] = {}
        key = {"Harvested area": "area_kha", "Production": "production_kt", "Yield": "yield_t_ha"}
        regime = {"Total": "total", "Rainfed": "rainfed", "Irrigated": "irrigated"}
        for r in rows:
            v = r["valor"]
            if v is None or v <= 0 or r.get("crop") in GROUPS:
                continue
            c = crops.setdefault(r["crop"], {"crop": r["crop"], "total": {}, "rainfed": {}, "irrigated": {}})
            c[regime[r["water_supply"]]][key[r["variable"]]] = round(v, 3)
        found = [c for c in crops.values() if c["total"].get("area_kha")]
        for c in found:
            c["area_ha"] = round(c["total"]["area_kha"] * 1000)
            irr = c["irrigated"].get("area_kha", 0)
            c["irrigated_share"] = round(irr / c["total"]["area_kha"], 2) if c["total"]["area_kha"] else None
        found.sort(key=lambda c: -c["area_ha"])
        base.update(available=bool(found), crops=found,
                    note="Hectareas cosechadas en el pixel (~85 km2 en el ecuador) y rendimiento medio en t/ha."
                    if found else "GAEZ no registra cultivos cosechados en este pixel.")
        return base

    return _cached("actual", lat, lon, calc)
