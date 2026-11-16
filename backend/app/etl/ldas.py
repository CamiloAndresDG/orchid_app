"""Tables 4 (climate_monthly) and 5 (climatology): GLDAS 2.1 (global) and NLDAS-2 (U.S.) via NASA Earthdata.

Requires: earthaccess, xarray, h5netcdf (see requirements-etl.txt) and an Earthdata token in the
EARTHDATA_TOKEN environment variable (https://urs.earthdata.nasa.gov -> Generate Token).
"""
import os

import numpy as np
import pandas as pd

from .config import save
from .grid import AOIS, cell_id, register_coverage

CLIMATE_PERIOD = ("2000-01-01", "2024-12-31")
CLIM_BASE = (2000, 2024)

GLDAS_MAP = {"sm_0_10": ["SoilMoi0_10cm_inst"], "sm_10_40": ["SoilMoi10_40cm_inst"],
             "sm_40_100": ["SoilMoi40_100cm_inst"], "precip": ["Rainf_f_tavg", "Rainf_tavg"],
             "evap": ["Evap_tavg"], "tair": ["Tair_f_inst"]}
NOAH_MAP = {"sm_0_10": ["SoilM_0_10cm"], "sm_10_40": ["SoilM_10_40cm"],
            "sm_40_100": ["SoilM_40_100cm"], "evap": ["Evap"]}
FORA_MAP = {"precip": ["APCP", "Rainf"], "tair": ["Tair"]}
CLIMATE_VARS = ("sm_0_10", "sm_10_40", "sm_40_100", "precip", "evap", "tair", "balance")


def login_earthdata():
    import earthaccess

    token = os.environ.get("EARTHDATA_TOKEN", "").strip()
    if not token:
        raise RuntimeError("EARTHDATA_TOKEN is missing. Create a token at https://urs.earthdata.nasa.gov "
                           "(Generate Token) and export it before building the climate tables.")
    os.environ["EARTHDATA_TOKEN"] = token
    auth = earthaccess.login(strategy="environment")
    if not auth.authenticated:
        raise RuntimeError("Earthdata rejected the token")
    print("Earthdata authenticated")


def build_climate(source, short_name, version, var_map, temporal):
    """Streams the monthly granules and clips them to the pilot zones."""
    import earthaccess
    import xarray as xr

    gr = earthaccess.search_data(short_name=short_name, version=version, temporal=temporal)
    gr = [g for g in gr if any(str(l).endswith((".nc4", ".nc")) for l in g.data_links())]
    print(source, short_name, "->", len(gr), "granules")
    if not gr:
        return pd.DataFrame()
    ds = xr.open_mfdataset(earthaccess.open(gr), engine="h5netcdf", combine="by_coords").sortby("lat")
    chosen = {c: next((v for v in cands if v in ds.data_vars), None) for c, cands in var_map.items()}
    print("mapping:", chosen)
    chosen = {c: v for c, v in chosen.items() if v}
    units = {c: ds[v].attrs.get("units", "") for c, v in chosen.items()}
    print("units:", units)

    parts = []
    for zone, (w, s, e, n) in AOIS.items():
        sub = ds[list(chosen.values())].sel(lat=slice(s, n), lon=slice(w, e))
        if sub.sizes["lat"] == 0 or sub.sizes["lon"] == 0:
            continue                      # the zone is outside the source's coverage
        d = sub.load().to_dataframe().reset_index().rename(columns={v: c for c, v in chosen.items()})
        d["zona"] = zone
        parts.append(d)
    if not parts:
        return pd.DataFrame()
    d = pd.concat(parts)
    d = d.dropna(subset=list(chosen), how="all")
    d["time"] = pd.to_datetime(d["time"])
    d["cell_id"] = cell_id(d["lat"], d["lon"])

    days = d["time"].dt.days_in_month
    for c in ("precip", "evap"):
        if c in d and "s-1" in units.get(c, "").replace(" ", ""):
            d[c] = d[c] * 86400 * days                    # kg m-2 s-1 -> mm/month
    for c, thickness_mm in (("sm_0_10", 100), ("sm_10_40", 300), ("sm_40_100", 600)):
        if c in d and "kg" in units.get(c, ""):
            d[c] = d[c] / thickness_mm                    # kg m-2 (mm of water) -> volumetric fraction
    if "tair" in d and d["tair"].median() > 150:
        d["tair"] = d["tair"] - 273.15                    # K -> degrees C

    d["año"], d["mes"] = d["time"].dt.year, d["time"].dt.month
    cols = [c for c in ("sm_0_10", "sm_10_40", "sm_40_100", "precip", "evap", "tair") if c in d]
    out = (d.groupby(["zona", "cell_id", "año", "mes"], as_index=False)
             .agg({**{c: "mean" for c in cols}, "lat": "mean", "lon": "mean"}))
    out["fuente"] = source
    return out


def climatology(cm: pd.DataFrame, base=CLIM_BASE):
    """Mean, standard deviation and 10/90 percentiles per cell and month, plus each month's z-score against that base."""
    vars_ = [v for v in CLIMATE_VARS if v in cm]
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


def build(period=CLIMATE_PERIOD, base=CLIM_BASE):
    """Builds climate_monthly and climatology."""
    login_earthdata()
    gl = build_climate("GLDAS", "GLDAS_NOAH025_M", "2.1", GLDAS_MAP, period)
    nl = pd.DataFrame()
    try:
        nl_a = build_climate("NLDAS", "NLDAS_NOAH0125_M", "2.0", NOAH_MAP, period)
        nl_b = build_climate("NLDAS", "NLDAS_FORA0125_M", "2.0", FORA_MAP, period)
        key = ["fuente", "zona", "cell_id", "año", "mes"]
        if len(nl_a) and len(nl_b):
            nl = nl_a.merge(nl_b.drop(columns=["lat", "lon"]), on=key, how="outer")
        else:
            print("NLDAS incomplete; skipped")
    except Exception as ex:
        print("NLDAS failed:", type(ex).__name__, ex)

    cm = pd.concat([x for x in (gl, nl) if len(x)], ignore_index=True)
    if cm.empty:
        raise RuntimeError("No climate data: check short_name, version and the Earthdata login")
    if "precip" in cm and "evap" in cm:
        cm["balance"] = cm["precip"] - cm["evap"]            # mm/month; negative = deficit
    cm = cm.sort_values(["fuente", "cell_id", "año", "mes"]).reset_index(drop=True)
    cm, clim = climatology(cm, base)
    save(cm, "climate_monthly")
    save(clim, "climatology")
    for f in cm["fuente"].unique():
        register_coverage(f, cm.loc[cm["fuente"] == f, "cell_id"].unique())
    return cm, clim
