"""Table 10: crop_traits. Editable botanical draft in db/crop_traits.csv.

Only botanical family and nitrogen fixation are filled in, for the obvious crops; everything else is
left empty on purpose for the team to complete and verify (FAO, agricultural extension, literature).
If the CSV already exists it is kept as is (it's the editable source) and only the parquet is regenerated.
"""
import pandas as pd

from .config import DB, done, load, save

CSV_TRAITS = DB / "crop_traits.csv"

FAMILY = {"Wheat": "Poaceae", "Barley": "Poaceae", "Maize": "Poaceae", "Sorghum": "Poaceae",
          "Millet": "Poaceae", "Wetland rice": "Poaceae", "Rice": "Poaceae", "Sugarcane": "Poaceae",
          "Soybean": "Fabaceae", "Groundnut": "Fabaceae", "Pulses": "Fabaceae",
          "Sunflower": "Asteraceae", "Rapeseed": "Brassicaceae", "Cotton": "Malvaceae",
          "Sugarbeet": "Amaranthaceae", "Olive": "Oleaceae", "Oil palm": "Arecaceae",
          "Banana": "Musaceae", "Cassava": "Euphorbiaceae", "Tobacco": "Solanaceae"}
FIXER = {"Soybean": "si", "Groundnut": "si", "Pulses": "si"}
EMPTY_COLUMNS = ("profundidad_raiz", "ciclo_dias", "necesidad_agua", "plagas_comunes", "fuente_dato")


def _base_crops() -> pd.DataFrame:
    if done("gaez_actual"):
        return load("gaez_actual")[["crop_code", "crop"]].drop_duplicates().sort_values("crop")
    from .gaez import crop_names           # without gaez_actual: crop list from the FAO server

    names = crop_names()
    return pd.DataFrame({"crop_code": list(names), "crop": list(names.values())}).sort_values("crop")


def build() -> pd.DataFrame:
    if CSV_TRAITS.exists():
        ct = pd.read_csv(CSV_TRAITS)
        print("loaded from", CSV_TRAITS)
    else:
        ct = _base_crops().copy()
        ct["familia_botanica"] = ct["crop"].map(FAMILY)
        ct["fijador_nitrogeno"] = ct["crop"].map(FIXER).fillna(
            ct["familia_botanica"].notna().map({True: "no", False: None}))
        for c in EMPTY_COLUMNS:
            ct[c] = None
        ct["estado"] = "borrador"
        ct.to_csv(CSV_TRAITS, index=False)
        print("created", CSV_TRAITS, "-> edit it and verify every row")
    for c in ct.columns:
        if ct[c].dtype == object:
            ct[c] = ct[c].astype("string")
    save(ct, "crop_traits")
    return ct
