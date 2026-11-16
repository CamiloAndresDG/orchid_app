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


app = FastAPI(title="ORCHID API", lifespan=lifespan)
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
    except Exception as exc:  # NASA POWER down or no network
        raise HTTPException(502, t(f"No se pudo consultar NASA POWER: {exc}", f"We couldn't query NASA POWER: {exc}"))

    # Sorted by vulnerability to highlight the critical seasons.
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
    """Real climate (NASA POWER) and nearby crops (CDL) for a point picked on the map."""
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
    # Every source in parallel: each has its own cache and returns available=False if it fails.
    # in_ctx carries the request's language into each thread.
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
    """Aggregated real climate from NASA POWER. start/end in YYYYMMDD format."""
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
    """Nearby crops (CDL). Separate from climate because it takes longer."""
    return local_crops(p.lat, p.lon)


@app.post("/point/soil")
def point_soil(p: Point):
    """Real soil (SSURGO) at the point. U.S. only."""
    return localize(soil_at(p.lat, p.lon))


@app.post("/point/ndvi")
def point_ndvi(p: Point):
    """Real NDVI (MODIS MOD13Q1) at the point, last ~14 months."""
    return localize(ndvi_at(p.lat, p.lon))


# ---------- NASA Earthdata (requires EARTHDATA_TOKEN) ----------


@app.get("/earthdata/status")
def earthdata_status():
    """Whether the server has a NASA Earthdata token (it isn't validated: each source reports if it gets rejected)."""
    return earthdata.status()


@app.post("/point/smap")
def point_smap(p: Point):
    """Surface soil moisture measured by SMAP (NASA), last ~2 weeks. Global."""
    return localize(earthdata.smap_at(p.lat, p.lon))


@app.post("/point/imerg")
def point_imerg(p: Point):
    """Daily satellite rain (GPM IMERG Late, NASA), last 30 days. Global between 60° N and 60° S."""
    return localize(earthdata.imerg_at(p.lat, p.lon))


@app.post("/point/nldas")
def point_nldas(p: Point):
    """Monthly water balance (NLDAS-2 Noah, NASA): soil moisture, evapotranspiration, runoff. Contiguous U.S."""
    return localize(earthdata.nldas_at(p.lat, p.lon))


@app.post("/point/srtm")
def point_srtm(p: Point):
    """Terrain elevation, slope and relief (SRTM, NASA, ~30 m). Global between 60° N and 56° S."""
    return localize(earthdata.srtm_at(p.lat, p.lon))


class PriceRequest(Point):
    api_key: str | None = Field(default=None, max_length=80)


@app.get("/prices/status")
def prices_status():
    """Whether the server has its own QuickStats key (then the user doesn't need theirs)."""
    return {"server_key": bool(QUICKSTATS_KEY)}


@app.post("/prices/reference")
def prices_reference(req: PriceRequest):
    """Reference prices by state (USDA QuickStats). Uses the user's key or, if none is sent, the server's. Never stored."""
    key = (req.api_key or "").strip() or QUICKSTATS_KEY
    if len(key) < 8:
        raise HTTPException(400, t("Falta la clave del USDA QuickStats.", "The USDA QuickStats key is missing."))
    try:
        return reference_prices(req.lat, req.lon, key)
    except PriceError as e:
        raise HTTPException(e.status, e.msg)


@app.post("/point/gaez/suitability")
def point_gaez_suitability(p: Point, input_level: Literal["High", "Low"] = "High"):
    """Suitability and attainable yield per crop, rainfed and irrigated (GAEZ v4 Theme 4, 1981-2010). Global."""
    return localize(suitability_at(p.lat, p.lon, input_level))


@app.post("/point/gaez/growing")
def point_gaez_growing(p: Point):
    """Growing period, frost and heat days, rain and P/PET (GAEZ v4 Theme 2, 1981-2010). Global."""
    return localize(growing_at(p.lat, p.lon))


@app.post("/point/gaez/actual")
def point_gaez_actual(p: Point):
    """Crops actually harvested in the pixel: area, production and yield (GAEZ v4 Theme 5, 2010). Global."""
    return localize(actual_at(p.lat, p.lon))


class StationsRequest(Point):
    year: int | None = Field(default=None, ge=1998, le=2100)
    radius_km: float = Field(default=40, gt=0, le=150)


@app.post("/point/stations")
def point_stations(req: StationsRequest):
    """Rain from nearby CoCoRaHS stations (NOAA GHCN-Daily) versus NASA POWER. U.S. only."""
    return localize(stations_near(req.lat, req.lon, req.year, req.radius_km))


# ---------- ETL database (backend/data/db, see app/etl) ----------


@app.get("/datasets")
def datasets_status():
    """ETL tables, whether they are built and how many rows they have, plus the pilot zones."""
    return datasets.status_summary()


@app.get("/datasets/cell")
def datasets_cell(lat: float, lon: float):
    """Everything the database knows about the 0.25-degree cell that contains the point."""
    return datasets.cell(lat, lon)


@app.get("/datasets/zones/{zone}")
def datasets_zone(zone: str):
    """Summary of a pilot zone: main crops, recent drought, land cover and validation."""
    try:
        return datasets.zone_summary(zone)
    except DatasetError as e:
        raise HTTPException(e.status, e.msg)


@app.get("/datasets/{table}")
def datasets_table(table: str, zona: str | None = None, cell_id: int | None = None, crop: str | None = None,
                   fuente: str | None = None, limit: int = 500, offset: int = 0):
    """Rows of a table with simple filters (zona, cell, crop, fuente). At most 5000 per page."""
    try:
        return datasets.table_rows(table, zona, cell_id, {"crop": crop, "fuente": fuente},
                                    max(1, min(limit, 5000)), max(0, offset))
    except DatasetError as e:
        raise HTTPException(e.status, e.msg)


@app.get("/geocode")
def geocode(q: str):
    """Looks up a U.S. town and state, county, ZIP code or address (Census Gazetteer and geocoder)."""
    from .geocode import search

    if not q.strip() or len(q) > 120:
        raise HTTPException(400, t("Escribe un pueblo, condado, código postal o dirección.", "Enter a town, county, ZIP code or address."))
    hit = search(q)
    if not hit:
        raise HTTPException(404, t("No encontramos ese lugar. Prueba con el pueblo y el estado, por ejemplo «Ames, Iowa», o con tu código postal.",
                                   "We couldn't find that place. Try the town and state, for example “Ames, Iowa”, or your ZIP code."))
    return hit
