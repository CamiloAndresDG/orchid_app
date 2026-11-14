"""Zonas de demo. Cada zona trae un campo representativo (punto) y su rotacion actual."""

ZONES = [
    {
        "id": "ks-sumner",
        "name": "Sumner County, Kansas",
        "state": "KS",
        "lat": 37.24,
        "lon": -97.40,
        "current_rotation": ["wheat", "fallow"],
        "focus": "Poca agua y barbecho con el suelo sin cubrir (acuífero Ogallala, sequías)",
    },
    {
        "id": "ia-story",
        "name": "Story County, Iowa",
        "state": "IA",
        "lat": 42.04,
        "lon": -93.46,
        "current_rotation": ["corn", "soybean"],
        "focus": "Suelo y nutrientes: el invierno queda sin cobertura entre maíz y soja",
    },
]


def get_zone(zone_id: str):
    return next((z for z in ZONES if z["id"] == zone_id), None)
