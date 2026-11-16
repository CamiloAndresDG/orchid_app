"""Curated crop catalog (simple agronomic rules) and per-point reading of the CDL layer.

The catalog is curated rules, not measured data: it must be validated with local agricultural extension.
CDL (USDA NASS) only covers the U.S.; elsewhere it returns no data and nothing is made up.
"""
import collections
import io
import json
from concurrent.futures import ThreadPoolExecutor

import httpx
from PIL import Image

from .i18n import t

CATALOG = {
    "corn": {"name": "Maíz", "name_en": "Corn", "family": "gramineas", "water": "high", "plant": [4, 5], "cycle": 5, "kind": "cash"},
    "soybean": {"name": "Soja", "name_en": "Soybeans", "family": "leguminosas", "water": "med", "plant": [5, 6], "cycle": 5, "kind": "cash", "fixes_n": True},
    "wheat": {"name": "Trigo de invierno", "name_en": "Winter wheat", "family": "gramineas", "water": "med", "plant": [9, 10], "cycle": 8, "kind": "cash"},
    "sorghum": {"name": "Sorgo", "name_en": "Sorghum", "family": "gramineas", "water": "low", "plant": [5, 6, 7], "cycle": 4, "kind": "cash"},
    "sunflower": {"name": "Girasol", "name_en": "Sunflower", "family": "asteraceas", "water": "low", "plant": [5, 6], "cycle": 5, "kind": "cash"},
    "oats": {"name": "Avena", "name_en": "Oats", "family": "gramineas", "water": "low", "plant": [3, 4], "cycle": 4, "kind": "cash"},
    "cereal_rye": {"name": "Centeno de cobertura", "name_en": "Cereal rye cover", "family": "gramineas", "water": "low", "plant": [9, 10], "cycle": 7, "kind": "cover"},
    "clover": {"name": "Trébol de cobertura", "name_en": "Clover cover", "family": "leguminosas", "water": "low", "plant": [8, 9], "cycle": 7, "kind": "cover", "fixes_n": True},
}

def crop_name(key: str) -> str:
    """Crop name in the request's language."""
    c = CATALOG[key]
    return t(c["name"], c["name_en"])


# CDL layer color (RGB) -> crop. Verified against real queries: corn, soybeans, winter wheat
# and grassland. The rest (sorghum, sunflower, alfalfa, fallow, cotton, rice) come from the CDL legend
# and haven't been verified with a real point yet.
CDL_COLORS = {
    (255, 212, 0): "corn",
    (38, 115, 0): "soybean",
    (168, 112, 0): "wheat",
    (255, 158, 11): "sorghum",
    (255, 255, 0): "sunflower",
}
# Classes recognized only by the legend color, not verified with a real point.
UNVERIFIED = {"sorghum", "sunflower", "alfalfa/heno", "barbecho", "algodon", "arroz"}

CDL_OTHER = {
    (233, 255, 190): "pastizal",
    (255, 168, 227): "alfalfa/heno",
    (191, 191, 119): "barbecho",
    (255, 38, 38): "algodon",
    (0, 168, 226): "arroz",
}
from .config import CACHE_DIR
CDL_URL = "https://nassgeodata.gmu.edu/CropScapeService/wms_cdlall.cgi"


def _near(a, b, tol=5):
    return all(abs(x - y) <= tol for x, y in zip(a, b))


def _match(rgb, table):
    return next((v for k, v in table.items() if _near(rgb, k)), None)


def _cdl_year(lat: float, lon: float, year: int, half: float = 0.01) -> dict | None:
    params = dict(
        service="WMS", version="1.1.1", request="GetMap", layers=f"cdl_{year}", srs="EPSG:4326",
        bbox=f"{lon-half},{lat-half},{lon+half},{lat+half}", width=40, height=40,
        format="image/png", styles="", transparent="false",
    )
    try:
        r = httpx.get(CDL_URL, params=params, timeout=40)
        r.raise_for_status()
        im = Image.open(io.BytesIO(r.content)).convert("RGB")
    except Exception:
        return None
    counts = collections.Counter(im.getdata())
    total = sum(counts.values())
    shares = collections.Counter()
    for rgb, n in counts.items():
        key = _match(rgb, CDL_COLORS) or _match(rgb, CDL_OTHER) or "otros usos"
        shares[key] += n
    return {k: round(v / total, 3) for k, v in shares.items()}


def local_crops(lat: float, lon: float, years=(2021, 2022, 2023, 2024, 2025)) -> dict:
    """Crop mix around the point (~1 km) per year, according to CDL. U.S. only."""
    key = CACHE_DIR / f"cdl_{round(lat, 3)}_{round(lon, 3)}_{years[0]}_{years[-1]}.json"
    if key.exists():
        return _mark_unverified(json.loads(key.read_text(encoding="utf8")))
    with ThreadPoolExecutor(max_workers=5) as ex:
        results = list(ex.map(lambda y: _cdl_year(lat, lon, y), years))
    by_year = {y: r for y, r in zip(years, results) if r}
    # Outside the U.S. the layer comes back empty: no recognizable crop or grassland.
    known = {k for r in by_year.values() for k in r if k != "otros usos"}
    if not by_year:
        return {"available": False, "radius_km": 1.1, "years": {}, "note": t("No pudimos consultar el mapa de cultivos ahora.", "We couldn't query the crop map right now.")}
    if not known:
        out = {"available": False, "radius_km": 1.1, "years": {}, "note": NOTE_NONE}
    else:
        out = {"available": True, "radius_km": 1.1, "years": by_year, "note": NOTE_OK}
    key.write_text(json.dumps(out), encoding="utf8")
    return _mark_unverified(out)


# Notes are cached in Spanish; when read they are switched to the request's language.
NOTE_NONE = "No hay mapa de cultivos para este punto (solo cubre EE. UU.)."
NOTE_OK = "Clasificado por el color de la capa CDL (USDA NASS)."
NOTE_EN = {
    NOTE_NONE: "There's no crop map for this point (it only covers the U.S.).",
    NOTE_OK: "Classified by the color of the CDL layer (USDA NASS).",
}


def _mark_unverified(out: dict) -> dict:
    """Adds which present classes were recognized by a legend color we haven't verified yet."""
    seen = {k for y in out.get("years", {}).values() for k in y}
    out = {**out, "unverified": sorted(seen & UNVERIFIED)}
    if out.get("note") in NOTE_EN:
        out["note"] = t(out["note"], NOTE_EN[out["note"]])
    return out
