"""Seasonal vulnerability and bare-soil windows.

The index weights (WEIGHTS) are our own choice; the data comes from NASA POWER. CROP_MONTHS are typical
calendars used only in the example zones: for the farmer's field, the bare-soil months come from MODIS NDVI
or from their history.
"""

# Months (1-12) with the crop in the field, for the crop in the current rotation.
CROP_MONTHS = {
    "wheat": [10, 11, 12, 1, 2, 3, 4, 5, 6],
    "corn": [5, 6, 7, 8, 9, 10],
    "soybean": [5, 6, 7, 8, 9, 10],
    "sorghum": [6, 7, 8, 9, 10],
}


WEIGHTS = {"heat": 0.35, "dryness": 0.4, "low_rain": 0.25}


def vulnerability_by_month(clim: dict) -> list[dict]:
    """0-1 index: rises with heat and falls with soil moisture and rain."""
    temps = [v["temp_c"] for v in clim.values() if v["temp_c"] is not None]
    t_min, t_max = min(temps), max(temps)
    rains = [v["precip_mm_day"] for v in clim.values() if v["precip_mm_day"] is not None]
    r_max = max(rains) or 1

    out = []
    for m, v in clim.items():
        heat = (v["temp_c"] - t_min) / ((t_max - t_min) or 1)
        dryness = 1 - (v["soil_wetness"] if v["soil_wetness"] is not None else 0.5)
        low_rain = 1 - (v["precip_mm_day"] / r_max)
        index = round(WEIGHTS["heat"] * heat + WEIGHTS["dryness"] * dryness + WEIGHTS["low_rain"] * low_rain, 3)
        out.append({
            "month": m,
            **v,
            "vulnerability": index,
            "components": {"heat": round(heat, 3), "dryness": round(dryness, 3), "low_rain": round(low_rain, 3)},
        })
    return out


def bare_soil_months(current_rotation: list[str]) -> list[int]:
    """Months with no crop in the field according to the first crop of the rotation (approx.)."""
    covered: set[int] = set()
    for crop in current_rotation:
        covered.update(CROP_MONTHS.get(crop, []))
    return [m for m in range(1, 13) if m not in covered]
