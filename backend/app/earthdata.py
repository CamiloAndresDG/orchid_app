"""Fuentes de NASA Earthdata por punto: SMAP, GPM IMERG, NLDAS y SRTM.

Todas usan el token de NASA Earthdata (EARTHDATA_TOKEN, se crea en https://urs.earthdata.nasa.gov y vence a los
60 días). SMAP, IMERG y NLDAS se leen con OPeNDAP en la nube de Earthdata pidiendo solo el pixel del terreno;
SRTM se descarga una vez por bloque de 1 grado y queda en caché.

Nota de OPeNDAP (Hyrax en la nube): una petición de un solo valor devuelve vacío. Se pide una ventana de 2x2 que
contiene la celda del terreno y se toma esa celda (ver _win).
"""
import io
import json
import math
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone

import httpx
import numpy as np

from .config import CACHE_DIR, EARTHDATA_TOKEN

CMR = "https://cmr.earthdata.nasa.gov/search/granules.umm_json"
OPENDAP = "https://opendap.earthdata.nasa.gov/collections"
COLLECTIONS = {
    "smap": "C2938664763-NSIDC_CPRD",   # SPL3SMP_E v006: humedad del suelo, 9 km, diario
    "imerg": "C2723754859-GES_DISC",    # GPM_3IMERGDL v07: lluvia diaria, IMERG Late Run, 0.1°
    "nldas": "C1887990023-GES_DISC",    # NLDAS_NOAH0125_M v2.0: balance de agua mensual, 0.125°, EE. UU.
    "srtm": "C2763266360-LPCLOUD",      # SRTMGL1 v003: elevación, 1 segundo de arco (~30 m)
}
LINKS = {
    "smap": "https://nsidc.org/data/spl3smp_e/versions/6",
    "imerg": "https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGDL_07/summary",
    "nldas": "https://disc.gsfc.nasa.gov/datasets/NLDAS_NOAH0125_M_2.0/summary",
    "srtm": "https://lpdaac.usgs.gov/products/srtmgl1v003/",
}
DIR = CACHE_DIR / "earthdata"
DIR.mkdir(parents=True, exist_ok=True)

NO_TOKEN = "Falta configurar el token de NASA Earthdata en el servidor."
BAD_TOKEN = ("NASA Earthdata rechazó el token: puede haber vencido (dura 60 días) o falta autorizar el centro de datos "
             "en tu cuenta de Earthdata.")


class EarthdataAuthError(Exception):
    pass


def _client() -> httpx.Client:
    return httpx.Client(timeout=httpx.Timeout(90, connect=15), follow_redirects=True,
                        headers={"Authorization": f"Bearer {EARTHDATA_TOKEN}"})


def _cached(key: str, max_age_h: float | None, fn):
    """Caché en disco (en Azure es Azure Files). No guarda resultados sin datos para reintentar más tarde."""
    path = DIR / f"{key}.json"
    if path.exists() and (max_age_h is None or time.time() - path.stat().st_mtime < max_age_h * 3600):
        return json.loads(path.read_text(encoding="utf8"))
    out = fn()
    if out.get("available"):
        path.write_text(json.dumps(out), encoding="utf8")
    return out


def _guard(fn, base: dict) -> dict:
    """Envuelve una consulta: sin token, token rechazado o fuente caída se informan; nunca se inventa el dato."""
    if not EARTHDATA_TOKEN:
        return {**base, "available": False, "note": NO_TOKEN}
    try:
        return fn()
    except EarthdataAuthError:
        return {**base, "available": False, "note": BAD_TOKEN}
    except (httpx.HTTPError, ValueError, KeyError, OSError) as e:
        return {**base, "available": False, "note": f"NASA Earthdata no respondió ({type(e).__name__}). Intenta de nuevo en un rato."}


def _check(r: httpx.Response) -> httpx.Response:
    if r.status_code in (401, 403) or "urs.earthdata.nasa.gov" in str(r.url):
        raise EarthdataAuthError()
    r.raise_for_status()
    return r


def _granules(collection: str, start: date, end: date, n: int = 60) -> list[tuple[str, str]]:
    """(fecha, URL OPeNDAP) de los gránulos entre dos fechas, del más reciente al más antiguo. Sin login."""
    params = {"collection_concept_id": COLLECTIONS[collection], "page_size": n, "sort_key": "-start_date",
              "temporal": f"{start.isoformat()}T00:00:00Z,{end.isoformat()}T23:59:59Z"}
    with httpx.Client(timeout=60) as c:
        items = c.get(CMR, params=params).raise_for_status().json()["items"]
    out, seen = [], set()
    for it in items:
        day = it["umm"]["TemporalExtent"]["RangeDateTime"]["BeginningDateTime"][:10]
        url = next((r["URL"] for r in it["umm"].get("RelatedUrls", []) if "opendap.earthdata.nasa.gov" in r["URL"]), None)
        if url and day not in seen:  # SMAP publica a veces dos versiones del mismo día: se usa la primera
            seen.add(day)
            out.append((day, url))
    return out


def _dap(client: httpx.Client, url: str, ce: list[str]) -> dict[str, list[float]]:
    """Pide variables con OPeNDAP (DAP4, CSV) y devuelve {variable: valores}. NaN donde no hay dato."""
    r = _check(client.get(url + ".dap.csv", params={"dap4.ce": ";".join(ce)}))
    out: dict[str, list[float]] = {}
    for line in r.text.splitlines()[1:]:
        parts = [p.strip() for p in line.split(",")]
        name = parts[0].split("[")[0]
        vals = []
        for p in parts[1:]:
            if p:
                v = float(p)
                vals.append(float("nan") if v <= -9990 or v >= 9.9e19 else v)
        out.setdefault(name, []).extend(vals)
    return out


def _win(i: int, n: int) -> tuple[str, int]:
    """Rango de 2 celdas que contiene el índice i (dimensión de tamaño n) y la posición de i dentro del rango."""
    a = min(max(i, 0), n - 2)
    return f"[{a}:{a + 1}]", i - a


def _pick(vals: list[float], ro: int, co: int) -> float:
    """Valor de la celda (ro, co) en una ventana 2x2 aplanada fila por fila."""
    k = ro * 2 + co
    return vals[k] if len(vals) > k else float("nan")


def _parallel(fn, items, workers: int = 8):
    with ThreadPoolExecutor(max_workers=workers) as ex:
        return list(ex.map(fn, items))


def _num(v: float, nd: int = 3):
    return None if v is None or (isinstance(v, float) and math.isnan(v)) else round(v, nd)


# ---------------------------------------------------------------------------------------------------- SMAP

_A, _E = 6378137.0, 0.0818191908426
_K0 = math.cos(math.radians(30)) / math.sqrt(1 - _E**2 * math.sin(math.radians(30)) ** 2)
_CELL, _X0, _Y0, _ROWS, _COLS = 9008.055210146, -17367530.44516138, 7314540.830638585, 1624, 3856


def _ease2_9km(lat: float, lon: float) -> tuple[int, int]:
    """Fila y columna de la cuadrícula EASE-Grid 2.0 global de 9 km (EPSG:6933) que contiene el punto."""
    s = math.sin(math.radians(lat))
    q = (1 - _E**2) * (s / (1 - _E**2 * s**2) - (1 / (2 * _E)) * math.log((1 - _E * s) / (1 + _E * s)))
    x, y = _A * _K0 * math.radians(lon), _A * q / (2 * _K0)
    return int((_Y0 - y) // _CELL), int((x - _X0) // _CELL)


def _smap_word(v: float) -> str:
    return "seco" if v < 0.15 else "con humedad media" if v < 0.30 else "húmedo" if v < 0.40 else "muy húmedo"


def smap_at(lat: float, lon: float, days: int = 15) -> dict:
    """Humedad de los primeros ~5 cm del suelo medida por SMAP (promedio de pasadas AM y PM) en las últimas semanas."""
    base = {"source": "SMAP L3 9 km (SPL3SMP_E v006), NSIDC", "official_url": LINKS["smap"], "series": []}
    row, col = _ease2_9km(lat, lon)
    if not (0 <= row < _ROWS and 0 <= col < _COLS):
        return {**base, "available": False, "note": "SMAP no cubre esta latitud."}

    def calc():
        end = date.today()
        grans = _granules("smap", end - timedelta(days=days), end, n=days * 2 + 4)
        (sr, ro), (sc, co) = _win(row, _ROWS), _win(col, _COLS)
        sl = sr + sc
        am, pm = "/Soil_Moisture_Retrieval_Data_AM/", "/Soil_Moisture_Retrieval_Data_PM/"
        with _client() as c:
            def one(g):
                d = _dap(c, g[1], [f"{am}soil_moisture{sl}", f"{pm}soil_moisture_pm{sl}", f"{am}latitude{sl}", f"{am}longitude{sl}",
                                   f"{pm}latitude_pm{sl}", f"{pm}longitude_pm{sl}"])
                cell = lambda name: _pick(d.get(name, []), ro, co)  # noqa: E731
                vals = [v for v in (cell(f"{am}soil_moisture"), cell(f"{pm}soil_moisture_pm")) if not math.isnan(v)]
                lats = [v for v in (cell(f"{am}latitude"), cell(f"{pm}latitude_pm")) if not math.isnan(v)]
                lons = [v for v in (cell(f"{am}longitude"), cell(f"{pm}longitude_pm")) if not math.isnan(v)]
                return {"date": g[0], "value": round(sum(vals) / len(vals), 3) if vals else None,
                        "cell": (round(lats[0], 3), round(lons[0], 3)) if lats and lons else None}
            rows = sorted(_parallel(one, grans), key=lambda r: r["date"])
        ok = [r for r in rows if r["value"] is not None]
        cell = next((r["cell"] for r in ok if r["cell"]), None)
        out = {**base, "available": bool(ok), "series": [{"date": r["date"], "value": r["value"]} for r in rows],
               "cell_center": {"lat": cell[0], "lon": cell[1]} if cell else None, "units": "m³ de agua por m³ de suelo",
               "note": "Humedad de los primeros ~5 cm del suelo en una celda de 9 km. SMAP pasa por cada lugar cada 2 o 3 "
                       "días y no mide con suelo helado o nieve; esos días quedan sin dato."}
        if ok:
            last = ok[-1]
            mean = sum(r["value"] for r in ok) / len(ok)
            out.update(latest={"date": last["date"], "value": last["value"], "percent": round(last["value"] * 100),
                               "word": _smap_word(last["value"])},
                       mean=round(mean, 3), days_with_data=len(ok), days_checked=len(rows))
        else:
            out["note"] = "SMAP no tiene medidas recientes para este punto (suelo helado, nieve, agua o días sin pasada)."
        return out

    return _guard(lambda: _cached(f"smap_{lat:.3f}_{lon:.3f}_{date.today()}", 6, calc), base)


# ---------------------------------------------------------------------------------------------------- IMERG

def imerg_at(lat: float, lon: float, days: int = 30) -> dict:
    """Lluvia diaria por satélite (GPM IMERG Late Run, 0.1°) de los últimos días disponibles."""
    base = {"source": "GPM IMERG Late Run diario v07 (GES DISC)", "official_url": LINKS["imerg"], "series": []}
    if not -60 <= lat <= 60:
        return {**base, "available": False, "note": "IMERG solo cubre entre 60° norte y 60° sur."}
    i = min(3599, max(0, round((lon + 179.95) / 0.1)))
    j = min(1799, max(0, round((lat + 89.95) / 0.1)))

    def calc():
        end = date.today()
        grans = _granules("imerg", end - timedelta(days=days + 3), end, n=days + 6)[:days]
        with _client() as c:
            (si, io), (sj, jo) = _win(i, 3600), _win(j, 1800)

            def one(g):
                d = _dap(c, g[1], [f"/precipitation[0:0]{si}{sj}"])
                v = _pick(d.get("/precipitation", []), io, jo)
                return {"date": g[0], "mm": None if math.isnan(v) else round(v, 1)}
            rows = sorted(_parallel(one, grans), key=lambda r: r["date"])
        ok = [r for r in rows if r["mm"] is not None]
        out = {**base, "available": bool(ok), "series": rows, "cell_center": {"lat": round(-89.95 + 0.1 * j, 2), "lon": round(-179.95 + 0.1 * i, 2)},
               "note": "Lluvia estimada por satélite en una celda de unos 10 km; la versión «Late» sale con 1 o 2 días de retraso."}
        if ok:
            last7 = [r for r in ok if r["date"] > (date.fromisoformat(ok[-1]["date"]) - timedelta(days=7)).isoformat()]
            total = sum(r["mm"] for r in ok)
            out.update(total_mm=round(total, 1), total_in=round(total / 25.4, 2), last7_mm=round(sum(r["mm"] for r in last7), 1),
                       rain_days=sum(1 for r in ok if r["mm"] >= 1), first_date=ok[0]["date"], last_date=ok[-1]["date"], days=len(ok))
        return out

    return _guard(lambda: _cached(f"imerg_{i}_{j}_{date.today()}", 6, calc), base)


# ---------------------------------------------------------------------------------------------------- NLDAS

_NLDAS_VARS = ["SoilM_0_100cm", "SoilM_0_10cm", "Evap", "Qs", "Qsb", "Rainf"]


def _nldas_url(y: int, m: int) -> str:
    return (f"{OPENDAP}/{COLLECTIONS['nldas']}/granules/NLDAS_NOAH0125_M.2.0%3ANLDAS_NOAH0125_M.A{y}{m:02d}.020.nc")


def nldas_at(lat: float, lon: float, months: int = 12, normal_years: int = 10) -> dict:
    """Balance de agua mensual del modelo NLDAS-2 Noah: humedad del suelo hasta 1 m, evapotranspiración,
    escorrentía y lluvia de los últimos meses, y la humedad del último mes frente a su promedio de 10 años."""
    base = {"source": "NLDAS-2 Noah mensual v2.0 (GES DISC)", "official_url": LINKS["nldas"], "months": []}
    jy, ix = round((lat - 25.0625) / 0.125), round((lon + 124.9375) / 0.125)
    if not (0 <= jy < 224 and 0 <= ix < 464):
        return {**base, "available": False, "note": "NLDAS solo cubre los 48 estados contiguos de EE. UU."}

    def calc():
        latest = _granules("nldas", date.today() - timedelta(days=120), date.today(), n=4)
        if not latest:
            raise ValueError("sin gránulos recientes")
        y, m = int(latest[0][0][:4]), int(latest[0][0][5:7])
        recent = []
        for k in range(months):
            mm, yy = (m - k - 1) % 12 + 1, y + (m - k - 1) // 12
            recent.append((yy, mm))
        normals = [(y - k, m) for k in range(1, normal_years + 1)]
        (sy, yo), (sx, xo) = _win(jy, 224), _win(ix, 464)
        sl = f"[0:0]{sy}{sx}"
        with _client() as c:
            def one(ym):
                d = _dap(c, _nldas_url(*ym), [f"/{v}{sl}" for v in _NLDAS_VARS])
                return ym, {v: _pick(d.get(f"/{v}", []), yo, xo) for v in _NLDAS_VARS}
            got = dict(_parallel(one, recent + normals))
        rows = []
        for yy, mm in sorted(recent):
            v = got[(yy, mm)]
            rows.append({"month": f"{yy}-{mm:02d}", "soil_0_100_mm": _num(v["SoilM_0_100cm"], 0), "soil_0_10_mm": _num(v["SoilM_0_10cm"], 1),
                         "et_mm": _num(v["Evap"], 1), "runoff_mm": _num(v["Qs"] + v["Qsb"], 1), "rain_mm": _num(v["Rainf"], 1)})
        if all(r["soil_0_100_mm"] is None for r in rows):
            return {**base, "available": False, "note": "NLDAS no tiene datos en este punto (agua o fuera de tierra)."}
        normal_vals = [got[k]["SoilM_0_100cm"] for k in normals if not math.isnan(got[k]["SoilM_0_100cm"])]
        last = rows[-1]
        normal = sum(normal_vals) / len(normal_vals) if normal_vals else None
        anomaly = round((last["soil_0_100_mm"] - normal) / normal * 100) if normal and last["soil_0_100_mm"] is not None else None
        return {**base, "available": True, "months": rows, "latest_month": last["month"],
                "normal_soil_0_100_mm": _num(normal, 0), "normal_years": f"{y - normal_years}-{y - 1}", "soil_anomaly_pct": anomaly,
                "cell_center": {"lat": round(25.0625 + 0.125 * jy, 4), "lon": round(-124.9375 + 0.125 * ix, 4)},
                "note": "Modelo de superficie terrestre (no una medición directa) en una celda de unos 12 km. "
                        "kg/m² equivale a milímetros de agua."}

    return _guard(lambda: _cached(f"nldas_{jy}_{ix}_{date.today().isocalendar()[1]}", 72, calc), base)


# ---------------------------------------------------------------------------------------------------- SRTM

SRTM_DIR = DIR / "srtm"
SRTM_DIR.mkdir(parents=True, exist_ok=True)
_ARC = 30.87  # metros por segundo de arco en latitud


def _tile_name(lat: float, lon: float) -> str:
    la, lo = math.floor(lat), math.floor(lon)
    return f"{'N' if la >= 0 else 'S'}{abs(la):02d}{'E' if lo >= 0 else 'W'}{abs(lo):03d}"


def _tile(name: str) -> np.ndarray | None:
    """Bloque SRTM de 1°x1° (3601x3601, metros). Se descarga una vez; None si no existe (océano)."""
    path = SRTM_DIR / f"{name}.hgt"
    missing = SRTM_DIR / f"{name}.none"
    if missing.exists():
        return None
    if not path.exists():
        url = (f"https://data.lpdaac.earthdatacloud.nasa.gov/lp-prod-protected/SRTMGL1.003/"
               f"{name}.SRTMGL1.hgt/{name}.SRTMGL1.hgt.zip")
        with _client() as c:
            r = c.get(url)
            if r.status_code == 404:
                missing.touch()
                return None
            _check(r)
        with zipfile.ZipFile(io.BytesIO(r.content)) as z:
            member = next(n for n in z.namelist() if n.endswith(".hgt"))
            tmp = path.with_suffix(".part")
            tmp.write_bytes(z.read(member))
            tmp.replace(path)
    return np.memmap(path, dtype=">i2", mode="r", shape=(3601, 3601))


def _slope_word(p: float) -> str:
    return "plano" if p < 2 else "de pendiente suave" if p < 5 else "de pendiente moderada" if p < 10 else "de pendiente fuerte"


def srtm_at(lat: float, lon: float) -> dict:
    """Altura y pendiente del terreno (SRTM, ~30 m): en el punto, en ~270 m alrededor y el desnivel en ~1 km."""
    base = {"source": "SRTM GL1 v003, ~30 m (LP DAAC)", "official_url": LINKS["srtm"]}
    if not -56 <= lat <= 60:
        return {**base, "available": False, "note": "SRTM solo cubre entre 60° norte y 56° sur."}

    def calc():
        name = _tile_name(lat, lon)
        t = _tile(name)
        if t is None:
            return {**base, "available": False, "note": "SRTM no tiene datos aquí (agua o fuera de tierra)."}
        top, left = math.floor(lat) + 1, math.floor(lon)
        r, c = round((top - lat) * 3600), round((lon - left) * 3600)

        def window(h: int) -> np.ndarray:
            w = np.asarray(t[max(0, r - h): r + h + 1, max(0, c - h): c + h + 1], dtype=float)
            w[w <= -32000] = np.nan  # vacíos del radar
            return w

        near = window(4)  # 9x9 ≈ 270 m
        dy, dx = _ARC, _ARC * math.cos(math.radians(lat))
        gy, gx = np.gradient(near, dy, dx)
        slope = np.hypot(gx, gy) * 100
        km = window(16)  # 33x33 ≈ 1 km
        elev = float(t[r, c])
        if elev <= -32000 or np.isnan(slope).all():
            return {**base, "available": False, "note": "SRTM tiene un vacío de datos justo en este punto."}
        mean_slope, max_slope = float(np.nanmean(slope)), float(np.nanmax(slope))
        return {**base, "available": True, "tile": name, "elevation_m": round(elev), "elevation_ft": round(elev * 3.28084),
                "slope_pct": round(mean_slope, 1), "slope_max_pct": round(max_slope, 1), "slope_word": _slope_word(mean_slope),
                "relief_1km_m": round(float(np.nanmax(km) - np.nanmin(km))),
                "note": "Pendiente promedio en unos 270 m alrededor del punto, calculada con el modelo de elevación SRTM "
                        "(año 2000, píxeles de ~30 m)."}

    return _guard(lambda: _cached(f"srtm_{lat:.4f}_{lon:.4f}", None, calc), base)


def status() -> dict:
    return {"token": bool(EARTHDATA_TOKEN), "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
