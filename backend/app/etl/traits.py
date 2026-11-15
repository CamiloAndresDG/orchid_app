"""Tabla 10: crop_traits. Borrador botanico editable en db/crop_traits.csv.

Solo se rellenan familia botanica y fijacion de nitrogeno de los cultivos evidentes; todo lo demas
queda vacio a proposito para que el equipo lo complete y verifique (FAO, extension agraria, literatura).
Si el CSV ya existe se respeta tal cual (es la fuente editable) y solo se regenera el parquet.
"""
import pandas as pd

from .config import DB, cargar, guardar, hecho

CSV_TRAITS = DB / "crop_traits.csv"

FAMILIA = {"Wheat": "Poaceae", "Barley": "Poaceae", "Maize": "Poaceae", "Sorghum": "Poaceae",
           "Millet": "Poaceae", "Wetland rice": "Poaceae", "Rice": "Poaceae", "Sugarcane": "Poaceae",
           "Soybean": "Fabaceae", "Groundnut": "Fabaceae", "Pulses": "Fabaceae",
           "Sunflower": "Asteraceae", "Rapeseed": "Brassicaceae", "Cotton": "Malvaceae",
           "Sugarbeet": "Amaranthaceae", "Olive": "Oleaceae", "Oil palm": "Arecaceae",
           "Banana": "Musaceae", "Cassava": "Euphorbiaceae", "Tobacco": "Solanaceae"}
FIJADOR = {"Soybean": "si", "Groundnut": "si", "Pulses": "si"}
COLUMNAS_VACIAS = ("profundidad_raiz", "ciclo_dias", "necesidad_agua", "plagas_comunes", "fuente_dato")


def _base_cultivos() -> pd.DataFrame:
    if hecho("gaez_actual"):
        return cargar("gaez_actual")[["crop_code", "crop"]].drop_duplicates().sort_values("crop")
    from .gaez import nombres_cultivo           # sin gaez_actual: lista de cultivos del servidor FAO

    nom = nombres_cultivo()
    return pd.DataFrame({"crop_code": list(nom), "crop": list(nom.values())}).sort_values("crop")


def construir() -> pd.DataFrame:
    if CSV_TRAITS.exists():
        ct = pd.read_csv(CSV_TRAITS)
        print("cargado desde", CSV_TRAITS)
    else:
        ct = _base_cultivos().copy()
        ct["familia_botanica"] = ct["crop"].map(FAMILIA)
        ct["fijador_nitrogeno"] = ct["crop"].map(FIJADOR).fillna(
            ct["familia_botanica"].notna().map({True: "no", False: None}))
        for c in COLUMNAS_VACIAS:
            ct[c] = None
        ct["estado"] = "borrador"
        ct.to_csv(CSV_TRAITS, index=False)
        print("creado", CSV_TRAITS, "-> editalo y verifica cada fila")
    for c in ct.columns:
        if ct[c].dtype == object:
            ct[c] = ct[c].astype("string")
    guardar(ct, "crop_traits")
    return ct
