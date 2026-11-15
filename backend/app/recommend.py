"""Motor de reglas: opciones para el proximo cultivo segun historial, clima real y cultivos de la zona."""
from datetime import date

from .crops import CATALOG

MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

def _rain_text(mm_day: float) -> str:
    """Lluvia del mes en pulgadas (con mm al lado): promedio diario x 30.4 dias."""
    inches = mm_day * 30.4 / 25.4
    return f"{inches:.1f} pulgadas al mes ({mm_day * 30.4:.0f} mm)"


def _temp_text(c: float) -> str:
    return f"{c * 9 / 5 + 32:.0f} °F ({c:.0f} °C)"


def _soil_text(w: float) -> str:
    return "suelo seco" if w < 0.35 else "humedad media del suelo" if w < 0.55 else "suelo húmedo"


WATER_FACTOR = {"low": 0.6, "med": 1.0, "high": 1.4}


def _months_between(y1: int, m1: int, y2: int, m2: int) -> int:
    return (y2 - y1) * 12 + (m2 - m1)


def _covered_months(history: list[dict], today: date) -> set[int]:
    """Meses (1-12) con cultivo en campo durante los ultimos 12 meses."""
    covered: set[int] = set()
    for h in history:
        for k in range(0, _months_between(h["plant_year"], h["plant_month"], h["harvest_year"], h["harvest_month"]) + 1):
            idx = h["plant_month"] - 1 + k
            y, m = h["plant_year"] + idx // 12, idx % 12 + 1
            if _months_between(y, m, today.year, today.month) in range(0, 12):
                covered.add(m)
    return covered


def _cycle_months(crop: dict, start: int) -> list[int]:
    return [((start - 1 + i) % 12) + 1 for i in range(crop["cycle"])]


def _best_start(crop: dict, months_by_num: dict, today: date) -> int:
    """Mes de siembra: el primero de la ventana que no sea anterior al actual; si no, el de menor vulnerabilidad."""
    upcoming = [m for m in crop["plant"] if m >= today.month]
    pool = upcoming or crop["plant"]
    return min(pool, key=lambda m: sum(months_by_num[x]["vulnerability"] for x in _cycle_months(crop, m)))


def build_options(analysis_months: list[dict], history: list[dict], irrigated: bool, prices: dict,
                  local: dict, area_ha: float, today: date | None = None, soil: dict | None = None, ndvi: dict | None = None) -> dict:
    today = today or date.today()
    months = {m["month"]: m for m in analysis_months}
    history = sorted(history, key=lambda h: (h["harvest_year"], h["harvest_month"]))
    last = history[-1] if history else None
    last_crop = last["crop"] if last else None
    last_family = CATALOG[last_crop]["family"] if last_crop in CATALOG else None
    recent = [h["crop"] for h in history[-3:]]

    covered = _covered_months(history, today)
    bare = [m for m in range(1, 13) if m not in covered] if history else []
    bare_source = "history" if history else None
    # Si hay NDVI medido, manda sobre el calendario declarado: es lo que se ve desde el satelite.
    if ndvi and ndvi.get("available") and ndvi.get("monthly") is not None:
        bare = list(ndvi["low_months"])
        bare_source = "ndvi"
    crit = [m["month"] for m in sorted(analysis_months, key=lambda x: x["vulnerability"], reverse=True)[:3]]

    local_share: dict[str, float] = {}
    if local.get("available"):
        ys = list(local["years"].values())
        for y in ys:
            for k, v in y.items():
                local_share[k] = local_share.get(k, 0) + v / len(ys)

    # Suelo real (SSURGO): componente dominante.
    sc = soil["components"][0] if soil and soil.get("available") and soil.get("components") else None
    awc = sc["awc"] if sc else None
    drainage = (sc["drainage"] or "") if sc else ""
    sandy = bool(sc and sc["sand"] is not None and sc["sand"] >= 70)
    heavy = bool(sc and sc["clay"] is not None and sc["clay"] >= 40)
    soil_factor = 1.0
    if awc is not None:
        soil_factor = 1.25 if awc < 0.12 else 0.85 if awc >= 0.18 else 1.0

    options = []
    for key, crop in CATALOG.items():
        start = _best_start(crop, months, today)
        cyc = _cycle_months(crop, start)
        v_cycle = sum(months[x]["vulnerability"] for x in cyc) / len(cyc)
        stress = v_cycle * WATER_FACTOR[crop["water"]] * (0.5 if irrigated else 1.0) * soil_factor

        score, why, risks, evidence, gaps = 60.0, [], [], [], []

        # Rotacion: evitar repetir cultivo o familia (plagas y enfermedades).
        # Las coberturas se evaluan mas abajo contra el cultivo de venta al que acompanan.
        rot_adj = 0.0
        if crop["kind"] == "cash":
            if key == last_crop:
                rot_adj -= 35
                risks.append("Repetir el mismo cultivo aumenta plagas y enfermedades.")
            elif crop["family"] == last_family:
                rot_adj -= 18
                risks.append(f"Es de la misma familia que tu último cultivo ({CATALOG[last_crop]['name'].lower()}): más plagas y enfermedades.")
            elif last_crop in CATALOG:
                rot_adj += 8
                why.append(f"Es de otra familia que tu último cultivo ({CATALOG[last_crop]['name'].lower()}): ayuda a cortar plagas.")
            if crop.get("fixes_n") and last_family == "gramineas":
                rot_adj += 8
                why.append(f"Devuelve nitrógeno al suelo después {'del' if ART.get(last_crop, 'el') == 'el' else 'de la'} {CATALOG[last_crop]['name'].lower()}.")
        score += rot_adj

        # Agua: vulnerabilidad real de NASA POWER en los meses del cultivo.
        score -= max(0.0, stress - 0.30) * 90
        n = len(cyc)
        avg = lambda k: sum(months[x][k] for x in cyc) / n
        evidence.append({
            "text": f"En sus meses de ciclo, en promedio: lluvia {_rain_text(avg('precip_mm_day'))}, temperatura {_temp_text(avg('temp_c'))}, {_soil_text(avg('soil_wetness'))} (NASA POWER, 2015–2024)",
            "kind": "real", "source": "power",
        })
        evidence.append({
            "text": f"Dificultad del clima de {MONTHS_ES[cyc[0] - 1]} a {MONTHS_ES[cyc[-1] - 1]}: {'alta' if v_cycle >= 0.6 else 'media' if v_cycle >= 0.4 else 'baja'}. La calculamos nosotros (calor, suelo seco y poca lluvia; los pesos y la duración del ciclo son supuestos)",
            "kind": "calc",
        })
        if stress > 0.5:
            risks.append("Alta demanda de agua frente al clima de estos meses" + ("" if irrigated else " y sin riego."))
        elif stress < 0.3:
            why.append("El clima de sus meses de ciclo es favorable en agua.")

        # Suelo real (SSURGO)
        if sc:
            if awc is not None and awc < 0.12 and crop["water"] != "low":
                risks.append("Tu suelo guarda poca agua y este cultivo necesita bastante: sufre más en sequía.")
                evidence.append({"text": "Tu suelo guarda poca agua (mapa de suelos USDA)", "kind": "real", "source": "ssurgo"})
            if crop["kind"] == "cover" and (sandy or heavy):
                score += 6
                why.append("Tu suelo " + ("es arenoso: la cobertura aporta materia orgánica y retiene humedad." if sandy else "es arcilloso: la cobertura mejora la infiltración."))
                evidence.append({"text": f"Textura: {sc['sand']:.0f}% arena y {sc['clay']:.0f}% arcilla (SSURGO)", "kind": "real", "source": "ssurgo"})
        else:
            gaps.append("Sin datos de suelo de SSURGO en este punto")

        # Suelo desnudo: coberturas ayudan si hay meses sin cultivo.
        if crop["kind"] == "cover":
            if bare:
                score += 14
                if bare_source == "ndvi":
                    why.append(f"Cubre el suelo en meses con poca vegetación medida por satélite ({len(bare)} en el último año).")
                    evidence.append({"text": f"Poca vegetación en {len(bare)} de los últimos 12 meses (satélite MODIS, medido; nuestro umbral de verdor)", "kind": "real", "source": "ndvi"})
                else:
                    why.append(f"Cubre el suelo en meses que hoy están sin cultivo ({len(bare)} en el último año).")
            else:
                score -= 10
                risks.append("Tu suelo ya tiene cultivo casi todo el año; la cobertura aporta menos.")

        # Cultivos de la zona (CDL): proxy de mercado y maquinaria.
        if local.get("available"):
            share = local_share.get(key, 0.0)
            if share >= 0.05:
                score += 10
                evidence.append({"text": f"Ocupa ~{share*100:.0f}% de la zona cercana (mapa de cultivos USDA, 2021–2025)", "kind": "real", "source": "cdl"})
                why.append("Ya se cultiva en la zona: hay mercado y maquinaria cercanos.")
            elif crop["kind"] == "cash":
                score -= 22 if share < 0.01 else 12
                risks.append(
                    "No se siembra en tu zona: confirma que haya comprador, contrato y maquinaria antes de sembrar."
                    if share < 0.01
                    else "Se siembra poco en tu zona: confirma comprador y maquinaria."
                )
                evidence.append({"text": f"Ocupa {share*100:.0f}% de la zona cercana (mapa de cultivos USDA, 2021–2025)", "kind": "real", "source": "cdl"})
        else:
            gaps.append("Sin datos de cultivos de la zona (CDL solo cubre EE. UU.)")

        # Economia: solo con los datos que declara el agricultor.
        econ = None
        p = prices.get(key)
        if p and p.get("yield_per_ha") is not None and p.get("price_per_unit") is not None and p.get("cost_per_ha") is not None:
            m_ha = p["yield_per_ha"] * p["price_per_unit"] - p["cost_per_ha"]
            econ = {"margin_per_ha": round(m_ha, 2), "margin_total": round(m_ha * area_ha, 2), "loss": m_ha < 0}
            if m_ha < 0:
                risks.append("Con tus números daría pérdida.")
                score -= 60
        elif p and p.get("cost_per_ha") is not None and crop["kind"] == "cover":
            econ = {"margin_per_ha": -round(p["cost_per_ha"], 2), "margin_total": -round(p["cost_per_ha"] * area_ha, 2), "loss": False, "investment": True}
        else:
            gaps.append("Falta rendimiento, precio y costo para estimar el margen")

        gaps.append("Reglas curadas: validar con extensión agrícola local")
        options.append({
            "crop": key,
            "name": crop["name"],
            "kind": crop["kind"],
            "family": crop["family"],
            "fixes_n": bool(crop.get("fixes_n")),
            "is_current": key == last_crop,
            "plant_month": start,
            "score": max(0, min(100, round(score))),
            "why": why or ["Opción compatible con tu historial y clima."],
            "risks": risks,
            "evidence": evidence,
            "gaps": gaps,
            "economics": econ,
        })

    def ok(o):
        return not (o["economics"] and o["economics"].get("loss"))

    cash = sorted([o for o in options if o["kind"] == "cash" and not o["is_current"]], key=lambda o: (not ok(o), -o["score"]))
    covers = [o for o in options if o["kind"] == "cover" and ok(o)]
    base = next((o for o in options if o["is_current"]), None)

    rotations = []
    top = cash[0]["score"] if cash else 0
    for i, c in enumerate(cash[:4]):
        cover = max((_cover_for(v, c) for v in covers), key=lambda v: v["score"], default=None)
        rotations.append({"sell": c, "cover": cover, "label": _label(i, c, top), "note": None if i == 0 else _behind(c, cash[0])})
    if base:
        base = {**base, "label": _label(1, base, top), "note": _behind(base, cash[0]) if cash else None}

    return {
        "last_crop": last_crop,
        "bare_soil_months": bare,
        "bare_source": bare_source,
        "critical_months": crit,
        "field_notes": _field_notes(sc, drainage, awc, bare, bare_source),
        "baseline": base,
        "rotations": rotations,
        "options": [r["sell"] for r in rotations],
        "covers": [],
        "today": today.isoformat(),
        "disclaimer": "Herramienta de apoyo a la decisión. Los números económicos salen solo de lo que tú declares. Valida con un experto local.",
    }


ART = {"corn": "el", "soybean": "la", "wheat": "el", "sorghum": "el", "sunflower": "el", "oats": "la", "cereal_rye": "el", "clover": "el"}


def _the(o: dict) -> str:
    return f"{ART.get(o['crop'], 'el')} {o['name'].lower()}"


def _cover_for(cover: dict, sell: dict) -> dict:
    """La cobertura se siembra despues de cosechar el cultivo de venta: se juzga contra ese cultivo."""
    c = {**cover, "why": list(cover["why"]), "risks": list(cover["risks"])}
    sell_name = _the(sell)
    if cover["family"] == sell["family"]:
        c["score"] = max(0, c["score"] - 18)
        c["risks"].insert(0, f"Es de la misma familia que {sell_name}: no corta sus plagas. Mejor otra cobertura.")
    else:
        c["score"] = min(100, c["score"] + 8)
        c["why"].insert(0, f"Es de otra familia que {sell_name}: corta sus plagas y enfermedades.")
    if cover["fixes_n"] and sell["family"] == "gramineas":
        c["score"] = min(100, c["score"] + 8)
        c["why"].insert(1, f"Devuelve al suelo nitrógeno que se llevó {sell_name}.")
    return c


def _label(rank: int, o: dict, top: int) -> str:
    if o["economics"] and o["economics"].get("loss"):
        return "Te daría pérdida con tus números"
    if rank == 0:
        return "Mejor opción"
    gap = top - o["score"]
    if gap <= 8:
        return "Casi tan buena"
    return "Más arriesgada"


def _behind(o: dict, best: dict) -> str | None:
    """Por que queda detras de la mejor, en una frase: su primer riesgo, si tiene."""
    if o["risks"]:
        return f"Queda detrás de {_the(best)} porque: {o['risks'][0][0].lower() + o['risks'][0][1:].rstrip('.')}."
    return f"Queda un poco detrás de {_the(best)}."


def _field_notes(sc, drainage, awc, bare, bare_source) -> list[dict]:
    """Hechos de tu terreno que valen para todas las opciones: se dicen una sola vez."""
    notes = []
    if sc:
        texture = "arenoso" if (sc["sand"] or 0) >= 70 else "arcilloso" if (sc["clay"] or 0) >= 40 else "limoso" if (sc["silt"] or 0) >= 50 else "franco"
        water = "guarda poca agua" if awc is not None and awc < 0.12 else "guarda bien el agua" if awc is not None and awc >= 0.18 else "guarda una cantidad media de agua"
        drain = DRAIN_ES.get(drainage, "sin dato de drenaje")
        notes.append({"text": f"Tu suelo es {texture}, {water} y {drain}", "kind": "real", "source": "ssurgo"})
        if "poorly" in drainage.lower():
            notes.append({"text": "Como se encharca, siembra cuando el suelo esté firme y evita meter maquinaria con el campo mojado", "kind": "calc"})
    if bare and bare_source == "ndvi":
        notes.append({"text": f"El satélite vio tu campo con poca vegetación en {len(bare)} meses del último año", "kind": "real", "source": "ndvi"})
    return notes


DRAIN_ES = {
    "Excessively drained": "drena en exceso",
    "Somewhat excessively drained": "drena algo en exceso",
    "Well drained": "bien drenado",
    "Moderately well drained": "drena bastante bien",
    "Somewhat poorly drained": "drena algo mal",
    "Poorly drained": "drena mal (se encharca)",
    "Very poorly drained": "drena muy mal (se encharca)",
}
