"""Table 11: indicators_monthly (derived from climate_monthly).

Drought thresholds by convention (z < -1 notable, z < -2 extreme), not a GLDAS/NLDAS standard.
`riesgo_helada` (frost risk) and `ventana_inactividad` (dormancy window) stay empty until we have
minimum temperature and gaez_growing.
"""
import numpy as np
import pandas as pd

from .config import done, load, save


def build() -> pd.DataFrame:
    if not done("climate_monthly"):
        raise RuntimeError("Build climate_monthly first")
    cmx = load("climate_monthly")
    pref = (cmx.assign(prio=cmx["fuente"].map({"NLDAS": 0, "GLDAS": 1}).fillna(9))
               .sort_values("prio").drop_duplicates(["cell_id", "año", "mes"]).drop(columns="prio"))
    zcols = [c for c in ("sm_10_40_z", "sm_40_100_z") if c in pref]
    zr = pref[zcols].mean(axis=1) if zcols else pd.Series(np.nan, index=pref.index)
    ind = pref[["zona", "cell_id", "año", "mes", "fuente"]].copy()
    ind["z_humedad_radicular"] = zr
    ind["nivel_sequia"] = np.select([zr < -2, zr < -1], [2.0, 1.0], default=0.0)
    ind.loc[zr.isna(), "nivel_sequia"] = np.nan
    if "balance" in pref:
        ind["balance_mm"] = pref["balance"]
        ind["deficit_hidrico"] = (pref["balance"] < 0).astype(float).where(pref["balance"].notna())
    if "tair_z" in pref:
        ind["z_temperatura"] = pref["tair_z"]
    ind["riesgo_helada"] = np.nan          # pending: minimum temperature
    ind["ventana_inactividad"] = np.nan    # pending: gaez_growing (Theme 2)
    ind = ind.sort_values(["cell_id", "año", "mes"]).reset_index(drop=True)
    save(ind, "indicators_monthly")
    return ind
