"""Tablas 4 (climate_monthly) y 5 (climatology): GLDAS 2.1 (global) y NLDAS-2 (EE. UU.) via NASA Earthdata.

Requiere: earthaccess, xarray, h5netcdf (ver requirements-etl.txt) y un token de Earthdata en la
variable de entorno EARTHDATA_TOKEN (https://urs.earthdata.nasa.gov -> Generate Token).
"""
import os

import numpy as np
import pandas as pd

from .config import guardar
from .grid import AOIS, cell_id, registrar_cobertura

PERIODO_CLIMA = ("2000-01-01", "2024-12-31")
BASE_CLIM = (2000, 2024)

MAPA_GLDAS = {"sm_0_10": ["SoilMoi0_10cm_inst"], "sm_10_40": ["SoilMoi10_40cm_inst"],
              "sm_40_100": ["SoilMoi40_100cm_inst"], "precip": ["Rainf_f_tavg", "Rainf_tavg"],
              "evap": ["Evap_tavg"], "tair": ["Tair_f_inst"]}
MAPA_NOAH = {"sm_0_10": ["SoilM_0_10cm"], "sm_10_40": ["SoilM_10_40cm"],
             "sm_40_100": ["SoilM_40_100cm"], "evap": ["Evap"]}
MAPA_FORA = {"precip": ["APCP", "Rainf"], "tair": ["Tair"]}
VARS_CLIMA = ("sm_0_10", "sm_10_40", "sm_40_100", "precip", "evap", "tair", "balance")


def login_earthdata():
    import earthaccess

    token = os.environ.get("EARTHDATA_TOKEN", "").strip()
    if not token:
        raise RuntimeError("Falta EARTHDATA_TOKEN. Crea un token en https://urs.earthdata.nasa.gov "
                           "(Generate Token) y exportalo antes de construir el clima.")
    os.environ["EARTHDATA_TOKEN"] = token
    auth = earthaccess.login(strategy="environment")
    if not auth.authenticated:
        raise RuntimeError("Earthdata rechazo el token")
    print("Earthdata autenticado")


def construir_clima(fuente, short_name, version, mapa, temporal):
    """Descarga (en streaming) los granulos mensuales y los recorta a las zonas piloto."""
    import earthaccess
    import xarray as xr

    gr = earthaccess.search_data(short_name=short_name, version=version, temporal=temporal)
    gr = [g for g in gr if any(str(l).endswith((".nc4", ".nc")) for l in g.data_links())]
    print(fuente, short_name, "->", len(gr), "granulos")
    if not gr:
        return pd.DataFrame()
    ds = xr.open_mfdataset(earthaccess.open(gr), engine="h5netcdf", combine="by_coords").sortby("lat")
    elegidas = {c: next((v for v in cands if v in ds.data_vars), None) for c, cands in mapa.items()}
    print("mapeo:", elegidas)
    elegidas = {c: v for c, v in elegidas.items() if v}
    unidades = {c: ds[v].attrs.get("units", "") for c, v in elegidas.items()}
    print("unidades:", unidades)

    partes = []
    for zona, (w, s, e, n) in AOIS.items():
        sub = ds[list(elegidas.values())].sel(lat=slice(s, n), lon=slice(w, e))
        if sub.sizes["lat"] == 0 or sub.sizes["lon"] == 0:
            continue                      # la zona queda fuera de la cobertura de la fuente
        d = sub.load().to_dataframe().reset_index().rename(columns={v: c for c, v in elegidas.items()})
        d["zona"] = zona
        partes.append(d)
    if not partes:
        return pd.DataFrame()
    d = pd.concat(partes)
    d = d.dropna(subset=list(elegidas), how="all")
    d["time"] = pd.to_datetime(d["time"])
    d["cell_id"] = cell_id(d["lat"], d["lon"])

    dias = d["time"].dt.days_in_month
    for c in ("precip", "evap"):
        if c in d and "s-1" in unidades.get(c, "").replace(" ", ""):
            d[c] = d[c] * 86400 * dias                    # kg m-2 s-1 -> mm/mes
    for c, espesor_mm in (("sm_0_10", 100), ("sm_10_40", 300), ("sm_40_100", 600)):
        if c in d and "kg" in unidades.get(c, ""):
            d[c] = d[c] / espesor_mm                      # kg m-2 (mm de agua) -> fraccion volumetrica
    if "tair" in d and d["tair"].median() > 150:
        d["tair"] = d["tair"] - 273.15                    # K -> grados C

    d["año"], d["mes"] = d["time"].dt.year, d["time"].dt.month
    cols = [c for c in ("sm_0_10", "sm_10_40", "sm_40_100", "precip", "evap", "tair") if c in d]
    out = (d.groupby(["zona", "cell_id", "año", "mes"], as_index=False)
             .agg({**{c: "mean" for c in cols}, "lat": "mean", "lon": "mean"}))
    out["fuente"] = fuente
    return out


def climatologia(cm: pd.DataFrame, base=BASE_CLIM):
    """Media, desviacion y percentiles 10/90 por celda y mes, y z-scores de cada mes contra esa base."""
    vars_ = [v for v in VARS_CLIMA if v in cm]
    b = cm[cm["año"].between(*base)]
    g = b.groupby(["fuente", "cell_id", "mes"])[vars_]
    clim = pd.concat({"media": g.mean(), "desv": g.std(), "p10": g.quantile(.10), "p90": g.quantile(.90)}, axis=1)
    clim.columns = [f"{v}_{s}" for s, v in clim.columns]
    clim = clim.reset_index()
    m = cm[["fuente", "cell_id", "mes"]].merge(clim, on=["fuente", "cell_id", "mes"], how="left")
    for v in vars_:
        with np.errstate(divide="ignore", invalid="ignore"):
            z = (cm[v].values - m[f"{v}_media"].values) / m[f"{v}_desv"].values
        cm[f"{v}_z"] = np.where(np.isfinite(z), z, np.nan)
    return cm, clim


def construir(periodo=PERIODO_CLIMA, base=BASE_CLIM):
    """Construye climate_monthly y climatology."""
    login_earthdata()
    gl = construir_clima("GLDAS", "GLDAS_NOAH025_M", "2.1", MAPA_GLDAS, periodo)
    nl = pd.DataFrame()
    try:
        nl_a = construir_clima("NLDAS", "NLDAS_NOAH0125_M", "2.0", MAPA_NOAH, periodo)
        nl_b = construir_clima("NLDAS", "NLDAS_FORA0125_M", "2.0", MAPA_FORA, periodo)
        llave = ["fuente", "zona", "cell_id", "año", "mes"]
        if len(nl_a) and len(nl_b):
            nl = nl_a.merge(nl_b.drop(columns=["lat", "lon"]), on=llave, how="outer")
        else:
            print("NLDAS incompleto; se omite")
    except Exception as ex:
        print("NLDAS fallo:", type(ex).__name__, ex)

    cm = pd.concat([x for x in (gl, nl) if len(x)], ignore_index=True)
    if cm.empty:
        raise RuntimeError("Sin datos de clima: revisa short_name, version y login de Earthdata")
    if "precip" in cm and "evap" in cm:
        cm["balance"] = cm["precip"] - cm["evap"]            # mm/mes; negativo = deficit
    cm = cm.sort_values(["fuente", "cell_id", "año", "mes"]).reset_index(drop=True)
    cm, clim = climatologia(cm, base)
    guardar(cm, "climate_monthly")
    guardar(clim, "climatology")
    for f in cm["fuente"].unique():
        registrar_cobertura(f, cm.loc[cm["fuente"] == f, "cell_id"].unique())
    return cm, clim
