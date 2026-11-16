"""Tools for the ORCHID Guide.

Each tool calls the same code the platform uses and returns the data along with its official source.
The server numbers the sources ([1], [2], ...) and builds the list the farmer sees: the model can't invent
links because it only cites numbers that come from here.

Tool names, descriptions and result keys are model-facing content and stay in Spanish, matching the
system prompt (assistant_prompt.py) that refers to them.
"""
import json
from dataclasses import dataclass, field
from datetime import date

from pydantic import BaseModel, Field, ValidationError

from .analysis import WEIGHTS, vulnerability_by_month
from . import earthdata
from .crops import CATALOG, local_crops
from .etl.gaez import growing_at, suitability_at
from .etl.stations import stations_near
from .nasa_power import PARAMS as POWER_PARAMS
from .nasa_power import URL as POWER_URL
from .nasa_power import monthly_climatology
from .ndvi import ndvi_at
from .recommend import build_options
from .soil import soil_at

HA_PER_ACRE = 0.404686
MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre",
             "noviembre", "diciembre"]

# ---------- Source catalog ----------

SOURCES: dict[str, dict] = {
    "farmer": {"name": "Tu cuaderno en ORCHID", "url": None,
               "what": "Lo que cargaste en ORCHID: terreno, historial de cultivos y precios.", "coverage": "Tu cuenta"},
    "census": {"name": "Censo de EE. UU. (Gazetteer y Geocoder)", "url": "https://geocoding.geo.census.gov/geocoder/",
               "what": "Ubicación de pueblos, condados, códigos postales y direcciones.", "coverage": "EE. UU."},
    "nasa_power": {"name": "NASA POWER", "url": "https://power.larc.nasa.gov/",
                   "what": "Clima diario y mensual a partir de satélites y modelos: lluvia, temperatura y humedad "
                           "del suelo en la zona de las raíces.", "coverage": "Global, celdas de unos 50 km"},
    "ssurgo": {"name": "USDA NRCS SSURGO (Soil Data Access)", "url": "https://sdmdataaccess.nrcs.usda.gov/",
               "what": "Mapa detallado de suelos: textura, drenaje, materia orgánica, pH, pendiente y agua "
                       "disponible.", "coverage": "EE. UU."},
    "modis": {"name": "NASA MODIS MOD13Q1 (NDVI, vía ORNL DAAC)", "url": "https://modis.ornl.gov/",
              "what": "Índice de verdor de la vegetación cada 16 días; valores bajos indican suelo desnudo o "
                      "vegetación escasa.", "coverage": "Global, píxeles de 250 m"},
    "cdl": {"name": "USDA NASS Cropland Data Layer (CDL)",
            "url": "https://www.nass.usda.gov/Research_and_Science/Cropland/SARS1a.php",
            "what": "Mapa anual de qué se sembró en cada campo.", "coverage": "EE. UU., píxeles de 30 m"},
    "gaez": {"name": "FAO GAEZ v4", "url": "https://gaez.fao.org/",
             "what": "Idoneidad de cultivos, rendimiento alcanzable y periodo de crecimiento según clima "
                     "1981-2010.", "coverage": "Global, unos 9 km"},
    "cocorahs": {"name": "CoCoRaHS (vía NOAA GHCN-Daily)", "url": "https://www.cocorahs.org/",
                 "what": "Lluvia medida por voluntarios en pluviómetros cerca del terreno.", "coverage": "EE. UU."},
    "smap": {"name": "NASA SMAP (humedad del suelo, NSIDC)", "url": earthdata.LINKS["smap"],
             "what": "Humedad de los primeros ~5 cm del suelo medida por satélite, cada 2 o 3 días.", "coverage": "Global, celdas de 9 km"},
    "imerg": {"name": "NASA GPM IMERG (lluvia por satélite)", "url": earthdata.LINKS["imerg"],
              "what": "Lluvia diaria estimada por la constelación de satélites GPM; la versión «Late» sale con 1 o 2 días de retraso.",
              "coverage": "Global entre 60° N y 60° S, celdas de ~10 km"},
    "nldas": {"name": "NASA NLDAS-2 (balance de agua)", "url": earthdata.LINKS["nldas"],
              "what": "Modelo mensual de cuánta agua guarda el suelo hasta 2 m, cuánta se evapora y cuánta escurre.",
              "coverage": "48 estados contiguos de EE. UU., celdas de ~12 km"},
    "srtm": {"name": "NASA SRTM (relieve)", "url": earthdata.LINKS["srtm"],
             "what": "Altura del terreno medida por radar desde el transbordador espacial en el año 2000; de ahí sale la pendiente.",
             "coverage": "Global entre 60° N y 56° S, píxeles de ~30 m"},
    "orchid": {"name": "Motor de rotaciones de ORCHID", "url": None,
               "what": "Compara opciones de cultivo con el clima (NASA POWER), el suelo (SSURGO), la vegetación "
                       "(MODIS), el relieve (SRTM), el agua del suelo (NLDAS y SMAP), los cultivos de la zona (CDL) y tu "
                       "historial.", "coverage": "EE. UU."},
}


@dataclass
class ToolContext:
    """What the tools know about the session. The field is read from the server, not from the browser."""
    plot: dict | None
    map_point: dict | None
    cited: list[str] = field(default_factory=list)  # source ids in order of first citation
    lang: str = "es"  # response language the browser asked for

    def cite(self, source_id: str) -> str:
        if source_id not in self.cited:
            self.cited.append(source_id)
        return f"[{self.cited.index(source_id) + 1}]"

    def sources(self) -> list[dict]:
        return [{"n": i + 1, "id": s, "name": SOURCES[s]["name"], "url": SOURCES[s]["url"]}
                for i, s in enumerate(self.cited)]


# ---------- Input validation ----------

class PointArgs(BaseModel):
    lat: float = Field(ge=18, le=72)  # continental U.S., Alaska, Hawaii and Puerto Rico
    lon: float = Field(ge=-180, le=-60)


class GlobalPointArgs(BaseModel):
    lat: float = Field(ge=-60, le=75)
    lon: float = Field(ge=-180, le=180)


class PlaceArgs(BaseModel):
    lugar: str = Field(min_length=2, max_length=120)


class RotationArgs(PointArgs):
    usar_mi_historial: bool = True


class SourceArgs(BaseModel):
    fuente: str = Field(max_length=40)


POINT_SCHEMA = {
    "type": "object",
    "properties": {
        "lat": {"type": "number", "description": "Latitud en grados decimales."},
        "lon": {"type": "number", "description": "Longitud en grados decimales (negativa en EE. UU.)."},
    },
    "required": ["lat", "lon"],
    "additionalProperties": False,
}


def _tool(name: str, description: str, schema: dict) -> dict:
    # eager_input_streaming: inputs arrive unbuffered; we validate them with pydantic before running.
    return {"name": name, "description": description, "input_schema": schema, "eager_input_streaming": True}


TOOLS = [
    _tool("mi_terreno",
          "Devuelve el terreno que el agricultor guardó en ORCHID (nombre, acres, si riega, ubicación, historial "
          "de cultivos y precios) y el punto que tiene marcado ahora en el mapa. Úsala siempre que hable de "
          "\"mi terreno\", \"mi campo\" o \"lo que sembré\", antes de cualquier otra herramienta.",
          {"type": "object", "properties": {}, "additionalProperties": False}),
    _tool("buscar_lugar",
          "Busca un lugar de EE. UU. (pueblo y estado, condado, código postal o dirección) y devuelve sus "
          "coordenadas. Úsala cuando el agricultor pregunte por un lugar distinto de su terreno.",
          {"type": "object", "properties": {"lugar": {"type": "string", "description": "Por ejemplo «Ames, Iowa» o «67152»."}},
           "required": ["lugar"], "additionalProperties": False}),
    _tool("clima_del_punto",
          "Clima mensual promedio 2015-2024 de NASA POWER en un punto: lluvia, temperatura, humedad del suelo y "
          "un índice de vulnerabilidad por mes (calor + suelo seco + poca lluvia). Úsala para preguntas de clima, "
          "sequía, meses críticos o épocas de siembra.", POINT_SCHEMA),
    _tool("suelo_del_punto",
          "Suelo real del punto según SSURGO (USDA): textura, drenaje, materia orgánica, pH, pendiente y agua "
          "disponible. Solo EE. UU. Úsala para preguntas sobre el suelo, el drenaje o la erosión.", POINT_SCHEMA),
    _tool("vegetacion_ndvi",
          "Verdor de la vegetación (NDVI de MODIS) de los últimos ~14 meses y meses con suelo casi desnudo. "
          "Úsala para preguntas sobre cobertura del suelo, cuándo quedó desnudo o cómo va la vegetación.",
          POINT_SCHEMA),
    _tool("cultivos_cercanos",
          "Qué se sembró alrededor del punto (~1 km) cada año 2021-2025 según el Cropland Data Layer del USDA. "
          "Úsala para preguntas sobre los cultivos de la zona o los vecinos.", POINT_SCHEMA),
    _tool("idoneidad_cultivos",
          "Idoneidad y rendimiento alcanzable de cada cultivo en secano y con riego según FAO GAEZ v4 (clima "
          "1981-2010). Úsala cuando pregunte qué cultivos se dan bien en un lugar o qué rinde podría esperar.",
          GlobalPointArgs.model_json_schema() | {"additionalProperties": False}),
    _tool("periodo_crecimiento",
          "Periodo de crecimiento, días de helada y de calor, lluvia anual y balance de agua según FAO GAEZ v4 "
          "(1981-2010). Úsala para preguntas sobre la temporada de cultivo o el riesgo de heladas.",
          GlobalPointArgs.model_json_schema() | {"additionalProperties": False}),
    _tool("lluvia_estaciones",
          "Lluvia medida por pluviómetros CoCoRaHS cercanos (hasta 40 km) en el último año completo, comparada "
          "con NASA POWER. Úsala cuando pregunte cuánto llovió de verdad o si el dato satelital es confiable.",
          POINT_SCHEMA),
    _tool("humedad_suelo_satelite",
          "Humedad de la superficie del suelo medida por el satélite SMAP de la NASA en las últimas ~2 semanas (fecha y "
          "porcentaje de agua). Úsala cuando pregunte qué tan húmedo o seco está su suelo ahora, o si puede entrar con la "
          "maquinaria.", GlobalPointArgs.model_json_schema() | {"additionalProperties": False}),
    _tool("lluvia_reciente_satelite",
          "Lluvia diaria de los últimos 30 días estimada por satélite (NASA GPM IMERG): total, últimos 7 días y días con "
          "lluvia. Úsala cuando pregunte cuánto ha llovido últimamente.", GlobalPointArgs.model_json_schema() | {"additionalProperties": False}),
    _tool("balance_agua_suelo",
          "Balance de agua mensual del modelo NLDAS de la NASA: agua guardada en el suelo hasta 1 m frente a lo normal, "
          "evapotranspiración, escorrentía y lluvia de los últimos 12 meses. Solo EE. UU. contiguo. Úsala para preguntas de "
          "sequía, reserva de agua del suelo o si el año viene más seco o más húmedo que lo normal.", POINT_SCHEMA),
    _tool("relieve_terreno",
          "Altura, pendiente y desnivel del terreno con el modelo SRTM de la NASA (~30 m). Úsala para preguntas sobre "
          "pendiente, erosión, curvas de nivel, encharcamiento por zonas bajas o altura del campo.",
          GlobalPointArgs.model_json_schema() | {"additionalProperties": False}),
    _tool("opciones_de_rotacion",
          "Compara opciones para el próximo cultivo con el motor de ORCHID (clima, suelo, vegetación, cultivos de "
          "la zona, historial y precios). Úsala para \"¿qué siembro después?\" o para comparar rotaciones. Con "
          "usar_mi_historial=true usa el historial, el riego, el área y los precios del terreno guardado.",
          {"type": "object",
           "properties": {**POINT_SCHEMA["properties"],
                          "usar_mi_historial": {"type": "boolean", "description": "true si el punto es el terreno del agricultor."}},
           "required": ["lat", "lon"], "additionalProperties": False}),
    _tool("que_es_la_fuente",
          "Explica qué mide una fuente de datos, su cobertura y su enlace oficial. Úsala cuando pregunte qué es "
          "NASA POWER, SSURGO, MODIS/NDVI, CDL, GAEZ o CoCoRaHS, o de dónde salen los datos.",
          {"type": "object",
           "properties": {"fuente": {"type": "string", "enum": sorted(SOURCES)}},
           "required": ["fuente"], "additionalProperties": False}),
]

STATUS = {
    "mi_terreno": "Revisando tu terreno",
    "buscar_lugar": "Buscando el lugar",
    "clima_del_punto": "Consultando el clima (NASA POWER)",
    "suelo_del_punto": "Consultando el suelo (SSURGO)",
    "vegetacion_ndvi": "Consultando la vegetación (MODIS)",
    "cultivos_cercanos": "Consultando los cultivos de la zona (CDL)",
    "idoneidad_cultivos": "Consultando la idoneidad de cultivos (FAO GAEZ)",
    "periodo_crecimiento": "Consultando la temporada de cultivo (FAO GAEZ)",
    "lluvia_estaciones": "Consultando pluviómetros cercanos (CoCoRaHS)",
    "humedad_suelo_satelite": "Consultando la humedad del suelo (NASA SMAP)",
    "lluvia_reciente_satelite": "Consultando la lluvia por satélite (NASA IMERG)",
    "balance_agua_suelo": "Consultando el agua del suelo (NASA NLDAS)",
    "relieve_terreno": "Consultando el relieve (NASA SRTM)",
    "opciones_de_rotacion": "Comparando opciones de rotación",
    "que_es_la_fuente": "Buscando la descripción de la fuente",
}

STATUS_EN = {
    "mi_terreno": "Checking your field",
    "buscar_lugar": "Looking up the place",
    "clima_del_punto": "Getting the climate (NASA POWER)",
    "suelo_del_punto": "Getting the soil (SSURGO)",
    "vegetacion_ndvi": "Getting the vegetation (MODIS)",
    "cultivos_cercanos": "Getting the area's crops (CDL)",
    "idoneidad_cultivos": "Getting crop suitability (FAO GAEZ)",
    "periodo_crecimiento": "Getting the growing season (FAO GAEZ)",
    "lluvia_estaciones": "Checking nearby rain gauges (CoCoRaHS)",
    "humedad_suelo_satelite": "Getting soil moisture (NASA SMAP)",
    "lluvia_reciente_satelite": "Getting satellite rainfall (NASA IMERG)",
    "balance_agua_suelo": "Getting soil water (NASA NLDAS)",
    "relieve_terreno": "Getting the terrain (NASA SRTM)",
    "opciones_de_rotacion": "Comparing rotation options",
    "que_es_la_fuente": "Looking up the source description",
}

# ---------- Price conversion (same units as frontend/app/shared.ts) ----------

KG_PER_CWT = 45.3592
US_UNITS = {
    "corn": (25.401, 25.401), "soybean": (27.216, 27.216), "wheat": (27.216, 27.216), "oats": (14.515, 14.515),
    "sorghum": (25.401, KG_PER_CWT), "sunflower": (0.45359, KG_PER_CWT),
}


def _num(v) -> float | None:
    try:
        return float(str(v).replace(",", "."))
    except (TypeError, ValueError):
        return None


def _to_metric(crop: str, e: dict) -> dict:
    """Farmer's yield, price and cost (U.S. units) to t/ha, $/t and $/ha, as the frontend does."""
    y, p, c = _num(e.get("yield")), _num(e.get("price")), _num(e.get("cost"))
    u = US_UNITS.get(crop)
    return {
        "yield_per_ha": (y * u[0]) / 1000 / HA_PER_ACRE if u and y is not None else None,
        "price_per_unit": p * (1000 / u[1]) if u and p is not None else None,
        "cost_per_ha": c / HA_PER_ACRE if c is not None else None,
    }


# ---------- Executors ----------


def _my_field(_, ctx: ToolContext) -> tuple[dict, str]:
    p = ctx.plot
    if not p or not p.get("point"):
        data = {"tiene_terreno": False,
                "nota": "El agricultor todavía no marcó su terreno en ORCHID. Pídele que lo marque en el mapa o que "
                        "diga el pueblo y el estado."}
    else:
        hist = [{"cultivo": CATALOG.get(h["crop"], {}).get("name", h["crop"]),
                 "siembra": f"{MONTHS_ES[h['plant_month'] - 1]} {h['plant_year']}",
                 "cosecha": f"{MONTHS_ES[h['harvest_month'] - 1]} {h['harvest_year']}"} for h in p.get("history", [])]
        data = {"tiene_terreno": True, "nombre": p.get("name") or None, "acres": p.get("acres") or None,
                "riega": bool(p.get("irrigated")), "lat": p["point"]["lat"], "lon": p["point"]["lon"],
                "historial": hist, "precios_cargados": sorted(p.get("econ", {}))}
    if ctx.map_point:
        data["punto_marcado_en_el_mapa"] = ctx.map_point
    return data, "farmer"


def _find_place(a: PlaceArgs, _ctx) -> tuple[dict, str]:
    from .geocode import search

    hit = search(a.lugar)
    if not hit:
        return {"encontrado": False, "nota": "No se encontró ese lugar. Pide el pueblo y el estado o el código postal."}, "census"
    return {"encontrado": True, **hit}, "census"


def _climate(a: PointArgs, _ctx) -> tuple[dict, str]:
    lat, lon = round(a.lat, 2), round(a.lon, 2)
    months = vulnerability_by_month(monthly_climatology(lat, lon))
    rows = [{"mes": MONTHS_ES[m["month"] - 1],
             "lluvia_pulgadas_mes": round(m["precip_mm_day"] * 30.4 / 25.4, 1) if m["precip_mm_day"] is not None else None,
             "lluvia_mm_mes": round(m["precip_mm_day"] * 30.4) if m["precip_mm_day"] is not None else None,
             "temp_f": round(m["temp_c"] * 9 / 5 + 32) if m["temp_c"] is not None else None,
             "temp_c": round(m["temp_c"], 1) if m["temp_c"] is not None else None,
             "humedad_suelo_0a1": m["soil_wetness"], "vulnerabilidad_0a1": m["vulnerability"]} for m in months]
    top = sorted(months, key=lambda m: m["vulnerability"], reverse=True)[:3]
    return {"periodo": "promedio 2015-2024", "meses": rows,
            "meses_mas_vulnerables": [MONTHS_ES[m["month"] - 1] for m in top],
            "metodo": (f"Vulnerabilidad = {WEIGHTS['heat']} calor + {WEIGHTS['dryness']} suelo seco + {WEIGHTS['low_rain']} poca lluvia, "
                       "relativo al propio punto. Los pesos los eligió ORCHID; los datos son de NASA POWER."),
            "consulta_oficial": f"{POWER_URL}?parameters={POWER_PARAMS}&community=AG&longitude={lon}&latitude={lat}"
                                f"&start=2015&end=2024&format=JSON"}, "nasa_power"


def _soil(a: PointArgs, _ctx) -> tuple[dict, str]:
    s = soil_at(a.lat, a.lon)
    return {"disponible": s.get("available"), "nota": s.get("note"), "componentes": s.get("components", [])[:3],
            "unidades": {"pct": "% del mapa", "slope": "% de pendiente", "topsoil_depth_cm": "cm", "sand/silt/clay": "%",
                         "om": "% materia orgánica", "ksat": "µm/s", "awc": "cm de agua por cm de suelo"},
            "consulta_oficial": s.get("query_page")}, "ssurgo"


def _ndvi(a: GlobalPointArgs, _ctx) -> tuple[dict, str]:
    n = ndvi_at(a.lat, a.lon)
    monthly = {MONTHS_ES[int(m) - 1]: v for m, v in sorted((n.get("monthly") or {}).items(), key=lambda kv: int(kv[0]))}
    return {"disponible": n.get("available"), "producto": n.get("product"), "nota": n.get("note"),
            "ndvi_promedio_por_mes": monthly, "umbral_suelo_casi_desnudo": n.get("threshold"),
            "meses_bajo_el_umbral": [MONTHS_ES[int(m) - 1] for m in n.get("low_months", [])],
            "consulta_oficial": n.get("official_url")}, "modis"


def _local_crops(a: PointArgs, _ctx) -> tuple[dict, str]:
    c = local_crops(a.lat, a.lon)
    return {"disponible": c.get("available"), "radio_km": c.get("radius_km"), "nota": c.get("note"),
            "porcentaje_por_anio": c.get("years", {})}, "cdl"


def _trim(items: list, n: int) -> list:
    return items[:n] if isinstance(items, list) else items


def _suitability(a: GlobalPointArgs, _ctx) -> tuple[dict, str]:
    g = suitability_at(a.lat, a.lon, "High")
    return {"disponible": g.get("available"), "nota": g.get("note"), "fuente_detalle": g.get("source"),
            "nivel_de_insumos": "alto", "cultivos": _trim(g.get("crops", []), 15)}, "gaez"


def _growing(a: GlobalPointArgs, _ctx) -> tuple[dict, str]:
    g = growing_at(a.lat, a.lon)
    return {k: v for k, v in g.items() if k not in ("lat", "lon")}, "gaez"


def _station_rain(a: PointArgs, _ctx) -> tuple[dict, str]:
    s = stations_near(a.lat, a.lon)
    return {k: v for k, v in s.items() if k not in ("lat", "lon")}, "cocorahs"


def _without_noise(d: dict, *drop: str) -> dict:
    return {k: v for k, v in d.items() if k not in ("official_url", "source", *drop)}


def _smap(a: GlobalPointArgs, _ctx) -> tuple[dict, str]:
    r = earthdata.smap_at(a.lat, a.lon)
    r["series"] = [x for x in r.get("series", []) if x["value"] is not None]
    return _without_noise(r), "smap"


def _imerg(a: GlobalPointArgs, _ctx) -> tuple[dict, str]:
    r = earthdata.imerg_at(a.lat, a.lon)
    if r.get("series"):
        r["series"] = [x for x in r["series"] if x["mm"]]  # only the days with rain
        r["unidades"] = "mm por día; total_in en pulgadas"
    return _without_noise(r), "imerg"


def _nldas(a: PointArgs, _ctx) -> tuple[dict, str]:
    r = earthdata.nldas_at(a.lat, a.lon)
    r["unidades"] = "milímetros de agua (kg/m²) por mes; soil_0_100_mm es el agua guardada al final del mes"
    return _without_noise(r), "nldas"


def _srtm(a: GlobalPointArgs, _ctx) -> tuple[dict, str]:
    return _without_noise(earthdata.srtm_at(a.lat, a.lon), "tile"), "srtm"


def _rotation(a: RotationArgs, ctx: ToolContext) -> tuple[dict, str]:
    plot = ctx.plot if a.usar_mi_historial else None
    history = (plot or {}).get("history", [])
    irrigated = bool((plot or {}).get("irrigated"))
    acres = _num((plot or {}).get("acres"))
    area_ha = (acres or 25.0) * HA_PER_ACRE
    prices = {k: _to_metric(k, v) for k, v in ((plot or {}).get("econ") or {}).items()}
    months = vulnerability_by_month(monthly_climatology(round(a.lat, 2), round(a.lon, 2)))
    out = build_options(months, history, irrigated, prices, local_crops(a.lat, a.lon), area_ha,
                        soil=soil_at(a.lat, a.lon), ndvi=ndvi_at(a.lat, a.lon), today=date.today(),
                        terrain=earthdata.srtm_at(a.lat, a.lon), water=earthdata.nldas_at(a.lat, a.lon),
                        moisture=earthdata.smap_at(a.lat, a.lon))
    out["reglas_de_orchid"] = out.pop("method", [])  # our own assumptions, not data
    out["supuestos"] = {"usa_historial_guardado": bool(plot), "area_acres": round(area_ha / HA_PER_ACRE, 1),
                        "riega": irrigated, "nota_area": None if acres else "Sin área guardada: se usaron 25 acres para los totales."}
    return out, "orchid"


def _source_info(a: SourceArgs, _ctx) -> tuple[dict, str]:
    s = SOURCES.get(a.fuente)
    if not s:
        return {"nota": "Fuente desconocida."}, "orchid"
    return {k: v for k, v in s.items()}, a.fuente


EXECUTORS = {
    "mi_terreno": (None, _my_field),
    "buscar_lugar": (PlaceArgs, _find_place),
    "clima_del_punto": (GlobalPointArgs, _climate),
    "suelo_del_punto": (PointArgs, _soil),
    "vegetacion_ndvi": (GlobalPointArgs, _ndvi),
    "cultivos_cercanos": (PointArgs, _local_crops),
    "idoneidad_cultivos": (GlobalPointArgs, _suitability),
    "periodo_crecimiento": (GlobalPointArgs, _growing),
    "lluvia_estaciones": (PointArgs, _station_rain),
    "humedad_suelo_satelite": (GlobalPointArgs, _smap),
    "lluvia_reciente_satelite": (GlobalPointArgs, _imerg),
    "balance_agua_suelo": (PointArgs, _nldas),
    "relieve_terreno": (GlobalPointArgs, _srtm),
    "opciones_de_rotacion": (RotationArgs, _rotation),
    "que_es_la_fuente": (SourceArgs, _source_info),
}


def run_tool(name: str, raw_input, ctx: ToolContext, tool_use_id: str) -> dict:
    """Runs a tool and returns the tool_result block. Never raises: errors go back to Claude."""
    def result(payload: dict, is_error: bool = False) -> dict:
        return {"type": "tool_result", "tool_use_id": tool_use_id, "is_error": is_error,
                "content": json.dumps(payload, ensure_ascii=False, default=str)}

    if name not in EXECUTORS:
        return result({"error": f"Herramienta desconocida: {name}"}, True)
    model, fn = EXECUTORS[name]
    try:
        args = model.model_validate(raw_input) if model else None
    except ValidationError as e:
        # Invalid input (or JSON truncated by eager streaming): not run; Claude can correct it.
        msg = "; ".join(f"{'.'.join(map(str, err['loc']))}: {err['msg']}" for err in e.errors())
        hint = " Esta fuente solo cubre EE. UU." if model in (PointArgs, RotationArgs) else ""
        return result({"error": f"Entrada inválida: {msg}.{hint}", "INVALID_JSON": json.dumps(raw_input, ensure_ascii=False)}, True)
    try:
        data, source_id = fn(args, ctx)
    except Exception as e:  # source down or no network: report it, never make it up
        return result({"error": f"La fuente no respondió ({type(e).__name__}). No hay datos para esta consulta."}, True)
    return result({"cita": ctx.cite(source_id), "fuente": SOURCES[source_id]["name"], "datos": data})
