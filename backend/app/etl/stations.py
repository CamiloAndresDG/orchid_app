"""Tabla 7 (stations_validation) y consulta en vivo: lluvia de estaciones CoCoRaHS frente al modelo.

Fuente por defecto: GHCN-Daily de NOAA/NCEI, que incluye las estaciones CoCoRaHS (ID con prefijo US1).
Las estaciones se buscan en el inventario de GHCN-Daily y su lluvia se pide al NCEI Access Data Service
(sin cuenta). La API directa de CoCoRaHS se conserva (`fuente="cocorahs"`) pero suele responder HTML.
"""
import io
import json
import re
import time
from datetime import date

import httpx
import numpy as np
import pandas as pd

from .config import BACKEND, RAW, cargar, guardar, hecho
from .grid import AOIS, PILOTOS, cell_id, distancia_km, registrar_cobertura

COCO = RAW / "cocorahs"
COCO.mkdir(parents=True, exist_ok=True)

ZONAS_COCO = {"california_central": "CA", "iowa": "IA"}      # zona piloto de EE. UU. -> estado
PERIODO_COCO = ("2020-01-01", "2024-12-31")
MAX_ESTACIONES = 40                                          # estaciones mas cercanas al centro de la zona

NCEI = "https://www.ncei.noaa.gov/access/services/data/v1"
EXP_ST = "https://data.cocorahs.org/cocorahs/export/exportstations.aspx"
EXP_REP = "https://data.cocorahs.org/export/exportreports.aspx"
INV_URL = "https://www.ncei.noaa.gov/pub/data/ghcn/daily/ghcnd-inventory.txt"


def _tabla_remota(url, params):
    err = None
    for intento in range(3):
        try:
            r = httpx.get(url, params=params, timeout=httpx.Timeout(180, connect=15))
            if r.status_code >= 400:
                err = ValueError(f"HTTP {r.status_code}: {r.text[:300]!r}")
                if r.status_code < 500:
                    break                                  # error del cliente: reintentar no sirve
                time.sleep(2 * (intento + 1))
                continue
            txt = r.text.strip()
            if not txt:
                return pd.DataFrame()
            if txt.startswith("<"):
                raise ValueError("la respuesta no son datos. Primeros caracteres: " + txt[:200].replace("\n", " "))
            try:
                dato = r.json()
                if isinstance(dato, dict):
                    dato = next((v for v in dato.values() if isinstance(v, list)), [dato])
                return pd.json_normalize(dato)
            except ValueError:
                return pd.read_csv(io.StringIO(r.text))
        except Exception as ex:
            err = ex
            time.sleep(2 * (intento + 1))
    print("fallo la consulta:", url, params, "|", type(err).__name__, str(err)[:400])
    return pd.DataFrame()


def _col(df, *patrones):
    for p in patrones:
        for c in df.columns:
            if re.search(p, str(c), re.I):
                return c
    return None


def _mas_cercanas(est, la0, lo0, n=MAX_ESTACIONES):
    est = est.copy()
    est["dist"] = np.hypot(est["lat"] - la0, (est["lon"] - lo0) * np.cos(np.radians(la0)))
    return est.sort_values("dist").head(n).drop(columns="dist")


def inventario_us1() -> pd.DataFrame:
    """Estaciones CoCoRaHS (prefijo US1) con PRCP en GHCN-Daily: id, lat, lon, anios de inicio y fin."""
    cache = COCO / "ghcnd_us1_prcp.csv"
    if cache.exists() and time.time() - cache.stat().st_mtime < 30 * 86400:
        return pd.read_csv(cache)
    bruto = COCO / "ghcnd-inventory.txt"
    if not bruto.exists() or time.time() - bruto.stat().st_mtime > 30 * 86400:
        r = httpx.get(INV_URL, timeout=httpx.Timeout(300, connect=15))
        r.raise_for_status()
        bruto.write_bytes(r.content)
    inv = pd.read_fwf(bruto, colspecs=[(0, 11), (12, 20), (21, 30), (31, 35), (36, 40), (41, 45)],
                      names=["estacion", "lat", "lon", "elemento", "anio_ini", "anio_fin"])
    inv = inv[(inv["elemento"] == "PRCP") & inv["estacion"].astype(str).str.startswith("US1")]
    inv = inv.drop(columns="elemento")
    inv.to_csv(cache, index=False)
    bruto.unlink(missing_ok=True)                  # el inventario completo pesa ~36 MB
    return inv


def prcp_ncei(ids: list[str], ini: str, fin: str, lote=20) -> pd.DataFrame:
    """PRCP diaria (mm) de estaciones GHCN-Daily desde el NCEI Access Data Service, por anios y lotes."""
    partes = []
    for y in range(int(ini[:4]), int(fin[:4]) + 1):
        a = max(pd.Timestamp(ini), pd.Timestamp(f"{y}-01-01")).strftime("%Y-%m-%d")
        b = min(pd.Timestamp(fin), pd.Timestamp(f"{y}-12-31")).strftime("%Y-%m-%d")
        for i in range(0, len(ids), lote):
            p = {"dataset": "daily-summaries", "dataTypes": "PRCP", "stations": ",".join(ids[i:i + lote]),
                 "startDate": a, "endDate": b, "format": "csv", "units": "metric"}
            tbl = _tabla_remota(NCEI, p)
            if len(tbl):
                partes.append(tbl)
            time.sleep(0.3)
    return pd.concat(partes, ignore_index=True) if partes else pd.DataFrame()


def descargar_ncei(zona, ini, fin):
    """Estaciones CoCoRaHS de la zona con datos en el periodo y su PRCP diaria."""
    inv = inventario_us1()
    w, s, e, n = AOIS[zona]
    ok = (inv["lat"].between(s, n) & inv["lon"].between(w, e) &
          (inv["anio_ini"] <= int(ini[:4])) & (inv["anio_fin"] >= int(fin[:4])))
    est = inv.loc[ok, ["estacion", "lat", "lon"]]
    print(zona, "| estaciones CoCoRaHS (US1) en la zona con datos en el periodo:", len(est))
    if est.empty:
        return pd.DataFrame(), pd.DataFrame()
    est = _mas_cercanas(est, *PILOTOS[zona])
    return est, prcp_ncei(est["estacion"].tolist(), ini, fin)


def estaciones_cocorahs(zona, estado):
    est = pd.DataFrame()
    for pais in (None, "usa", "USA"):
        p = {"format": "json", "state": estado}
        if pais:
            p["country"] = pais
        est = _tabla_remota(EXP_ST, p)
        if len(est):
            break
    if est.empty:
        return est
    c_id = _col(est, r"^(st_?num|station_?number|station_?id)$", r"station.*(num|id)")
    c_lat, c_lon = _col(est, r"^lat"), _col(est, r"^(lng|lon)")
    if None in (c_id, c_lat, c_lon):
        return pd.DataFrame()
    est = est.rename(columns={c_id: "estacion", c_lat: "lat", c_lon: "lon"})[["estacion", "lat", "lon"]].copy()
    est["lat"] = pd.to_numeric(est["lat"], errors="coerce")
    est["lon"] = pd.to_numeric(est["lon"], errors="coerce")
    w, s, e, n = AOIS[zona]
    est = est.dropna()
    est = est[est["lat"].between(s, n) & est["lon"].between(w, e)]
    return _mas_cercanas(est, *PILOTOS[zona])


def reportes_cocorahs(est, ini, fin, lote=20):
    ids = est["estacion"].astype(str).tolist()
    partes = []
    for y in range(int(ini[:4]), int(fin[:4]) + 1):
        a = max(pd.Timestamp(ini), pd.Timestamp(f"{y}-01-01"))
        b = min(pd.Timestamp(fin), pd.Timestamp(f"{y}-12-31"))
        for i in range(0, len(ids), lote):
            p = {"Format": "csv", "ReportType": "Daily", "ResponseFields": "all",
                 "ReportDateType": "reportdate", "StartDate": a.strftime("%m/%d/%Y"),
                 "EndDate": b.strftime("%m/%d/%Y"), "stations": ",".join(ids[i:i + lote])}
            t = _tabla_remota(EXP_REP, p)
            if len(t):
                partes.append(t)
            time.sleep(0.5)
    return pd.concat(partes, ignore_index=True) if partes else pd.DataFrame()


def lluvia_mensual(rep, est, unidad="mm", min_cobertura=0.8) -> pd.DataFrame:
    """Lluvia mensual por estacion; solo meses con al menos 80 % de dias reportados."""
    c_id = _col(rep, r"^stationnumber$", r"station.*(num|id)", r"^station$")
    c_fe = _col(rep, r"^observationdate$", r"obs.*date", r"^date$")
    c_ll = _col(rep, r"^totalprecipamt$", r"totalprecip", r"precip.*amt", r"^prcp$", r"gauge")
    if None in (c_id, c_fe, c_ll):
        print("No pude detectar las columnas. Columnas disponibles:", list(rep.columns))
        return pd.DataFrame()
    lluvia = rep[c_ll].astype(str).str.strip().replace({"T": "0", "NA": np.nan, "": np.nan, "nan": np.nan})
    r = pd.DataFrame({"estacion": rep[c_id].astype(str).str.strip(),
                      "fecha": pd.to_datetime(rep[c_fe], errors="coerce"),
                      "lluvia": pd.to_numeric(lluvia, errors="coerce")}).dropna()
    if unidad == "in":
        r["lluvia"] = r["lluvia"] * 25.4
    r = r.merge(est[["estacion", "lat", "lon"]].astype({"estacion": str}).drop_duplicates("estacion"),
                on="estacion", how="inner")
    r["año"], r["mes"], r["dias"] = r["fecha"].dt.year, r["fecha"].dt.month, r["fecha"].dt.days_in_month
    mes = (r.groupby(["estacion", "lat", "lon", "año", "mes"], as_index=False)
             .agg(lluvia_estacion_mm=("lluvia", "sum"), n_obs=("lluvia", "size"), dias=("dias", "first")))
    mes = mes[mes["n_obs"] >= min_cobertura * mes["dias"]].drop(columns="dias")
    mes["cell_id"] = cell_id(mes["lat"], mes["lon"])
    return mes


def construir_validacion(rep, est, clima, unidad="mm"):
    mes = lluvia_mensual(rep, est, unidad)
    if mes.empty:
        return mes
    mod = clima[["fuente", "cell_id", "año", "mes", "precip"]].rename(
        columns={"fuente": "fuente_modelo", "precip": "precip_modelo_mm"})
    return mes.merge(mod, on=["cell_id", "año", "mes"], how="inner")


def construir(periodo=PERIODO_COCO, fuente="ncei", unidad_cocorahs="in"):
    """Tabla 7. Necesita climate_monthly (compara contra esa tabla)."""
    if not hecho("climate_monthly"):
        raise RuntimeError("Primero genera climate_monthly (la validacion compara contra esa tabla)")
    clima_cm = cargar("climate_monthly")
    sv_partes = []
    for zona, estado in ZONAS_COCO.items():
        ae, ar = COCO / f"{fuente}_stations_{zona}.csv", COCO / f"{fuente}_reports_{zona}.csv"
        if ae.exists() and ar.exists():
            est, rep = pd.read_csv(ae), pd.read_csv(ar)
        else:
            if fuente == "ncei":
                est, rep = descargar_ncei(zona, *periodo)
            else:
                est = estaciones_cocorahs(zona, estado)
                rep = reportes_cocorahs(est, *periodo) if len(est) else pd.DataFrame()
            if est.empty or rep.empty:
                print("sin datos para", zona)
                continue
            est.to_csv(ae, index=False)
            rep.to_csv(ar, index=False)
        v = construir_validacion(rep, est, clima_cm, "mm" if fuente == "ncei" else unidad_cocorahs)
        if len(v):
            v["zona"] = zona
            sv_partes.append(v)
    if not sv_partes:
        raise RuntimeError("No se genero stations_validation: revisa los mensajes de arriba")
    sv = pd.concat(sv_partes, ignore_index=True)
    guardar(sv, "stations_validation")
    registrar_cobertura("CoCoRaHS", sv["cell_id"].unique())
    return sv


def resumen_validacion(sv: pd.DataFrame) -> list[dict]:
    """Correlacion y sesgo medio (modelo - estacion) por fuente del modelo."""
    out = []
    for f, x in sv.groupby("fuente_modelo"):
        out.append({"fuente_modelo": f, "meses": int(len(x)),
                    "correlacion": _r(x["lluvia_estacion_mm"].corr(x["precip_modelo_mm"]), 3),
                    "sesgo_mm": _r((x["precip_modelo_mm"] - x["lluvia_estacion_mm"]).mean(), 1)})
    return out


def _r(v, nd):
    return None if v is None or not np.isfinite(v) else round(float(v), nd)


# ---------------------------------------------------------------- consulta en vivo por punto
CACHE_DIR = BACKEND / "cache"


def stations_near(lat: float, lon: float, year: int | None = None, radio_km: float = 40, max_est: int = 5) -> dict:
    """Estaciones CoCoRaHS cercanas al punto, su lluvia mensual del anio y la comparacion con NASA POWER."""
    from ..climate import aggregate

    year = year or date.today().year - 1
    lat, lon = round(lat, 3), round(lon, 3)
    key = CACHE_DIR / f"cocorahs_{lat}_{lon}_{year}_{int(radio_km)}.json"
    if key.exists():
        return json.loads(key.read_text(encoding="utf8"))
    base = {"available": False, "lat": lat, "lon": lon, "year": year, "radius_km": radio_km,
            "stations": [], "months": [], "summary": None,
            "source": "CoCoRaHS (estaciones voluntarias US1) via GHCN-Daily, NOAA NCEI; modelo: NASA POWER PRECTOTCORR",
            "note": ""}
    try:
        inv = inventario_us1()
    except Exception as ex:
        base["note"] = f"No se pudo descargar el inventario de GHCN-Daily ({type(ex).__name__})."
        return base
    d = 1.5 * radio_km / 111
    cand = inv[inv["lat"].between(lat - d, lat + d) & inv["lon"].between(lon - 2 * d, lon + 2 * d)
               & (inv["anio_ini"] <= year) & (inv["anio_fin"] >= year)].copy()
    cand["dist_km"] = [distancia_km(lat, lon, a, b) for a, b in zip(cand["lat"], cand["lon"])]
    cand = cand[cand["dist_km"] <= radio_km].sort_values("dist_km").head(max_est)
    if cand.empty:
        base["note"] = (f"No hay estaciones CoCoRaHS con lluvia en {year} a menos de {radio_km:.0f} km. "
                        "CoCoRaHS cubre EE. UU. (y algunas zonas de Canada y Bahamas).")
        key.write_text(json.dumps(base), encoding="utf8")
        return base
    rep = prcp_ncei(cand["estacion"].tolist(), f"{year}-01-01", f"{year}-12-31")
    if rep.empty:
        base["note"] = "NOAA NCEI no respondio con datos. Intenta de nuevo."
        return base
    mes = lluvia_mensual(rep, cand[["estacion", "lat", "lon"]])
    estaciones = []
    for _, s in cand.iterrows():
        m = mes[mes["estacion"] == s["estacion"]]
        estaciones.append({"id": s["estacion"], "lat": float(s["lat"]), "lon": float(s["lon"]),
                           "distance_km": round(float(s["dist_km"]), 1), "complete_months": int(len(m)),
                           "annual_mm": _r(m["lluvia_estacion_mm"].sum(), 1) if len(m) == 12 else None})
    try:
        power = aggregate(round(lat, 2), round(lon, 2), f"{year}0101", f"{year}1231", "monthly")["rows"]
        p_mes = {int(r["start"][4:6]): r["precip_mm_total"] for r in power}
    except Exception:
        p_mes = {}
    meses = []
    for m in range(1, 13):
        x = mes[mes["mes"] == m]
        meses.append({"month": m, "stations_mm": _r(x["lluvia_estacion_mm"].mean(), 1) if len(x) else None,
                      "n_stations": int(len(x)), "power_mm": p_mes.get(m)})
    pares = [(r["stations_mm"], r["power_mm"]) for r in meses if r["stations_mm"] is not None and r["power_mm"] is not None]
    resumen = None
    if len(pares) >= 3:
        a, b = np.array(pares).T
        resumen = {"months_compared": len(pares), "correlation": _r(np.corrcoef(a, b)[0, 1], 3),
                   "bias_mm": _r(float(np.mean(b - a)), 1),
                   "stations_total_mm": _r(float(a.sum()), 0), "power_total_mm": _r(float(b.sum()), 0)}
    base.update(available=bool(len(mes)), stations=estaciones, months=meses, summary=resumen,
                note="Lluvia mensual media de las estaciones (solo meses con al menos 80 % de dias reportados). "
                     "Sesgo = NASA POWER menos estaciones.")
    key.write_text(json.dumps(base), encoding="utf8")
    return base
