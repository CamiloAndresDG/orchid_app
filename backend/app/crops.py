"""Catalogo curado de cultivos (reglas agronomicas simples) y lectura de la capa CDL por punto.

El catalogo son reglas curadas, no datos medidos: deben validarse con extensión agrícola local.
CDL (USDA NASS) solo cubre EE. UU.; fuera devuelve sin datos y no se inventa nada.
"""
import collections
import io
import json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

import httpx
from PIL import Image

CATALOG = {
    "corn": {"name": "Maíz", "family": "gramineas", "water": "high", "plant": [4, 5], "cycle": 5, "kind": "cash"},
    "soybean": {"name": "Soja", "family": "leguminosas", "water": "med", "plant": [5, 6], "cycle": 5, "kind": "cash", "fixes_n": True},
    "wheat": {"name": "Trigo de invierno", "family": "gramineas", "water": "med", "plant": [9, 10], "cycle": 8, "kind": "cash"},
    "sorghum": {"name": "Sorgo", "family": "gramineas", "water": "low", "plant": [5, 6, 7], "cycle": 4, "kind": "cash"},
    "sunflower": {"name": "Girasol", "family": "asteraceas", "water": "low", "plant": [5, 6], "cycle": 5, "kind": "cash"},
    "oats": {"name": "Avena", "family": "gramineas", "water": "low", "plant": [3, 4], "cycle": 4, "kind": "cash"},
    "cereal_rye": {"name": "Centeno de cobertura", "family": "gramineas", "water": "low", "plant": [9, 10], "cycle": 7, "kind": "cover"},
    "clover": {"name": "Trébol de cobertura", "family": "leguminosas", "water": "low", "plant": [8, 9], "cycle": 7, "kind": "cover", "fixes_n": True},
}

# Color de la capa CDL (RGB) -> cultivo. Verificados contra consultas reales: maiz, soja, trigo de invierno
# y pastizal. Los demas (sorgo, girasol, alfalfa, barbecho, algodon, arroz) vienen de la leyenda de CDL
# y no se han verificado con un punto real todavia.
CDL_COLORS = {
    (255, 212, 0): "corn",
    (38, 115, 0): "soybean",
    (168, 112, 0): "wheat",
    (255, 158, 11): "sorghum",
    (255, 255, 0): "sunflower",
}
CDL_OTHER = {
    (233, 255, 190): "pastizal",
    (255, 168, 227): "alfalfa/heno",
    (191, 191, 119): "barbecho",
    (255, 38, 38): "algodon",
    (0, 168, 226): "arroz",
}
CACHE_DIR = Path(__file__).resolve().parent.parent / "cache"
CACHE_DIR.mkdir(exist_ok=True)
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
    """Mezcla de cultivos alrededor del punto (~1 km) por año, segun CDL. Solo EE. UU."""
    key = CACHE_DIR / f"cdl_{round(lat, 3)}_{round(lon, 3)}_{years[0]}_{years[-1]}.json"
    if key.exists():
        return json.loads(key.read_text(encoding="utf8"))
    with ThreadPoolExecutor(max_workers=5) as ex:
        results = list(ex.map(lambda y: _cdl_year(lat, lon, y), years))
    by_year = {y: r for y, r in zip(years, results) if r}
    # Fuera de EE. UU. la capa viene vacia: sin ningun cultivo reconocible ni pastizal.
    known = {k for r in by_year.values() for k in r if k != "otros usos"}
    if not by_year:
        return {"available": False, "radius_km": 1.1, "years": {}, "note": "No pudimos consultar el mapa de cultivos ahora."}
    if not known:
        out = {"available": False, "radius_km": 1.1, "years": {}, "note": "No hay mapa de cultivos para este punto (solo cubre EE. UU.)."}
    else:
        out = {"available": True, "radius_km": 1.1, "years": by_year, "note": "Clasificado por el color de la capa CDL (USDA NASS)."}
    key.write_text(json.dumps(out), encoding="utf8")
    return out
