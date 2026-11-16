"""Table 7 (stations_validation) and live query: rain from CoCoRaHS stations versus the model.

Default source: NOAA/NCEI GHCN-Daily, which includes the CoCoRaHS stations (IDs with the US1 prefix).
Stations are looked up in the GHCN-Daily inventory and their rain is requested from the NCEI Access Data
Service (no account needed). The direct CoCoRaHS API is kept (`source="cocorahs"`) but it usually answers HTML.

DataFrame column names (estacion, año, mes, lluvia_estacion_mm, ...) stay in Spanish: they are the stored
schema of the table and of the cached CSVs.
"""
import io
import json
import re
import time
from datetime import date

import httpx
import numpy as np
import pandas as pd

from .config import RAW, done, load, save
from .grid import AOIS, PILOTS, cell_id, distance_km, register_coverage

COCO = RAW / "cocorahs"
COCO.mkdir(parents=True, exist_ok=True)

COCO_ZONES = {"california_central": "CA", "iowa": "IA"}      # U.S. pilot zone -> state
COCO_PERIOD = ("2020-01-01", "2024-12-31")
MAX_STATIONS = 40                                            # stations closest to the zone's center

NCEI = "https://www.ncei.noaa.gov/access/services/data/v1"
EXP_ST = "https://data.cocorahs.org/cocorahs/export/exportstations.aspx"
EXP_REP = "https://data.cocorahs.org/export/exportreports.aspx"
INV_URL = "https://www.ncei.noaa.gov/pub/data/ghcn/daily/ghcnd-inventory.txt"


def _remote_table(url, params):
    err = None
    for attempt in range(3):
        try:
            r = httpx.get(url, params=params, timeout=httpx.Timeout(180, connect=15))
            if r.status_code >= 400:
                err = ValueError(f"HTTP {r.status_code}: {r.text[:300]!r}")
                if r.status_code < 500:
                    break                                  # client error: retrying won't help
                time.sleep(2 * (attempt + 1))
                continue
            txt = r.text.strip()
            if not txt:
                return pd.DataFrame()
            if txt.startswith("<"):
                raise ValueError("the response isn't data. First characters: " + txt[:200].replace("\n", " "))
            try:
                data = r.json()
                if isinstance(data, dict):
                    data = next((v for v in data.values() if isinstance(v, list)), [data])
                return pd.json_normalize(data)
            except ValueError:
                return pd.read_csv(io.StringIO(r.text))
        except Exception as ex:
            err = ex
            time.sleep(2 * (attempt + 1))
    print("query failed:", url, params, "|", type(err).__name__, str(err)[:400])
    return pd.DataFrame()


def _col(df, *patterns):
    for p in patterns:
        for c in df.columns:
            if re.search(p, str(c), re.I):
                return c
    return None


def _closest(st, la0, lo0, n=MAX_STATIONS):
    st = st.copy()
    st["dist"] = np.hypot(st["lat"] - la0, (st["lon"] - lo0) * np.cos(np.radians(la0)))
    return st.sort_values("dist").head(n).drop(columns="dist")


def us1_inventory() -> pd.DataFrame:
    """CoCoRaHS stations (US1 prefix) with PRCP in GHCN-Daily: id, lat, lon, first and last year."""
    cache = COCO / "ghcnd_us1_prcp.csv"
    if cache.exists() and time.time() - cache.stat().st_mtime < 30 * 86400:
        return pd.read_csv(cache)
    raw = COCO / "ghcnd-inventory.txt"
    if not raw.exists() or time.time() - raw.stat().st_mtime > 30 * 86400:
        r = httpx.get(INV_URL, timeout=httpx.Timeout(300, connect=15))
        r.raise_for_status()
        raw.write_bytes(r.content)
    inv = pd.read_fwf(raw, colspecs=[(0, 11), (12, 20), (21, 30), (31, 35), (36, 40), (41, 45)],
                      names=["estacion", "lat", "lon", "elemento", "anio_ini", "anio_fin"])
    inv = inv[(inv["elemento"] == "PRCP") & inv["estacion"].astype(str).str.startswith("US1")]
    inv = inv.drop(columns="elemento")
    inv.to_csv(cache, index=False)
    raw.unlink(missing_ok=True)                    # the full inventory weighs ~36 MB
    return inv


def ncei_prcp(ids: list[str], start: str, end: str, batch=20) -> pd.DataFrame:
    """Daily PRCP (mm) for GHCN-Daily stations from the NCEI Access Data Service, by year and batch."""
    parts = []
    for y in range(int(start[:4]), int(end[:4]) + 1):
        a = max(pd.Timestamp(start), pd.Timestamp(f"{y}-01-01")).strftime("%Y-%m-%d")
        b = min(pd.Timestamp(end), pd.Timestamp(f"{y}-12-31")).strftime("%Y-%m-%d")
        for i in range(0, len(ids), batch):
            p = {"dataset": "daily-summaries", "dataTypes": "PRCP", "stations": ",".join(ids[i:i + batch]),
                 "startDate": a, "endDate": b, "format": "csv", "units": "metric"}
            tbl = _remote_table(NCEI, p)
            if len(tbl):
                parts.append(tbl)
            time.sleep(0.3)
    return pd.concat(parts, ignore_index=True) if parts else pd.DataFrame()


def download_ncei(zone, start, end):
    """CoCoRaHS stations in the zone with data for the period, and their daily PRCP."""
    inv = us1_inventory()
    w, s, e, n = AOIS[zone]
    ok = (inv["lat"].between(s, n) & inv["lon"].between(w, e) &
          (inv["anio_ini"] <= int(start[:4])) & (inv["anio_fin"] >= int(end[:4])))
    st = inv.loc[ok, ["estacion", "lat", "lon"]]
    print(zone, "| CoCoRaHS (US1) stations in the zone with data for the period:", len(st))
    if st.empty:
        return pd.DataFrame(), pd.DataFrame()
    st = _closest(st, *PILOTS[zone])
    return st, ncei_prcp(st["estacion"].tolist(), start, end)


def cocorahs_stations(zone, state):
    st = pd.DataFrame()
    for country in (None, "usa", "USA"):
        p = {"format": "json", "state": state}
        if country:
            p["country"] = country
        st = _remote_table(EXP_ST, p)
        if len(st):
            break
    if st.empty:
        return st
    c_id = _col(st, r"^(st_?num|station_?number|station_?id)$", r"station.*(num|id)")
    c_lat, c_lon = _col(st, r"^lat"), _col(st, r"^(lng|lon)")
    if None in (c_id, c_lat, c_lon):
        return pd.DataFrame()
    st = st.rename(columns={c_id: "estacion", c_lat: "lat", c_lon: "lon"})[["estacion", "lat", "lon"]].copy()
    st["lat"] = pd.to_numeric(st["lat"], errors="coerce")
    st["lon"] = pd.to_numeric(st["lon"], errors="coerce")
    w, s, e, n = AOIS[zone]
    st = st.dropna()
    st = st[st["lat"].between(s, n) & st["lon"].between(w, e)]
    return _closest(st, *PILOTS[zone])


def cocorahs_reports(st, start, end, batch=20):
    ids = st["estacion"].astype(str).tolist()
    parts = []
    for y in range(int(start[:4]), int(end[:4]) + 1):
        a = max(pd.Timestamp(start), pd.Timestamp(f"{y}-01-01"))
        b = min(pd.Timestamp(end), pd.Timestamp(f"{y}-12-31"))
        for i in range(0, len(ids), batch):
            p = {"Format": "csv", "ReportType": "Daily", "ResponseFields": "all",
                 "ReportDateType": "reportdate", "StartDate": a.strftime("%m/%d/%Y"),
                 "EndDate": b.strftime("%m/%d/%Y"), "stations": ",".join(ids[i:i + batch])}
            t = _remote_table(EXP_REP, p)
            if len(t):
                parts.append(t)
            time.sleep(0.5)
    return pd.concat(parts, ignore_index=True) if parts else pd.DataFrame()


def monthly_rain(rep, st, unit="mm", min_coverage=0.8) -> pd.DataFrame:
    """Monthly rain per station; only months with at least 80% of days reported."""
    c_id = _col(rep, r"^stationnumber$", r"station.*(num|id)", r"^station$")
    c_date = _col(rep, r"^observationdate$", r"obs.*date", r"^date$")
    c_rain = _col(rep, r"^totalprecipamt$", r"totalprecip", r"precip.*amt", r"^prcp$", r"gauge")
    if None in (c_id, c_date, c_rain):
        print("Couldn't detect the columns. Available columns:", list(rep.columns))
        return pd.DataFrame()
    rain = rep[c_rain].astype(str).str.strip().replace({"T": "0", "NA": np.nan, "": np.nan, "nan": np.nan})
    r = pd.DataFrame({"estacion": rep[c_id].astype(str).str.strip(),
                      "fecha": pd.to_datetime(rep[c_date], errors="coerce"),
                      "lluvia": pd.to_numeric(rain, errors="coerce")}).dropna()
    if unit == "in":
        r["lluvia"] = r["lluvia"] * 25.4
    r = r.merge(st[["estacion", "lat", "lon"]].astype({"estacion": str}).drop_duplicates("estacion"),
                on="estacion", how="inner")
    r["año"], r["mes"], r["dias"] = r["fecha"].dt.year, r["fecha"].dt.month, r["fecha"].dt.days_in_month
    month = (r.groupby(["estacion", "lat", "lon", "año", "mes"], as_index=False)
               .agg(lluvia_estacion_mm=("lluvia", "sum"), n_obs=("lluvia", "size"), dias=("dias", "first")))
    month = month[month["n_obs"] >= min_coverage * month["dias"]].drop(columns="dias")
    month["cell_id"] = cell_id(month["lat"], month["lon"])
    return month


def build_validation(rep, st, climate, unit="mm"):
    month = monthly_rain(rep, st, unit)
    if month.empty:
        return month
    model = climate[["fuente", "cell_id", "año", "mes", "precip"]].rename(
        columns={"fuente": "fuente_modelo", "precip": "precip_modelo_mm"})
    return month.merge(model, on=["cell_id", "año", "mes"], how="inner")


def build(period=COCO_PERIOD, source="ncei", cocorahs_unit="in"):
    """Table 7. Needs climate_monthly (it compares against that table)."""
    if not done("climate_monthly"):
        raise RuntimeError("Build climate_monthly first (the validation compares against that table)")
    climate_cm = load("climate_monthly")
    sv_parts = []
    for zone, state in COCO_ZONES.items():
        fs, fr = COCO / f"{source}_stations_{zone}.csv", COCO / f"{source}_reports_{zone}.csv"
        if fs.exists() and fr.exists():
            st, rep = pd.read_csv(fs), pd.read_csv(fr)
        else:
            if source == "ncei":
                st, rep = download_ncei(zone, *period)
            else:
                st = cocorahs_stations(zone, state)
                rep = cocorahs_reports(st, *period) if len(st) else pd.DataFrame()
            if st.empty or rep.empty:
                print("no data for", zone)
                continue
            st.to_csv(fs, index=False)
            rep.to_csv(fr, index=False)
        v = build_validation(rep, st, climate_cm, "mm" if source == "ncei" else cocorahs_unit)
        if len(v):
            v["zona"] = zone
            sv_parts.append(v)
    if not sv_parts:
        raise RuntimeError("stations_validation wasn't generated: check the messages above")
    sv = pd.concat(sv_parts, ignore_index=True)
    save(sv, "stations_validation")
    register_coverage("CoCoRaHS", sv["cell_id"].unique())
    return sv


def validation_summary(sv: pd.DataFrame) -> list[dict]:
    """Correlation and mean bias (model - station) per model source."""
    out = []
    for f, x in sv.groupby("fuente_modelo"):
        out.append({"fuente_modelo": f, "meses": int(len(x)),
                    "correlacion": _r(x["lluvia_estacion_mm"].corr(x["precip_modelo_mm"]), 3),
                    "sesgo_mm": _r((x["precip_modelo_mm"] - x["lluvia_estacion_mm"]).mean(), 1)})
    return out


def _r(v, nd):
    return None if v is None or not np.isfinite(v) else round(float(v), nd)


# ---------------------------------------------------------------- live point query
from ..config import CACHE_DIR  # noqa: E402  (shared cache; on Azure it is Azure Files)


def stations_near(lat: float, lon: float, year: int | None = None, radius_km: float = 40, max_stations: int = 5) -> dict:
    """CoCoRaHS stations near the point, their monthly rain for the year and the comparison with NASA POWER."""
    from ..climate import aggregate

    year = year or date.today().year - 1
    lat, lon = round(lat, 3), round(lon, 3)
    key = CACHE_DIR / f"cocorahs_{lat}_{lon}_{year}_{int(radius_km)}.json"
    if key.exists():
        return json.loads(key.read_text(encoding="utf8"))
    # User-facing text stays in Spanish here; localize.py translates it on the way out.
    base = {"available": False, "lat": lat, "lon": lon, "year": year, "radius_km": radius_km,
            "stations": [], "months": [], "summary": None,
            "source": "CoCoRaHS (estaciones voluntarias US1) via GHCN-Daily, NOAA NCEI; modelo: NASA POWER PRECTOTCORR",
            "note": ""}
    try:
        inv = us1_inventory()
    except Exception as ex:
        base["note"] = f"No se pudo descargar el inventario de GHCN-Daily ({type(ex).__name__})."
        return base
    d = 1.5 * radius_km / 111
    cand = inv[inv["lat"].between(lat - d, lat + d) & inv["lon"].between(lon - 2 * d, lon + 2 * d)
               & (inv["anio_ini"] <= year) & (inv["anio_fin"] >= year)].copy()
    cand["dist_km"] = [distance_km(lat, lon, a, b) for a, b in zip(cand["lat"], cand["lon"])]
    cand = cand[cand["dist_km"] <= radius_km].sort_values("dist_km").head(max_stations)
    if cand.empty:
        base["note"] = (f"No hay estaciones CoCoRaHS con lluvia en {year} a menos de {radius_km:.0f} km. "
                        "CoCoRaHS cubre EE. UU. (y algunas zonas de Canada y Bahamas).")
        key.write_text(json.dumps(base), encoding="utf8")
        return base
    rep = ncei_prcp(cand["estacion"].tolist(), f"{year}-01-01", f"{year}-12-31")
    if rep.empty:
        base["note"] = "NOAA NCEI no respondio con datos. Intenta de nuevo."
        return base
    month = monthly_rain(rep, cand[["estacion", "lat", "lon"]])
    stations = []
    for _, s in cand.iterrows():
        m = month[month["estacion"] == s["estacion"]]
        stations.append({"id": s["estacion"], "lat": float(s["lat"]), "lon": float(s["lon"]),
                         "distance_km": round(float(s["dist_km"]), 1), "complete_months": int(len(m)),
                         "annual_mm": _r(m["lluvia_estacion_mm"].sum(), 1) if len(m) == 12 else None})
    try:
        power = aggregate(round(lat, 2), round(lon, 2), f"{year}0101", f"{year}1231", "monthly")["rows"]
        p_month = {int(r["start"][4:6]): r["precip_mm_total"] for r in power}
    except Exception:
        p_month = {}
    months = []
    for m in range(1, 13):
        x = month[month["mes"] == m]
        months.append({"month": m, "stations_mm": _r(x["lluvia_estacion_mm"].mean(), 1) if len(x) else None,
                       "n_stations": int(len(x)), "power_mm": p_month.get(m)})
    pairs = [(r["stations_mm"], r["power_mm"]) for r in months if r["stations_mm"] is not None and r["power_mm"] is not None]
    summary = None
    if len(pairs) >= 3:
        a, b = np.array(pairs).T
        summary = {"months_compared": len(pairs), "correlation": _r(np.corrcoef(a, b)[0, 1], 3),
                   "bias_mm": _r(float(np.mean(b - a)), 1),
                   "stations_total_mm": _r(float(a.sum()), 0), "power_total_mm": _r(float(b.sum()), 0)}
    base.update(available=bool(len(month)), stations=stations, months=months, summary=summary,
                note="Lluvia mensual media de las estaciones (solo meses con al menos 80 % de dias reportados). "
                     "Sesgo = NASA POWER menos estaciones.")
    key.write_text(json.dumps(base), encoding="utf8")
    return base
