"""Cliente de NASA POWER (sin API key). Climatologia mensual por punto."""
import json
from pathlib import Path

import httpx

CACHE_DIR = Path(__file__).resolve().parent.parent / "cache"
CACHE_DIR.mkdir(exist_ok=True)

URL = "https://power.larc.nasa.gov/api/temporal/monthly/point"
PARAMS = "PRECTOTCORR,T2M,GWETROOT"  # lluvia mm/dia, temp C, humedad zona radicular 0-1


def monthly_climatology(lat: float, lon: float, start: int = 2015, end: int = 2024) -> dict:
    """Devuelve {month(1-12): {precip_mm_day, temp_c, soil_wetness}} promedio del periodo."""
    key = CACHE_DIR / f"power_{lat:.2f}_{lon:.2f}_{start}_{end}.json"
    if key.exists():
        data = json.loads(key.read_text())
    else:
        r = httpx.get(
            URL,
            params={
                "parameters": PARAMS,
                "community": "AG",
                "longitude": lon,
                "latitude": lat,
                "start": start,
                "end": end,
                "format": "JSON",
            },
            timeout=60,
        )
        r.raise_for_status()
        data = r.json()
        key.write_text(json.dumps(data))

    series = data["properties"]["parameter"]
    out = {}
    for m in range(1, 13):
        suffix = f"{m:02d}"
        row = {}
        for name, label in (("PRECTOTCORR", "precip_mm_day"), ("T2M", "temp_c"), ("GWETROOT", "soil_wetness")):
            vals = [v for k, v in series[name].items() if k.endswith(suffix) and k[-2:] != "13" and v != -999]
            row[label] = round(sum(vals) / len(vals), 3) if vals else None
        out[m] = row
    return out
