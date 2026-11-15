from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware

from .accounts import router as accounts_router
from .assistant import router as assistant_router
from .analysis import CROP_MONTHS, WEIGHTS, bare_soil_months, vulnerability_by_month
from .climate import RESOLUTIONS, aggregate
from .config import ALLOWED_ORIGINS, QUICKSTATS_KEY
from .crops import local_crops
from . import datasets
from .datasets import DatasetError
from .db import init_db
from . import earthdata
from .etl.gaez import actual_at, growing_at, suitability_at
from .etl.stations import stations_near
from .i18n import LangMiddleware, in_ctx, t
from .localize import localize
from .nasa_power import monthly_climatology
from .ndvi import ndvi_at
from .prices import PriceError, reference_prices
from .recommend import build_options
from .soil import soil_at
from .rotations import strategies_for
from .zones import get_zone, zones_localized



@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Orchid API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(LangMiddleware)
app.include_router(accounts_router)
app.include_router(assistant_router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/zones")
def zones():
    return zones_localized()


@app.get("/zones/{zone_id}/analysis")
def analysis(zone_id: str):
    zone = get_zone(zone_id)
    if not zone:
        raise HTTPException(404, t("Zona no encontrada", "Area not found"))
    try:
        clim = monthly_climatology(zone["lat"], zone["lon"])
    except Exception as exc:  # NASA POWER caido o sin red
        raise HTTPException(502, t(f"No se pudo consultar NASA POWER: {exc}", f"We couldn't query NASA POWER: {exc}"))

    # Se ordena por vulnerabilidad para resaltar las temporadas criticas.
    months = vulnerability_by_month(clim)
    top = sorted(months, key=lambda x: x["vulnerability"], reverse=True)[:3]
    return {
        "zone": zone,
        "months": months,
        "most_vulnerable_months": [t["month"] for t in top],
        "bare_soil_months": bare_soil_months(zone["current_rotation"]),
        "strategies": strategies_for(zone_id),
        "method": {
            "weights": WEIGHTS,
            "climate_period": [2015, 2024],
            "climate_parameters": ["PRECTOTCORR", "T2M", "GWETROOT"],
            "crop_months": {c: CROP_MONTHS.get(c, []) for c in zone["current_rotation"] if c in CROP_MONTHS},
        },
        "sources": ["NASA POWER (PRECTOTCORR, T2M, GWETROOT)"],
        "disclaimer": DISCLAIMER(),
    }


def DISCLAIMER() -> str:
    return t("Herramienta de apoyo a la decisión. Validar con expertos locales.", "Decision-support tool. Check with local experts.")


class Point(BaseModel):
    lat: float = Field(ge=-60, le=75)
    lon: float = Field(ge=-180, le=180)


class HistoryItem(BaseModel):
    crop: str
    plant_year: int = Field(ge=1990, le=2100)
    plant_month: int = Field(ge=1, le=12)
    harvest_year: int = Field(ge=1990, le=2100)
    harvest_month: int = Field(ge=1, le=12)


class CropEconomics(BaseModel):
    yield_per_ha: float | None = None
    price_per_unit: float | None = None
    cost_per_ha: float | None = None


class RecommendRequest(Point):
    area_ha: float = Field(gt=0, le=100000)
    irrigated: bool = False
    history: list[HistoryItem] = []
    prices: dict[str, CropEconomics] = {}


def _climate(p: Point):
    try:
        return vulnerability_by_month(monthly_climatology(round(p.lat, 2), round(p.lon, 2)))
    except Exception as exc:
        raise HTTPException(502, t(f"No se pudo consultar NASA POWER: {exc}", f"We couldn't query NASA POWER: {exc}"))


@app.post("/point/analysis")
def point_analysis(p: Point):
    """Clima real (NASA POWER) y cultivos cercanos (CDL) para un punto elegido en el mapa."""
    months = _climate(p)
    top = sorted(months, key=lambda x: x["vulnerability"], reverse=True)[:3]
    return {
        "zone": {"id": "custom", "name": t("Mi punto", "My point"), "lat": p.lat, "lon": p.lon, "focus": "", "current_rotation": []},
        "months": months,
        "most_vulnerable_months": [t["month"] for t in top],
        "bare_soil_months": [],
        "strategies": [],
        "method": {
            "weights": WEIGHTS,
            "climate_period": [2015, 2024],
            "climate_parameters": ["PRECTOTCORR", "T2M", "GWETROOT"],
            "crop_months": {},
        },
        "sources": ["NASA POWER (PRECTOTCORR, T2M, GWETROOT)", t("CDL (USDA NASS), cultivos cercanos", "CDL (USDA NASS), nearby crops")],
        "disclaimer": DISCLAIMER(),
    }


@app.post("/recommend")
def recommend(req: RecommendRequest):
    months = _climate(req)
    la, lo = req.lat, req.lon
    # Todas las fuentes en paralelo: cada una tiene su caché y devuelve available=False si falla.
    # in_ctx lleva el idioma de la petición a cada hilo.
    with ThreadPoolExecutor(max_workers=7) as ex:
        jobs = {
            "local": ex.submit(in_ctx(local_crops), la, lo),
            "soil": ex.submit(in_ctx(soil_at), la, lo),
            "ndvi": ex.submit(in_ctx(ndvi_at), la, lo),
            "terrain": ex.submit(in_ctx(earthdata.srtm_at), la, lo),
            "water": ex.submit(in_ctx(earthdata.nldas_at), la, lo),
            "moisture": ex.submit(in_ctx(earthdata.smap_at), la, lo),
        }
        got = {k: localize(f.result()) for k, f in jobs.items()}
    return build_options(
        months,
        [h.model_dump() for h in req.history],
        req.irrigated,
        {k: v.model_dump() for k, v in req.prices.items()},
        got["local"],
        req.area_ha,
        soil=got["soil"],
        ndvi=got["ndvi"],
        terrain=got["terrain"],
        water=got["water"],
        moisture=got["moisture"],
    )


@app.get("/climate")
def climate(lat: float, lon: float, start: str, end: str, resolution: str = "monthly"):
    """Clima real de NASA POWER agregado. start/end en formato YYYYMMDD."""
    if resolution not in RESOLUTIONS:
        raise HTTPException(400, t(f"resolution debe ser una de {RESOLUTIONS}", f"resolution must be one of {RESOLUTIONS}"))
    try:
        s, e = int(start), int(end)
        if len(start) != 8 or len(end) != 8 or s > e:
            raise ValueError
    except ValueError:
        raise HTTPException(400, t("start y end deben ser YYYYMMDD y start <= end", "start and end must be YYYYMMDD and start <= end"))
    if int(end[:4]) - int(start[:4]) > 10:
        raise HTTPException(400, t("El rango máximo es de 10 años", "The maximum range is 10 years"))
    try:
        return aggregate(round(lat, 2), round(lon, 2), start, end, resolution)
    except Exception as exc:
        raise HTTPException(502, t(f"No se pudo consultar NASA POWER: {exc}", f"We couldn't query NASA POWER: {exc}"))


@app.post("/point/local-crops")
def point_local_crops(p: Point):
    """Cultivos cercanos (CDL). Va aparte del clima porque tarda mas."""
    return local_crops(p.lat, p.lon)


@app.post("/point/soil")
def point_soil(p: Point):
    """Suelo real (SSURGO) en el punto. Solo EE. UU."""
    return localize(soil_at(p.lat, p.lon))


@app.post("/point/ndvi")
def point_ndvi(p: Point):
    """NDVI real (MODIS MOD13Q1) del punto, ultimos ~14 meses."""
    return localize(ndvi_at(p.lat, p.lon))


# ---------- NASA Earthdata (requiere EARTHDATA_TOKEN) ----------


@app.get("/earthdata/status")
def earthdata_status():
    """Indica si el servidor tiene token de NASA Earthdata (no lo valida: cada fuente avisa si lo rechazan)."""
    return earthdata.status()


@app.post("/point/smap")
def point_smap(p: Point):
    """Humedad de la superficie del suelo medida por SMAP (NASA), últimas ~2 semanas. Global."""
    return localize(earthdata.smap_at(p.lat, p.lon))


@app.post("/point/imerg")
def point_imerg(p: Point):
    """Lluvia diaria por satélite (GPM IMERG Late, NASA), últimos 30 días. Global entre 60° N y 60° S."""
    return localize(earthdata.imerg_at(p.lat, p.lon))


@app.post("/point/nldas")
def point_nldas(p: Point):
    """Balance de agua mensual (NLDAS-2 Noah, NASA): humedad del suelo, evapotranspiración, escorrentía. EE. UU. contiguo."""
    return localize(earthdata.nldas_at(p.lat, p.lon))


@app.post("/point/srtm")
def point_srtm(p: Point):
    """Altura, pendiente y desnivel del terreno (SRTM, NASA, ~30 m). Global entre 60° N y 56° S."""
    return localize(earthdata.srtm_at(p.lat, p.lon))


class PriceRequest(Point):
    api_key: str | None = Field(default=None, max_length=80)


@app.get("/prices/status")
def prices_status():
    """Indica si el servidor tiene su propia clave de QuickStats (entonces el usuario no necesita la suya)."""
    return {"server_key": bool(QUICKSTATS_KEY)}


@app.post("/prices/reference")
def prices_reference(req: PriceRequest):
    """Precios de referencia por estado (USDA QuickStats). Usa la clave del usuario o, si no trae, la del servidor. No se guarda."""
    key = (req.api_key or "").strip() or QUICKSTATS_KEY
    if len(key) < 8:
        raise HTTPException(400, t("Falta la clave del USDA QuickStats.", "The USDA QuickStats key is missing."))
    try:
        return reference_prices(req.lat, req.lon, key)
    except PriceError as e:
        raise HTTPException(e.status, e.msg)


@app.post("/point/gaez/suitability")
def point_gaez_suitability(p: Point, input_level: Literal["High", "Low"] = "High"):
    """Idoneidad y rendimiento alcanzable por cultivo, en secano y con riego (GAEZ v4 Tema 4, 1981-2010). Global."""
    return localize(suitability_at(p.lat, p.lon, input_level))


@app.post("/point/gaez/growing")
def point_gaez_growing(p: Point):
    """Periodo de crecimiento, dias de helada y calor, lluvia y P/PET (GAEZ v4 Tema 2, 1981-2010). Global."""
    return localize(growing_at(p.lat, p.lon))


@app.post("/point/gaez/actual")
def point_gaez_actual(p: Point):
    """Cultivos realmente cosechados en el pixel: area, produccion y rendimiento (GAEZ v4 Tema 5, 2010). Global."""
    return localize(actual_at(p.lat, p.lon))


class StationsRequest(Point):
    year: int | None = Field(default=None, ge=1998, le=2100)
    radius_km: float = Field(default=40, gt=0, le=150)


@app.post("/point/stations")
def point_stations(req: StationsRequest):
    """Lluvia de estaciones CoCoRaHS cercanas (NOAA GHCN-Daily) frente a NASA POWER. Solo EE. UU."""
    return localize(stations_near(req.lat, req.lon, req.year, req.radius_km))


# ---------- Base de datos del ETL (backend/data/db, ver app/etl) ----------


@app.get("/datasets")
def datasets_status():
    """Tablas del ETL, si estan construidas y cuantas filas tienen, y las zonas piloto."""
    return datasets.resumen_estado()


@app.get("/datasets/cell")
def datasets_cell(lat: float, lon: float):
    """Todo lo que la base sabe de la celda de 0.25 grados que contiene el punto."""
    return datasets.celda(lat, lon)


@app.get("/datasets/zones/{zone}")
def datasets_zone(zone: str):
    """Resumen de una zona piloto: cultivos principales, sequia reciente, cobertura del suelo y validacion."""
    try:
        return datasets.zona_resumen(zone)
    except DatasetError as e:
        raise HTTPException(e.status, e.msg)


@app.get("/datasets/{table}")
def datasets_table(table: str, zona: str | None = None, cell_id: int | None = None, crop: str | None = None,
                   fuente: str | None = None, limit: int = 500, offset: int = 0):
    """Filas de una tabla con filtros simples (zona, celda, cultivo, fuente). Maximo 5000 por pagina."""
    try:
        return datasets.filas_tabla(table, zona, cell_id, {"crop": crop, "fuente": fuente},
                                    max(1, min(limit, 5000)), max(0, offset))
    except DatasetError as e:
        raise HTTPException(e.status, e.msg)


@app.get("/geocode")
def geocode(q: str):
    """Busca pueblo y estado, condado, codigo postal o direccion de EE. UU. (Gazetteer y geocodificador del Censo)."""
    from .geocode import search

    if not q.strip() or len(q) > 120:
        raise HTTPException(400, t("Escribe un pueblo, condado, código postal o dirección.", "Enter a town, county, ZIP code or address."))
    hit = search(q)
    if not hit:
        raise HTTPException(404, t("No encontramos ese lugar. Prueba con el pueblo y el estado, por ejemplo «Ames, Iowa», o con tu código postal.",
                                   "We couldn't find that place. Try the town and state, for example “Ames, Iowa”, or your ZIP code."))
    return hit
