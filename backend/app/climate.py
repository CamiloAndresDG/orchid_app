"""Serie climatica diaria de NASA POWER agregada por dia, mes, trimestre, semestre o anio."""
import json
from datetime import date, datetime

import httpx

from .config import CACHE_DIR
DAILY_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
PARAMS = "PRECTOTCORR,T2M,GWETROOT"
RESOLUTIONS = ("daily", "monthly", "quarterly", "semester", "yearly")


def official_url(lat: float, lon: float, start: str, end: str) -> str:
    q = f"parameters={PARAMS}&community=AG&longitude={lon}&latitude={lat}&start={start}&end={end}&format=JSON"
    return f"{DAILY_URL}?{q}"


def _fetch_daily(lat: float, lon: float, start: str, end: str) -> dict:
    key = CACHE_DIR / f"daily_{lat:.2f}_{lon:.2f}_{start}_{end}.json"
    # No se cachea si el rango llega a fechas recientes (los datos se siguen completando).
    recent = (date.today() - datetime.strptime(end, "%Y%m%d").date()).days < 30
    if key.exists() and not recent:
        return json.loads(key.read_text())
    r = httpx.get(
        DAILY_URL,
        params={"parameters": PARAMS, "community": "AG", "longitude": lon, "latitude": lat,
                "start": start, "end": end, "format": "JSON"},
        timeout=90,
    )
    r.raise_for_status()
    data = r.json()["properties"]["parameter"]
    if not recent:
        key.write_text(json.dumps(data))
    return data


def _bucket(day: str, resolution: str) -> tuple[str, str]:
    y, m = int(day[:4]), int(day[4:6])
    if resolution == "daily":
        return day, f"{day[6:]}/{day[4:6]}/{day[:4]}"
    if resolution == "monthly":
        return f"{y}{m:02d}", f"{y}-{m:02d}"
    if resolution == "quarterly":
        q = (m - 1) // 3 + 1
        return f"{y}Q{q}", f"{y} T{q}"
    if resolution == "semester":
        h = 1 if m <= 6 else 2
        return f"{y}S{h}", f"{y} S{h}"
    return str(y), str(y)


def aggregate(lat: float, lon: float, start: str, end: str, resolution: str) -> dict:
    if resolution not in RESOLUTIONS:
        raise ValueError("resolucion invalida")
    data = _fetch_daily(lat, lon, start, end)
    days = sorted(data["PRECTOTCORR"])
    groups: dict[str, dict] = {}
    for d in days:
        p, t, w = data["PRECTOTCORR"][d], data["T2M"][d], data["GWETROOT"][d]
        if p == -999 or t == -999:
            continue
        key, label = _bucket(d, resolution)
        g = groups.setdefault(key, {"label": label, "start": d, "end": d, "n": 0, "p": 0.0, "t": 0.0, "w": 0.0, "nw": 0})
        g["n"] += 1
        g["p"] += p
        g["t"] += t
        g["end"] = d
        if w != -999:
            g["w"] += w
            g["nw"] += 1
    rows = [
        {
            "label": g["label"],
            "start": g["start"],
            "end": g["end"],
            "days": g["n"],
            "precip_mm_total": round(g["p"], 1),
            "precip_mm_day": round(g["p"] / g["n"], 2),
            "temp_c": round(g["t"] / g["n"], 1),
            "soil_wetness": round(g["w"] / g["nw"], 2) if g["nw"] else None,
        }
        for g in groups.values()
    ]
    return {
        "resolution": resolution,
        "start": start,
        "end": end,
        "rows": rows,
        "last_available": max((g["end"] for g in groups.values()), default=None),
        "official_url": official_url(lat, lon, start, end),
    }
