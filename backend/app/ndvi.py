"""NDVI real por punto: MODIS MOD13Q1 (250 m, cada 16 dias) via el servicio del ORNL DAAC (NASA), sin cuenta."""
import json
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

import httpx

from .config import CACHE_DIR
BASE = "https://modis.ornl.gov/rst/api/v1/MOD13Q1/subset"
BAND = "250m_16_days_NDVI"
LOW_NDVI = 0.3  # criterio nuestro: por debajo se considera poca o ninguna cobertura


def _modis_date(d: date) -> str:
    return f"A{d.year}{d.timetuple().tm_yday:03d}"


def _composites(start: date, end: date) -> list[date]:
    """Fechas de composicion de MOD13Q1: dias 1, 17, 33, ... de cada anio."""
    out = []
    for y in range(start.year, end.year + 1):
        d = date(y, 1, 1)
        while d.year == y:
            if start <= d <= end:
                out.append(d)
            d += timedelta(days=16)
    return out


def subset_url(lat: float, lon: float, start: date, end: date) -> str:
    return (f"{BASE}?latitude={lat}&longitude={lon}&band={BAND}"
            f"&startDate={_modis_date(start)}&endDate={_modis_date(end)}&kmAboveBelow=0&kmLeftRight=0")


def _chunk(lat: float, lon: float, dates: list[date]) -> list[dict]:
    s, e = dates[0], dates[-1]
    recent = (date.today() - e).days < 90
    key = CACHE_DIR / f"ndvi_{lat}_{lon}_{_modis_date(s)}_{_modis_date(e)}.json"
    if key.exists():
        cached = json.loads(key.read_text())
        # Los tramos recientes se siguen completando: se reutilizan solo 12 horas.
        if not recent or time.time() - cached["fetched"] < 12 * 3600:
            return cached["rows"]
    rows = None
    for _attempt in range(2):  # el servicio del ORNL a veces tarda o falla: un reintento
        try:
            r = httpx.get(subset_url(lat, lon, s, e), headers={"Accept": "application/json"}, timeout=120)
            r.raise_for_status()
            rows = [
                {"date": x["calendar_date"], "ndvi": round(x["data"][0] * 0.0001, 3)}
                for x in r.json().get("subset", [])
                if x["data"] and x["data"][0] > -2000  # -3000 = sin dato
            ]
            break
        except Exception:
            continue
    if rows is None:
        return []
    key.write_text(json.dumps({"fetched": time.time(), "rows": rows}))
    return rows


def ndvi_at(lat: float, lon: float, months: int = 14) -> dict:
    lat, lon = round(lat, 3), round(lon, 3)
    end = date.today()
    start = end - timedelta(days=months * 30)
    last_composite = end - timedelta(days=28)  # MODIS publica los compuestos con ~3-4 semanas de retraso
    dates = _composites(start, last_composite)
    chunks = [dates[i:i + 4] for i in range(0, len(dates), 4)]
    with ThreadPoolExecutor(max_workers=8) as ex:
        results = list(ex.map(lambda c: _chunk(lat, lon, c), chunks))
    series = sorted((row for part in results for row in part), key=lambda r: r["date"])
    latest = dates[-1] if dates else end
    out = {
        "available": bool(series),
        "series": series,
        "threshold": LOW_NDVI,
        "product": "MOD13Q1 (MODIS/Terra, 250 m, cada 16 días)",
        "official_url": subset_url(lat, lon, dates[max(0, len(dates) - 10)], latest) if dates else None,
        "note": "NDVI del píxel de 250 m que contiene tu punto; puede incluir terreno vecino.",
    }
    if not series:
        out["note"] = "No se pudo obtener NDVI para este punto ahora."
        return out
    # Promedio por mes calendario de los ultimos 12 meses con dato.
    last_year = [r for r in series if r["date"] >= (end - timedelta(days=365)).isoformat()]
    by_month: dict[int, list[float]] = {}
    for r in last_year:
        by_month.setdefault(int(r["date"][5:7]), []).append(r["ndvi"])
    monthly = {m: round(sum(v) / len(v), 3) for m, v in by_month.items()}
    out["monthly"] = monthly
    out["low_months"] = sorted(m for m, v in monthly.items() if v < LOW_NDVI)
    return out
