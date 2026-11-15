from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware

from .analysis import CROP_MONTHS, WEIGHTS, bare_soil_months, vulnerability_by_month
from .climate import RESOLUTIONS, aggregate
from .crops import local_crops
from .nasa_power import monthly_climatology
from .ndvi import ndvi_at
from .prices import PriceError, reference_prices
from .recommend import build_options
from .soil import soil_at
from .rotations import strategies_for
from .zones import ZONES, get_zone

app = FastAPI(title="Field Shift API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/zones")
def zones():
    return ZONES


@app.get("/zones/{zone_id}/analysis")
def analysis(zone_id: str):
    zone = get_zone(zone_id)
    if not zone:
        raise HTTPException(404, "Zona no encontrada")
    try:
        clim = monthly_climatology(zone["lat"], zone["lon"])
    except Exception as exc:  # NASA POWER caido o sin red
        raise HTTPException(502, f"No se pudo consultar NASA POWER: {exc}")

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
        "disclaimer": "Herramienta de apoyo a la decision. Validar con expertos locales.",
    }


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
        raise HTTPException(502, f"No se pudo consultar NASA POWER: {exc}")


@app.post("/point/analysis")
def point_analysis(p: Point):
    """Clima real (NASA POWER) y cultivos cercanos (CDL) para un punto elegido en el mapa."""
    months = _climate(p)
    top = sorted(months, key=lambda x: x["vulnerability"], reverse=True)[:3]
    return {
        "zone": {"id": "custom", "name": "Mi punto", "lat": p.lat, "lon": p.lon, "focus": "", "current_rotation": []},
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
        "sources": ["NASA POWER (PRECTOTCORR, T2M, GWETROOT)", "CDL (USDA NASS), cultivos cercanos"],
        "disclaimer": "Herramienta de apoyo a la decision. Validar con expertos locales.",
    }


@app.post("/recommend")
def recommend(req: RecommendRequest):
    months = _climate(req)
    local = local_crops(req.lat, req.lon)
    return build_options(
        months,
        [h.model_dump() for h in req.history],
        req.irrigated,
        {k: v.model_dump() for k, v in req.prices.items()},
        local,
        req.area_ha,
        soil=soil_at(req.lat, req.lon),
        ndvi=ndvi_at(req.lat, req.lon),
    )


@app.get("/climate")
def climate(lat: float, lon: float, start: str, end: str, resolution: str = "monthly"):
    """Clima real de NASA POWER agregado. start/end en formato YYYYMMDD."""
    if resolution not in RESOLUTIONS:
        raise HTTPException(400, f"resolution debe ser una de {RESOLUTIONS}")
    try:
        s, e = int(start), int(end)
        if len(start) != 8 or len(end) != 8 or s > e:
            raise ValueError
    except ValueError:
        raise HTTPException(400, "start y end deben ser YYYYMMDD y start <= end")
    if int(end[:4]) - int(start[:4]) > 10:
        raise HTTPException(400, "El rango maximo es de 10 anios")
    try:
        return aggregate(round(lat, 2), round(lon, 2), start, end, resolution)
    except Exception as exc:
        raise HTTPException(502, f"No se pudo consultar NASA POWER: {exc}")


@app.post("/point/local-crops")
def point_local_crops(p: Point):
    """Cultivos cercanos (CDL). Va aparte del clima porque tarda mas."""
    return local_crops(p.lat, p.lon)


@app.post("/point/soil")
def point_soil(p: Point):
    """Suelo real (SSURGO) en el punto. Solo EE. UU."""
    return soil_at(p.lat, p.lon)


@app.post("/point/ndvi")
def point_ndvi(p: Point):
    """NDVI real (MODIS MOD13Q1) del punto, ultimos ~14 meses."""
    return ndvi_at(p.lat, p.lon)


class PriceRequest(Point):
    api_key: str = Field(min_length=8, max_length=80)


@app.post("/prices/reference")
def prices_reference(req: PriceRequest):
    """Precios de referencia por estado (USDA QuickStats) con la clave gratuita del usuario. La clave no se guarda."""
    try:
        return reference_prices(req.lat, req.lon, req.api_key)
    except PriceError as e:
        raise HTTPException(e.status, e.msg)


@app.get("/geocode")
def geocode(q: str):
    """Busca pueblo y estado, condado, codigo postal o direccion de EE. UU. (Gazetteer y geocodificador del Censo)."""
    from .geocode import search

    if not q.strip() or len(q) > 120:
        raise HTTPException(400, "Escribe un pueblo, condado, código postal o dirección.")
    hit = search(q)
    if not hit:
        raise HTTPException(404, "No encontramos ese lugar. Prueba con el pueblo y el estado, por ejemplo «Ames, Iowa», o con tu código postal.")
    return hit
