"""Official reference prices (USDA NASS QuickStats): price received by farmers, by state.

Requires a free key from the farmer/team (https://quickstats.nass.usda.gov/api). It is never stored.
It is a yearly state average, not the local price at a given farm. U.S. only.
"""
import httpx

from .i18n import t

CENSUS = "https://geocoding.geo.census.gov/geocoder/geographies/coordinates"
QS = "https://quickstats.nass.usda.gov/api/api_GET/"

# catalog crop -> (QuickStats commodity, text short_desc must contain, unit, units per metric ton)
COMMODITIES = {
    "corn": ("CORN", "CORN, GRAIN - PRICE RECEIVED", "$ / BU", 39.368),
    "soybean": ("SOYBEANS", "SOYBEANS - PRICE RECEIVED", "$ / BU", 36.744),
    "wheat": ("WHEAT", "WHEAT - PRICE RECEIVED", "$ / BU", 36.744),
    "oats": ("OATS", "OATS - PRICE RECEIVED", "$ / BU", 68.894),
    "sorghum": ("SORGHUM", "SORGHUM, GRAIN - PRICE RECEIVED", "$ / CWT", 22.046),
    "sunflower": ("SUNFLOWER", "SUNFLOWER - PRICE RECEIVED", "$ / CWT", 22.046),
}


class PriceError(Exception):
    def __init__(self, status: int, msg: str):
        super().__init__(msg)
        self.status, self.msg = status, msg


def state_from_point(lat: float, lon: float) -> tuple[str, str] | None:
    try:
        r = httpx.get(CENSUS, params={"x": lon, "y": lat, "benchmark": "Public_AR_Current",
                                      "vintage": "Current_Current", "format": "json"}, timeout=30)
        s = r.json()["result"]["geographies"]["States"][0]
        return s["STUSAB"], s["NAME"]
    except Exception:
        return None


def _num(v: str):
    try:
        return float(str(v).replace(",", ""))
    except ValueError:
        return None  # "(D)" and similar: undisclosed value


def reference_prices(lat: float, lon: float, api_key: str, from_year: int = 2020) -> dict:
    st = state_from_point(lat, lon)
    if not st:
        raise PriceError(404, t("Este punto no está en un estado de EE. UU. QuickStats solo cubre EE. UU.",
                                "This point isn't in a U.S. state. QuickStats only covers the U.S."))
    abbr, state_name = st
    found, missing = [], []
    for crop, (commodity, prefix, unit, per_tonne) in COMMODITIES.items():
        try:
            r = httpx.get(QS, params={
                "key": api_key, "source_desc": "SURVEY", "commodity_desc": commodity,
                "statisticcat_desc": "PRICE RECEIVED", "agg_level_desc": "STATE", "state_alpha": abbr,
                "freq_desc": "ANNUAL", "year__GE": from_year, "format": "JSON",
            }, timeout=45)
        except httpx.HTTPError:
            raise PriceError(502, t("No se pudo conectar con QuickStats.", "We couldn't connect to QuickStats."))
        if r.status_code in (400, 401, 403):
            raise PriceError(401, t("QuickStats no aceptó la clave. Revisa que esté bien copiada.", "QuickStats didn't accept the key. Check that it's copied correctly."))
        if r.status_code == 429:
            raise PriceError(429, t("QuickStats pidió esperar un poco. Intenta en un minuto.", "QuickStats asked us to wait. Try again in a minute."))
        if r.status_code != 200:
            missing.append(crop)
            continue
        rows = [d for d in r.json().get("data", [])
                if str(d.get("short_desc", "")).startswith(prefix) and str(d.get("short_desc", "")).endswith(unit)
                and _num(d.get("Value")) is not None]
        if not rows:
            missing.append(crop)
            continue
        by_year: dict[int, float] = {}
        for d in rows:
            by_year.setdefault(int(d["year"]), _num(d["Value"]))
        series = [{"year": y, "price": by_year[y]} for y in sorted(by_year)]
        last = series[-1]
        found.append({
            "crop": crop, "commodity": commodity, "unit": unit, "series": series,
            "last_year": last["year"], "last_price": last["price"],
            "price_per_tonne": round(last["price"] * per_tonne, 1),
        })
    return {"state": abbr, "state_name": state_name, "prices": found, "missing": missing}
