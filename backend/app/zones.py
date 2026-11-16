"""Demo zones. Each zone has a representative field (point) and its current rotation."""
from .i18n import t

ZONES = [
    {
        "id": "ks-sumner",
        "name": "Sumner County, Kansas",
        "state": "KS",
        "lat": 37.24,
        "lon": -97.40,
        "current_rotation": ["wheat", "fallow"],
        "focus": "Poca agua y barbecho con el suelo sin cubrir (acuífero Ogallala, sequías)",
        "focus_en": "Little water and fallow with bare soil (Ogallala aquifer, droughts)",
    },
    {
        "id": "ia-story",
        "name": "Story County, Iowa",
        "state": "IA",
        "lat": 42.04,
        "lon": -93.46,
        "current_rotation": ["corn", "soybean"],
        "focus": "Suelo y nutrientes: el invierno queda sin cobertura entre maíz y soja",
        "focus_en": "Soil and nutrients: winter is left without cover between corn and soybeans",
    },
]


def _local(z: dict) -> dict:
    out = {k: v for k, v in z.items() if k != "focus_en"}
    out["focus"] = t(z["focus"], z["focus_en"])
    return out


def zones_localized() -> list[dict]:
    return [_local(z) for z in ZONES]


def get_zone(zone_id: str):
    z = next((z for z in ZONES if z["id"] == zone_id), None)
    return _local(z) if z else None
