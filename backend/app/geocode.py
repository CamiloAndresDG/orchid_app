"""Look up a U.S. place: town and state, county, ZIP code or street address.

Official U.S. Census sources:
- Gazetteer 2024 (places, counties and ZCTAs): downloaded once and kept in the cache.
- Census Geocoder (onelineaddress) only for addresses with a number and street.
"""
import io
import re
import unicodedata
import zipfile

import httpx

from .config import CACHE_DIR
from .i18n import t
GAZ = "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/"
FILES = {"place": "2024_Gaz_place_national", "county": "2024_Gaz_counties_national", "zcta": "2024_Gaz_zcta_national"}
CENSUS_ADDRESS = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"

STATES = {
    "AL": "alabama", "AK": "alaska", "AZ": "arizona", "AR": "arkansas", "CA": "california", "CO": "colorado",
    "CT": "connecticut", "DE": "delaware", "FL": "florida", "GA": "georgia", "HI": "hawaii", "ID": "idaho",
    "IL": "illinois", "IN": "indiana", "IA": "iowa", "KS": "kansas", "KY": "kentucky", "LA": "louisiana",
    "ME": "maine", "MD": "maryland", "MA": "massachusetts", "MI": "michigan", "MN": "minnesota",
    "MS": "mississippi", "MO": "missouri", "MT": "montana", "NE": "nebraska", "NV": "nevada",
    "NH": "new hampshire", "NJ": "new jersey", "NM": "new mexico", "NY": "new york", "NC": "north carolina",
    "ND": "north dakota", "OH": "ohio", "OK": "oklahoma", "OR": "oregon", "PA": "pennsylvania",
    "RI": "rhode island", "SC": "south carolina", "SD": "south dakota", "TN": "tennessee", "TX": "texas",
    "UT": "utah", "VT": "vermont", "VA": "virginia", "WA": "washington", "WV": "west virginia",
    "WI": "wisconsin", "WY": "wyoming", "DC": "district of columbia",
}
NAME_TO_ABBR = {v: k for k, v in STATES.items()}
SUFFIX = re.compile(r"\s+(city|town|village|cdp|borough|municipality|township)$")

_tables: dict[str, list[dict]] = {}


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower().strip()
    return re.sub(r"\s+", " ", s)


def _load(kind: str) -> list[dict]:
    if kind in _tables:
        return _tables[kind]
    path = CACHE_DIR / f"{FILES[kind]}.txt"
    if not path.exists():
        r = httpx.get(f"{GAZ}{FILES[kind]}.zip", timeout=120)
        r.raise_for_status()
        with zipfile.ZipFile(io.BytesIO(r.content)) as z:
            path.write_bytes(z.read(z.namelist()[0]))
    lines = path.read_text(encoding="latin-1").splitlines()
    head = [h.strip() for h in lines[0].split("\t")]
    rows = [dict(zip(head, (c.strip() for c in ln.split("\t")))) for ln in lines[1:] if ln.strip()]
    _tables[kind] = rows
    return rows


def _point(row: dict) -> tuple[float, float]:
    return float(row["INTPTLAT"]), float(row["INTPTLONG"])


def _split_state(q: str) -> tuple[str, str | None]:
    """'Ames, Iowa' -> ('ames', 'IA'). Accepts the abbreviation or full name, with or without a comma."""
    t = _norm(q).replace(",", " ")
    t = re.sub(r"\s+", " ", t).strip()
    for name in sorted(NAME_TO_ABBR, key=len, reverse=True):
        if t.endswith(" " + name):
            return t[: -len(name) - 1].strip(), NAME_TO_ABBR[name]
    parts = t.rsplit(" ", 1)
    if len(parts) == 2 and parts[1].upper() in STATES:
        return parts[0].strip(), parts[1].upper()
    return t, None


def search(q: str) -> dict | None:
    q = q.strip()
    if not q:
        return None
    # ZIP code (ZCTA)
    m = re.fullmatch(r"(\d{5})(-\d{4})?", q)
    if m:
        row = next((r for r in _load("zcta") if r["GEOID"] == m.group(1)), None)
        if row:
            lat, lon = _point(row)
            return {"lat": lat, "lon": lon, "label": t(f"Código postal {m.group(1)}", f"ZIP code {m.group(1)}"), "kind": "zip"}
        return None
    # Address with number and street: Census geocoder from the server
    if re.match(r"^\d+\s+\w", q):
        try:
            r = httpx.get(CENSUS_ADDRESS, params={"address": q, "benchmark": "Public_AR_Current", "format": "json"}, timeout=30)
            hit = (r.json().get("result", {}).get("addressMatches") or [None])[0]
        except Exception:
            hit = None
        if hit:
            c = hit["coordinates"]
            return {"lat": c["y"], "lon": c["x"], "label": hit.get("matchedAddress", q), "kind": "address"}
    # County
    name, state = _split_state(q)
    if "county" in name:
        base = name.replace(" county", "").strip()
        for r in _load("county"):
            if (state is None or r["USPS"] == state) and _norm(r["NAME"]).replace(" county", "") == base:
                lat, lon = _point(r)
                return {"lat": lat, "lon": lon, "label": f"{r['NAME']}, {r['USPS']}", "kind": "county"}
    # Town or city
    best = None
    for r in _load("place"):
        if state and r["USPS"] != state:
            continue
        pname = SUFFIX.sub("", _norm(r["NAME"]))
        if pname == name:
            pop_rank = float(r.get("ALAND_SQMI") or 0)  # the largest one if several share the same name
            if best is None or pop_rank > best[0]:
                best = (pop_rank, r)
    if best:
        r = best[1]
        lat, lon = _point(r)
        return {"lat": lat, "lon": lon, "label": f"{SUFFIX.sub('', r['NAME'])}, {r['USPS']}", "kind": "place"}
    return None
