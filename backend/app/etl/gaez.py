"""GAEZ v4 (FAO/IIASA): catalogo del servidor, tablas 3, 8 y 9, y consultas en vivo por punto.

- Tema 2 (res01): periodo de crecimiento y regimenes termico y de humedad  -> gaez_growing
- Tema 4 (res05): idoneidad, rendimiento alcanzable y deficit hidrico      -> gaez_suitability
- Tema 5 (res06): area cosechada, produccion y rendimiento reales (2010)   -> gaez_actual

Las tablas se construyen leyendo solo la ventana de cada zona piloto de los GeoTIFF (COG) que el
catalogo publica en `download_url` (requiere rasterio). Las consultas por punto usan la operacion
`identify` del ImageServer, que devuelve en una sola llamada el valor de todos los rasters del filtro
(no requiere rasterio).
"""
import json
import re
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

from .config import RAW, DB, guardar

GAEZ = "https://gaez-services.fao.org/server/rest/services"
CACHE_DIR = Path(__file__).resolve().parents[2] / "cache"
CACHE_DIR.mkdir(exist_ok=True)

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
TOPE_RASTERS = 3000

# Agregados de GAEZ Tema 5: se marcan para no sumarlos con los cultivos individuales.
GRUPOS = {"Pulses", "Other cereals", "Rest of crops", "Fruits and nuts", "Vegetables",
          "Fodder crops", "Stimulants", "Oil seeds", "Root crops", "Cereals", "Main crops"}


# ---------------------------------------------------------------- catalogo
def _gaez(url, params, post=True):
    p = {**params, "f": "json"}
    err = None
    for intento in range(3):
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
            time.sleep(2 * (intento + 1))
    raise err


def _minus(attrs: dict) -> dict:
    """Los servicios de GAEZ no coinciden en mayusculas (res06 usa Name/OBJECTID): todo a minusculas."""
    return {k.lower(): v for k, v in attrs.items()}


def campos_ligeros(servicio):
    info = _gaez(f"{GAEZ}/{servicio}/ImageServer", {}, post=False)
    return ",".join(f["name"] for f in info["fields"]
                    if "Blob" not in f["type"] and "Geometry" not in f["type"])


def ids_servicio(servicio, where="1=1"):
    j = _gaez(f"{GAEZ}/{servicio}/ImageServer/query", {"where": where, "returnIdsOnly": "true"})
    return sorted(j.get("objectIds") or [])


def registros(servicio, ids, campos, lote=300):
    import pandas as pd

    filas = []
    for i in range(0, len(ids), lote):
        j = _gaez(f"{GAEZ}/{servicio}/ImageServer/query",
                  {"objectIds": ",".join(map(str, ids[i:i + lote])), "outFields": campos, "returnGeometry": "false"})
        filas += [_minus(f["attributes"]) for f in j.get("features", [])]
    return pd.DataFrame(filas)


def listar_servicios():
    j = _gaez(GAEZ, {}, post=False)
    out = [(s["name"], s["type"]) for s in j.get("services", [])]
    for carp in j.get("folders", []):
        jj = _gaez(f"{GAEZ}/{carp}", {}, post=False)
        out += [(s["name"], s["type"]) for s in jj.get("services", [])]
    return out


def resumir_catalogo(servicio, n=1500, mostrar=25):
    """Muestra repartida del catalogo (ids espaciados) y valores distintos por campo de texto."""
    import pandas as pd

    ids = ids_servicio(servicio)
    print(f"{servicio}: {len(ids)} rasters en el catalogo")
    if not ids:
        return pd.DataFrame()
    paso = max(1, len(ids) // n)
    m = registros(servicio, ids[::paso], campos_ligeros(servicio))
    print("campos:", list(m.columns), "| tiene download_url?:", "download_url" in m.columns)
    for c in m.columns:
        if c in ("download_url", "filepath", "renderer", "file_id", "file_description", "Shape") or m[c].dtype != object:
            continue
        print(f"\n{c} ({m[c].nunique()} valores en la muestra):", m[c].value_counts().head(mostrar).to_dict())
    return m


def previsualizar(servicio, where, mostrar=20):
    """Cuenta los rasters del filtro y resume sus atributos antes de construir una tabla."""
    ids = ids_servicio(servicio, where)
    print(f"{servicio}: {len(ids)} rasters con el filtro (tope {TOPE_RASTERS})")
    if not ids:
        return None
    m = registros(servicio, ids, "objectid,name,sub_theme_name,variable,crop,water_supply,input_level,units")
    for c in ("sub_theme_name", "variable", "crop", "water_supply", "input_level", "units"):
        if c in m and m[c].notna().any():
            print(f"  {c} ({m[c].nunique()}):", m[c].value_counts().head(mostrar).to_dict())
    return m


# ---------------------------------------------------------------- construccion de tablas (ETL)
def _leer_raster(fuente, agg, cero_es_nodata, aois=None):
    """Lee un raster (ruta local o URL) en todas las zonas piloto. Devuelve un DataFrame o None."""
    import pandas as pd
    import rasterio

    from .grid import AOIS, leer_bloques

    aois = aois or AOIS
    try:
        with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_TIMEOUT="60",
                          GDAL_HTTP_MAX_RETRY="3", GDAL_HTTP_RETRY_DELAY="2"):
            with rasterio.open(str(fuente)) as src:
                partes = []
                for zona, bbox in aois.items():
                    d = leer_bloques(src, bbox, agg=agg, cero_es_nodata=cero_es_nodata)
                    d["zona"] = zona
                    partes.append(d)
    except Exception as ex:
        print("fallo", str(fuente)[-60:], type(ex).__name__, str(ex)[:200])
        return None
    return pd.concat(partes)


def construir_gaez(servicio, where, nombre, fuente, agg="mean", cero_es_nodata=False, hilos=8):
    """Tablas 8 y 9: lee cada raster del filtro en las zonas piloto y guarda una tabla larga."""
    import pandas as pd

    from .grid import registrar_cobertura

    if not where:
        print(nombre, "omitida (sin filtro)")
        return None
    ids = ids_servicio(servicio, where)
    print(f"{nombre}: {len(ids)} rasters en {servicio}")
    if not ids:
        return None
    if len(ids) > TOPE_RASTERS:
        raise ValueError(f"{len(ids)} rasters superan el tope de {TOPE_RASTERS}: afina el filtro")
    cat = registros(servicio, ids, campos_ligeros(servicio))
    cat = cat[cat["download_url"].notna()]
    meta = [c for c in ("objectid", "name", "sub_theme_name", "variable", "year", "model", "rcp", "crop",
                        "water_supply", "input_level", "units") if c in cat]

    def procesar(fila):
        d = _leer_raster(fila["download_url"], agg, cero_es_nodata)
        if d is None:
            return None
        d = d.dropna(subset=["valor"])
        for c in meta:
            d[c] = fila[c]
        return d

    t0 = time.time()
    with ThreadPoolExecutor(hilos) as ex:
        partes = [p for p in ex.map(procesar, [r for _, r in cat.iterrows()]) if p is not None and len(p)]
    print(f"{nombre}: {len(partes)}/{len(cat)} rasters leidos en {time.time() - t0:.0f}s")
    if not partes:
        return None
    df = pd.concat(partes, ignore_index=True)
    for c in ("sub_theme_name", "water_supply", "variable", "units"):
        if c in df:
            df[c] = df[c].astype(str).str.strip()
    if nombre == "gaez_suitability":
        df = normalizar_suitability(df)
    guardar(df, nombre)
    registrar_cobertura(fuente, df["cell_id"].unique())
    return df


def normalizar_suitability(gs):
    """Columnas legibles: indicador, regimen de agua, tipo de riego y unidades estandar (idempotente)."""
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


def construir_growing():
    return construir_gaez(SERV_T2, WHERE_T2, "gaez_growing", "GAEZ_T2")


def construir_suitability():
    return construir_gaez(SERV_T4, WHERE_T4, "gaez_suitability", "GAEZ_T4")


# ---- Tabla 3: gaez_actual ----
SUPPLY = {"I": "Irrigated", "R": "Rainfed", "T": "Total"}      # 'V' (agregados de valor) queda fuera
VARIABLE = {"har": "area_cosechada_kha", "prd": "produccion_kt"}
VARIABLE_SERVIDOR = {"Harvested area": "area_cosechada_kha", "Production": "produccion_kt"}
PAT = re.compile(r"^(?P<crop_code>[a-z0-9]+)_(?P<year>\d{4})_(?P<var>[a-z]+)$", re.I)


def nombres_cultivo():
    """codigo -> nombre de cultivo (consulta ligera al servidor FAO, guardada en db/nombres_cultivo.csv)."""
    import pandas as pd

    ruta = DB / "nombres_cultivo.csv"
    if not ruta.exists():
        try:
            j = _gaez(f"{GAEZ}/{SERV_T5}/ImageServer/query",
                      {"where": "1=1", "outFields": "name,crop", "returnGeometry": "false", "resultRecordCount": 2000})
            cs = pd.DataFrame([_minus(f["attributes"]) for f in j["features"]])
            cs["crop_code"] = cs["name"].str.split("_").str[0].str.lower()
            cs[["crop_code", "crop"]].drop_duplicates("crop_code").to_csv(ruta, index=False)
        except Exception as ex:
            print("No se pudieron obtener nombres de cultivo; se usara el codigo:", type(ex).__name__)
            return {}
    nom = pd.read_csv(ruta).drop_duplicates("crop_code")
    return dict(zip(nom["crop_code"], nom["crop"]))


def descomprimir(archivo: Path, destino: Path):
    """Descomprime un .rar/.zip/.7z con 7-Zip (debe estar instalado y en el PATH)."""
    if destino.exists() and any(destino.rglob("*.tif")):
        return
    destino.mkdir(parents=True, exist_ok=True)
    subprocess.run(["7z", "x", str(archivo), f"-o{destino}", "-y"], check=True, stdout=subprocess.DEVNULL)
    print("descomprimido en", destino)


def _catalogo_local(origen: Path):
    """Catalogo de los .tif del Tema 5 descargados a mano (carpetas I, R, T con archivos cultivo_anio_var.tif)."""
    import pandas as pd

    if origen.is_file():
        destino = RAW / "gaez_t5"
        descomprimir(origen, destino)
        origen = destino
    cand = [p.parent for p in origen.rglob("I") if p.is_dir() and (p.parent / "R").is_dir()]
    if not cand:
        raise FileNotFoundError(f"No encuentro una carpeta con I y R dentro de {origen}")
    base = cand[0]
    filas = []
    for p in sorted(base.rglob("*.tif")):
        m = PAT.match(p.stem)
        if m:
            filas.append({"fuente": p, "carpeta": p.relative_to(base).parts[0],
                          "crop_code": m["crop_code"].lower(), "year": int(m["year"]), "var": m["var"].lower()})
    loc = pd.DataFrame(filas)
    nom = nombres_cultivo()
    loc["crop"] = loc["crop_code"].map(nom).fillna(loc["crop_code"])
    sel = loc[loc["carpeta"].isin(SUPPLY) & loc["var"].isin(VARIABLE)].copy()
    sel["water_supply"] = sel["carpeta"].map(SUPPLY)
    sel["var"] = sel["var"].map(VARIABLE)
    return sel


def _catalogo_servidor():
    cat = registros(SERV_T5, ids_servicio(SERV_T5, WHERE_T5 + " AND variable IN ('Harvested area', 'Production')"),
                    campos_ligeros(SERV_T5))
    cat = cat[cat["download_url"].notna()].copy()
    cat["fuente"] = cat["download_url"]
    cat["crop_code"] = cat["name"].str.split("_").str[0].str.lower()
    cat["year"] = cat["year"].astype(int)
    cat["var"] = cat["variable"].str.strip().map(VARIABLE_SERVIDOR)
    cat["water_supply"] = cat["water_supply"].str.strip()
    return cat[["fuente", "crop_code", "crop", "year", "var", "water_supply"]]


def construir_actual(origen: str | Path | None = None, hilos=8):
    """Tabla 3. `origen`: None = servidor FAO (res06, 2010); o ruta a la carpeta/archivo del Tema 5 descargado."""
    import pandas as pd

    from .grid import registrar_cobertura

    sel = _catalogo_local(Path(origen)) if origen else _catalogo_servidor()
    print("gaez_actual: rasters a procesar:", len(sel))

    def procesar(fila):
        d = _leer_raster(fila["fuente"], "sum", True)
        if d is None:
            return None
        d = d.dropna(subset=["valor"])
        d["crop"], d["crop_code"] = fila["crop"], fila["crop_code"]
        d["water_supply"], d["year"], d["var"] = fila["water_supply"], fila["year"], fila["var"]
        return d

    with ThreadPoolExecutor(hilos) as ex:
        partes = [p for p in ex.map(procesar, [r for _, r in sel.iterrows()]) if p is not None and len(p)]
    print("gaez_actual: rasters leidos:", len(partes))
    largo = pd.concat(partes)
    ancho = largo.pivot_table(index=["cell_id", "lat", "lon", "zona", "crop_code", "crop", "water_supply", "year"],
                              columns="var", values="valor", aggfunc="sum").reset_index()
    ancho.columns.name = None
    ancho["rendimiento_t_ha"] = ancho["produccion_kt"] / ancho["area_cosechada_kha"]   # 1000 t / 1000 ha
    ancho = ancho[ancho["area_cosechada_kha"] > 0].reset_index(drop=True)
    ancho["es_grupo"] = ancho["crop"].isin(GRUPOS)
    guardar(ancho, "gaez_actual")
    registrar_cobertura("GAEZ_T5", ancho["cell_id"].unique())
    return ancho


# ---------------------------------------------------------------- consultas en vivo por punto
def identify(servicio: str, where: str, lat: float, lon: float) -> list[dict]:
    """Valor de cada raster del filtro en el punto: [{...atributos, 'valor': float|None}]."""
    j = _gaez(f"{GAEZ}/{servicio}/ImageServer/identify", {
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
        a = {k: (x.strip() if isinstance(x, str) else x) for k, x in _minus(f["attributes"]).items()
             if k in ("objectid", "name", "sub_theme_name", "variable", "crop", "water_supply", "input_level", "units", "year")}
        try:
            a["valor"] = float(v)
        except (TypeError, ValueError):
            a["valor"] = None        # NoData
        out.append(a)
    return out


def _cacheado(tipo: str, lat: float, lon: float, fn):
    key = CACHE_DIR / f"gaez_{tipo}_{lat:.3f}_{lon:.3f}.json"
    if key.exists():
        return json.loads(key.read_text(encoding="utf8"))
    out = fn()
    if out.get("available"):
        key.write_text(json.dumps(out), encoding="utf8")
    return out


def clase_idoneidad(si: float | None) -> str | None:
    """Clases de idoneidad de GAEZ a partir del indice 0-10000."""
    if si is None:
        return None
    for lim, nombre in ((8500, "muy alta"), (7000, "alta"), (5500, "buena"), (4000, "media"),
                        (2500, "moderada"), (1000, "marginal"), (1, "muy marginal")):
        if si >= lim:
            return nombre
    return "no apta"


def _num(v, nd=0):
    return None if v is None else round(v, nd)


def suitability_at(lat: float, lon: float, input_level: str = "High") -> dict:
    """Tema 4 en el punto: por cultivo, idoneidad y rendimiento alcanzable en secano y con riego."""
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
            reg = "secano" if ws.startswith("Rainfed") else "riego"
            slot = c[reg]
            units = (r.get("units") or "").strip()
            if var.startswith("suitability index"):
                if reg == "riego" and slot.get("suitability", -1) >= v:
                    continue
                slot["suitability"] = v
                slot["suitability_class"] = clase_idoneidad(v)
                if reg == "riego":
                    slot["irrigation_type"] = ws
            elif var.startswith("average attainable yield"):
                if units == "10kg DW/ha":
                    v, units = v * 10, "kg DW/ha"
                if reg == "riego" and slot.get("attainable_yield", -1) >= v:
                    continue
                slot["attainable_yield"] = _num(v)
                slot["yield_units"] = units
            elif var.startswith("water deficit"):
                slot["water_deficit_mm"] = _num(v)
        lista = [c for c in crops.values() if c["secano"] or c["riego"]]
        lista.sort(key=lambda c: -max(c["secano"].get("suitability", 0), c["riego"].get("suitability", 0)))
        base.update(available=bool(lista), crops=lista,
                    note="Idoneidad 0-10000 (clases GAEZ). Rendimiento alcanzable en kg de materia seca por "
                         "hectarea salvo que se indique otra unidad. Riego: el mejor sistema disponible."
                    if lista else "GAEZ no tiene datos de tierra de cultivo en este punto (agua, ciudad o fuera de tierra cultivada).")
        return base

    return _cacheado(f"suit_{input_level}", lat, lon, calc)


# variable de GAEZ -> clave corta para los indicadores mas usados
CLAVES_T2 = {
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
    """Tema 2 en el punto: periodo de crecimiento y regimenes termico y de humedad (1981-2010)."""
    lat, lon = round(lat, 3), round(lon, 3)

    def calc():
        base = {"available": False, "lat": lat, "lon": lon, "highlights": {}, "variables": [],
                "source": "GAEZ v4 Tema 2 (FAO/IIASA), clima historico 1981-2010 (CRU TS 3.2)", "note": ""}
        try:
            rows = identify(SERV_T2, WHERE_T2, lat, lon)
        except Exception as ex:
            base["note"] = f"No se pudo consultar GAEZ ahora ({type(ex).__name__}). Intenta de nuevo."
            return base
        variables, destacados = [], {}
        for r in rows:
            v, var = r["valor"], r.get("variable") or ""
            if v is None:
                continue
            if "*100" in var and "P/PET" not in var:
                v = v / 100            # temperaturas guardadas como grados C x 100
            item = {"theme": r.get("sub_theme_name"), "variable": var, "units": r.get("units"),
                    "code": (r.get("name") or "").split("_")[0], "value": round(v, 2)}
            variables.append(item)
            for pref, clave in CLAVES_T2.items():
                if var.startswith(pref):
                    destacados[clave] = item["value"]
        variables.sort(key=lambda x: (x["theme"] or "", x["variable"]))
        ok = bool(variables) and any(x["value"] != 0 for x in variables)
        base.update(available=ok, variables=variables, highlights=destacados,
                    note="" if ok else "GAEZ no tiene datos agroclimaticos en este punto (agua o fuera de tierra).")
        return base

    return _cacheado("grow", lat, lon, calc)


def actual_at(lat: float, lon: float) -> dict:
    """Tema 5 en el punto (pixel de ~9 km): area cosechada, produccion y rendimiento reales en 2010."""
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
        clave = {"Harvested area": "area_kha", "Production": "production_kt", "Yield": "yield_t_ha"}
        reg = {"Total": "total", "Rainfed": "rainfed", "Irrigated": "irrigated"}
        for r in rows:
            v = r["valor"]
            if v is None or v <= 0 or r.get("crop") in GRUPOS:
                continue
            c = crops.setdefault(r["crop"], {"crop": r["crop"], "total": {}, "rainfed": {}, "irrigated": {}})
            c[reg[r["water_supply"]]][clave[r["variable"]]] = round(v, 3)
        lista = [c for c in crops.values() if c["total"].get("area_kha")]
        for c in lista:
            c["area_ha"] = round(c["total"]["area_kha"] * 1000)
            irr = c["irrigated"].get("area_kha", 0)
            c["irrigated_share"] = round(irr / c["total"]["area_kha"], 2) if c["total"]["area_kha"] else None
        lista.sort(key=lambda c: -c["area_ha"])
        base.update(available=bool(lista), crops=lista,
                    note="Hectareas cosechadas en el pixel (~85 km2 en el ecuador) y rendimiento medio en t/ha."
                    if lista else "GAEZ no registra cultivos cosechados en este pixel.")
        return base

    return _cacheado("actual", lat, lon, calc)
