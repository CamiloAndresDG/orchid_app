"""Motor de reglas: opciones para el proximo cultivo segun historial, clima real y cultivos de la zona."""
from datetime import date

from .crops import CATALOG, crop_name
from .i18n import lang, t

MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


def _month(m: int) -> str:
    return (MONTHS_EN if lang() == "en" else MONTHS_ES)[m - 1]


def _rain_text(mm_day: float) -> str:
    """Lluvia del mes en pulgadas (con mm al lado): promedio diario x 30.4 dias."""
    inches = mm_day * 30.4 / 25.4
    return t(f"{inches:.1f} pulgadas al mes ({mm_day * 30.4:.0f} mm)", f"{inches:.1f} inches a month ({mm_day * 30.4:.0f} mm)")


def _temp_text(c: float) -> str:
    return f"{c * 9 / 5 + 32:.0f} °F ({c:.0f} °C)"


def _soil_text(w: float) -> str:
    if w < 0.35:
        return t("suelo seco", "dry soil")
    if w < 0.55:
        return t("humedad media del suelo", "medium soil moisture")
    return t("suelo húmedo", "moist soil")


WATER_FACTOR = {"low": 0.6, "med": 1.0, "high": 1.4}

# Reglas de puntuación de Orchid. Son supuestos nuestros, no datos: todavía no los validó un agrónomo de la zona.
# Se usan en build_options y se muestran tal cual en el informe (method_rules), así nunca se desincronizan.
RULES = {
    "base": 60,                  # puntaje de partida de cada cultivo
    "repeat_crop": -35,          # repetir el último cultivo
    "same_family": -18,          # misma familia botánica que el último cultivo
    "other_family": 8,           # otra familia: corta plagas
    "legume_after_grass": 8,     # leguminosa después de una gramínea: devuelve nitrógeno
    "stress_free": 0.30,         # estrés hídrico tolerado sin castigo
    "stress_weight": 90,         # castigo por cada punto de estrés por encima de lo tolerado
    "cover_texture": 6,          # cobertura en suelo arenoso o arcilloso
    "cover_bare": 14,            # cobertura cuando hay meses de suelo desnudo
    "cover_no_bare": -10,        # cobertura cuando el suelo ya está cubierto casi todo el año
    "cover_slope": 8,            # cobertura en pendiente de 5% o más
    "cover_slope_min": 5,        # % de pendiente desde el que se favorecen las coberturas
    "cash_slope_risk": 10,       # % de pendiente desde el que se avisa erosión a los cultivos de venta
    "dry_soil_risk": -20,        # % de agua del suelo frente a lo normal desde el que se avisa a cultivos sedientos
    "local_share_min": 0.05,     # fracción de la zona desde la que un cultivo "ya se siembra aquí"
    "local_grown": 10,           # ya se siembra en la zona: hay mercado y maquinaria
    "local_absent": -22,         # no se siembra en la zona (menos del 1%)
    "local_rare": -12,           # se siembra poco en la zona
    "loss": -60,                 # con los números del agricultor daría pérdida
    "close_gap": 8,              # diferencia de puntos para llamarla "Casi tan buena"
}


def method_rules() -> list[str]:
    """Las reglas de puntuación en palabras, con los mismos números que usa el cálculo."""
    r = RULES
    w = WATER_FACTOR
    if lang() == "en":
        return [
            f"Each crop starts at {r['base']} points.",
            f"Repeating the last crop subtracts {abs(r['repeat_crop'])}; repeating its botanical family subtracts {abs(r['same_family'])}; switching family adds {r['other_family']}.",
            f"A legume (soybeans, clover) after a grass (corn, wheat, sorghum, oats, rye) adds {r['legume_after_grass']} for the nitrogen it returns.",
            "Water stress = how hard the weather is in the crop's cycle months (NASA POWER) × how much water the crop needs "
            f"(low {w['low']}, medium {w['med']}, high {w['high']}) × 0.5 if irrigated × an adjustment for how much water the soil holds (SSURGO). "
            f"Above {r['stress_free']:.2f} it subtracts {r['stress_weight']} points per unit of stress.",
            f"A cover crop adds {r['cover_bare']} if there were months of bare soil (measured by MODIS or from your history) and subtracts {abs(r['cover_no_bare'])} if the soil is already covered most of the year.",
            f"A cover crop adds {r['cover_texture']} on sandy or clayey soil and {r['cover_slope']} if the slope is {r['cover_slope_min']}% or more (SRTM).",
            f"If a crop covers at least {r['local_share_min']:.0%} of the area (CDL) it adds {r['local_grown']}; if it's hardly planted it subtracts {abs(r['local_absent'])}, and if it's planted little it subtracts {abs(r['local_rare'])}. "
            "Corn, soybeans and wheat are recognized on that map with verified colors; sorghum and sunflower with legend colors we haven't verified yet.",
            f"With your prices, an option that would lose money subtracts {abs(r['loss'])}.",
            f"From {r['cash_slope_risk']}% slope we warn about erosion risk, and if the soil holds {abs(r['dry_soil_risk'])}% less water than normal (NLDAS) we warn the thirsty crops; these warnings don't change the score.",
            f"The highest score is the “Best option”; those within {r['close_gap']} points are “Almost as good”.",
            "Planting months, cycle length and how much water each crop needs come from our own table of 8 crops.",
        ]
    return [
        f"Cada cultivo parte de {r['base']} puntos.",
        f"Repetir el último cultivo resta {abs(r['repeat_crop'])}; repetir su familia botánica resta {abs(r['same_family'])}; cambiar de familia suma {r['other_family']}.",
        f"Una leguminosa (soja, trébol) después de una gramínea (maíz, trigo, sorgo, avena, centeno) suma {r['legume_after_grass']} por el nitrógeno que devuelve.",
        "Estrés hídrico = dificultad del clima en los meses del ciclo (NASA POWER) × lo que pide de agua el cultivo "
        f"(poca {w['low']}, media {w['med']}, mucha {w['high']}) × 0.5 si hay riego × un ajuste por el agua que guarda el suelo (SSURGO). "
        f"Por encima de {r['stress_free']:.2f} resta {r['stress_weight']} puntos por cada unidad de estrés.",
        f"Una cobertura suma {r['cover_bare']} si hubo meses con suelo desnudo (medidos por MODIS o según tu historial) y resta {abs(r['cover_no_bare'])} si el suelo ya está cubierto casi todo el año.",
        f"Una cobertura suma {r['cover_texture']} en suelo arenoso o arcilloso y {r['cover_slope']} si la pendiente es de {r['cover_slope_min']}% o más (SRTM).",
        f"Si un cultivo ocupa al menos {r['local_share_min']:.0%} de la zona (CDL) suma {r['local_grown']}; si casi no se siembra resta {abs(r['local_absent'])}, y si se siembra poco resta {abs(r['local_rare'])}. "
        "Maíz, soja y trigo se reconocen en ese mapa con colores verificados; sorgo y girasol, con colores de la leyenda que aún no verificamos.",
        f"Con tus precios, una opción que daría pérdida resta {abs(r['loss'])}.",
        f"Desde {r['cash_slope_risk']}% de pendiente se avisa riesgo de erosión, y si el suelo guarda {abs(r['dry_soil_risk'])}% menos agua que lo normal (NLDAS) se avisa a los cultivos que piden mucha agua; estos avisos no cambian el puntaje.",
        f"La de más puntos es la «Mejor opción»; las que quedan a {r['close_gap']} puntos o menos son «Casi tan buena».",
        "Los meses de siembra, la duración del ciclo y cuánta agua pide cada cultivo salen de una tabla nuestra de 8 cultivos.",
    ]


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
                  local: dict, area_ha: float, today: date | None = None, soil: dict | None = None, ndvi: dict | None = None,
                  terrain: dict | None = None, water: dict | None = None, moisture: dict | None = None) -> dict:
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
    # Fuentes de NASA Earthdata: pendiente (SRTM) y agua guardada en el suelo frente a lo normal (NLDAS).
    slope = terrain["slope_pct"] if terrain and terrain.get("available") else None
    soil_anom = water.get("soil_anomaly_pct") if water and water.get("available") else None
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

        score, why, risks, evidence, gaps = float(RULES["base"]), [], [], [], []

        # Rotacion: evitar repetir cultivo o familia (plagas y enfermedades).
        # Las coberturas se evaluan mas abajo contra el cultivo de venta al que acompanan.
        rot_adj = 0.0
        if crop["kind"] == "cash":
            if key == last_crop:
                rot_adj += RULES["repeat_crop"]
                risks.append(t("Repetir el mismo cultivo aumenta plagas y enfermedades.", "Planting the same crop again increases pests and diseases."))
            elif crop["family"] == last_family:
                rot_adj += RULES["same_family"]
                lc = crop_name(last_crop).lower()
                risks.append(t(f"Es de la misma familia que tu último cultivo ({lc}): más plagas y enfermedades.",
                               f"It's in the same family as your last crop ({lc}): more pests and diseases."))
            elif last_crop in CATALOG:
                rot_adj += RULES["other_family"]
                lc = crop_name(last_crop).lower()
                why.append(t(f"Es de otra familia que tu último cultivo ({lc}): ayuda a cortar plagas.",
                             f"It's in a different family from your last crop ({lc}): it helps break pest cycles."))
            if crop.get("fixes_n") and last_family == "gramineas":
                rot_adj += RULES["legume_after_grass"]
                lc = crop_name(last_crop).lower()
                why.append(t(f"Devuelve nitrógeno al suelo después {'del' if ART.get(last_crop, 'el') == 'el' else 'de la'} {lc}.",
                             f"It returns nitrogen to the soil after the {lc}."))
        score += rot_adj

        # Agua: vulnerabilidad real de NASA POWER en los meses del cultivo.
        score -= max(0.0, stress - RULES["stress_free"]) * RULES["stress_weight"]
        n = len(cyc)
        avg = lambda k: sum(months[x][k] for x in cyc) / n
        evidence.append({
            "text": t(f"En sus meses de ciclo, en promedio: lluvia {_rain_text(avg('precip_mm_day'))}, temperatura {_temp_text(avg('temp_c'))}, {_soil_text(avg('soil_wetness'))} (NASA POWER, 2015–2024)",
                      f"Over its cycle months, on average: rain {_rain_text(avg('precip_mm_day'))}, temperature {_temp_text(avg('temp_c'))}, {_soil_text(avg('soil_wetness'))} (NASA POWER, 2015–2024)"),
            "kind": "real", "source": "power",
        })
        evidence.append({
            "text": t(f"Dificultad del clima de {_month(cyc[0])} a {_month(cyc[-1])}: {'alta' if v_cycle >= 0.6 else 'media' if v_cycle >= 0.4 else 'baja'}. La calculamos nosotros (calor, suelo seco y poca lluvia; los pesos y la duración del ciclo son supuestos)",
                      f"How hard the weather is from {_month(cyc[0])} to {_month(cyc[-1])}: {'high' if v_cycle >= 0.6 else 'medium' if v_cycle >= 0.4 else 'low'}. We calculate it ourselves (heat, dry soil and little rain; the weights and cycle length are assumptions)"),
            "kind": "calc",
        })
        if stress > 0.5:
            risks.append(t("Alta demanda de agua frente al clima de estos meses", "High water demand for the weather in these months")
                         + ("" if irrigated else t(" y sin riego.", " and no irrigation.")))
        elif stress < 0.3:
            why.append(t("El clima de sus meses de ciclo es favorable en agua.", "The weather in its cycle months is favorable for water."))

        # Suelo real (SSURGO)
        if sc:
            if awc is not None and awc < 0.12 and crop["water"] != "low":
                risks.append(t("Tu suelo guarda poca agua y este cultivo necesita bastante: sufre más en sequía.",
                               "Your soil holds little water and this crop needs a lot: it suffers more in drought."))
                evidence.append({"text": t("Tu suelo guarda poca agua (mapa de suelos USDA)", "Your soil holds little water (USDA soil map)"), "kind": "real", "source": "ssurgo"})
            if crop["kind"] == "cover" and (sandy or heavy):
                score += RULES["cover_texture"]
                if sandy:
                    why.append(t("Tu suelo es arenoso: la cobertura aporta materia orgánica y retiene humedad.",
                                 "Your soil is sandy: the cover crop adds organic matter and holds moisture."))
                else:
                    why.append(t("Tu suelo es arcilloso: la cobertura mejora la infiltración.", "Your soil is clayey: the cover crop improves infiltration."))
                evidence.append({"text": t(f"Textura: {sc['sand']:.0f}% arena y {sc['clay']:.0f}% arcilla (SSURGO)",
                                           f"Texture: {sc['sand']:.0f}% sand and {sc['clay']:.0f}% clay (SSURGO)"), "kind": "real", "source": "ssurgo"})
        else:
            gaps.append(t("Sin datos de suelo de SSURGO en este punto", "No SSURGO soil data at this point"))

        # Suelo desnudo: coberturas ayudan si hay meses sin cultivo.
        if crop["kind"] == "cover":
            if bare:
                score += RULES["cover_bare"]
                if bare_source == "ndvi":
                    why.append(t(f"Cubre el suelo en meses con poca vegetación medida por satélite ({len(bare)} en el último año).",
                                 f"It covers the soil in months with little vegetation measured by satellite ({len(bare)} in the last year)."))
                    evidence.append({"text": t(f"Poca vegetación en {len(bare)} de los últimos 12 meses (satélite MODIS, medido; nuestro umbral de verdor)",
                                               f"Little vegetation in {len(bare)} of the last 12 months (MODIS satellite, measured; our greenness cutoff)"), "kind": "real", "source": "ndvi"})
                else:
                    why.append(t(f"Cubre el suelo en meses que hoy están sin cultivo ({len(bare)} en el último año).",
                                 f"It covers the soil in months that are bare today ({len(bare)} in the last year)."))
            else:
                score += RULES["cover_no_bare"]
                risks.append(t("Tu suelo ya tiene cultivo casi todo el año; la cobertura aporta menos.",
                               "Your soil already has a crop most of the year; a cover crop adds less."))

        # Pendiente real (SRTM): en terrenos inclinados el suelo desnudo se lava con la lluvia.
        if slope is not None:
            slope_ev = {"text": t(f"Pendiente promedio de {slope:.1f}% alrededor de tu punto (relieve SRTM de la NASA)",
                                  f"Average slope of {slope:.1f}% around your point (NASA SRTM terrain)"), "kind": "real", "source": "srtm"}
            if crop["kind"] == "cover" and slope >= RULES["cover_slope_min"]:
                score += RULES["cover_slope"]
                why.append(t(f"Tu terreno tiene pendiente ({slope:.1f}%): la cobertura frena la erosión cuando llueve fuerte.",
                             f"Your field is sloped ({slope:.1f}%): the cover crop slows erosion in heavy rain."))
                evidence.append(slope_ev)
            elif crop["kind"] == "cash" and slope >= RULES["cash_slope_risk"]:
                risks.append(t(f"Con {slope:.1f}% de pendiente, el suelo desnudo entre cosecha y siembra se erosiona: deja rastrojo o una cobertura.",
                               f"With a {slope:.1f}% slope, bare soil between harvest and planting erodes: leave residue or a cover crop."))
                evidence.append(slope_ev)

        # Agua guardada en el suelo hoy (NLDAS): si está muy por debajo de lo normal, los cultivos sedientos arrancan en desventaja.
        if soil_anom is not None and soil_anom <= RULES["dry_soil_risk"] and crop["kind"] == "cash" and crop["water"] == "high" and not irrigated:
            risks.append(t(f"Hoy tu suelo guarda {abs(soil_anom)}% menos agua que lo normal para esta época: arrancaría con poca reserva.",
                           f"Your soil holds {abs(soil_anom)}% less water than normal for this time of year: it would start with a low reserve."))
            evidence.append({"text": t(f"Humedad del suelo hasta 1 m en {water['latest_month']}: {abs(soil_anom)}% por debajo de su promedio de 10 años (modelo NLDAS de la NASA)",
                                       f"Soil moisture down to 1 m in {water['latest_month']}: {abs(soil_anom)}% below its 10-year average (NASA NLDAS model)"), "kind": "real", "source": "nldas"})

        # Cultivos de la zona (CDL): proxy de mercado y maquinaria.
        if local.get("available"):
            share = local_share.get(key, 0.0)
            if share >= RULES["local_share_min"]:
                score += RULES["local_grown"]
                evidence.append({"text": t(f"Ocupa ~{share*100:.0f}% de la zona cercana (mapa de cultivos USDA, 2021–2025)",
                                           f"Covers ~{share*100:.0f}% of the nearby area (USDA crop map, 2021–2025)"), "kind": "real", "source": "cdl"})
                why.append(t("Ya se cultiva en la zona: hay mercado y maquinaria cercanos.", "It's already grown in the area: there are buyers and machinery nearby."))
            elif crop["kind"] == "cash":
                score += RULES["local_absent"] if share < 0.01 else RULES["local_rare"]
                risks.append(
                    t("No se siembra en tu zona: confirma que haya comprador, contrato y maquinaria antes de sembrar.",
                      "It isn't planted in your area: make sure there's a buyer, a contract and machinery before planting.")
                    if share < 0.01
                    else t("Se siembra poco en tu zona: confirma comprador y maquinaria.", "Little of it is planted in your area: check for a buyer and machinery.")
                )
                evidence.append({"text": t(f"Ocupa {share*100:.0f}% de la zona cercana (mapa de cultivos USDA, 2021–2025)",
                                           f"Covers {share*100:.0f}% of the nearby area (USDA crop map, 2021–2025)"), "kind": "real", "source": "cdl"})
        else:
            gaps.append(t("Sin datos de cultivos de la zona (CDL solo cubre EE. UU.)", "No data on crops in the area (CDL only covers the U.S.)"))

        # Economia: solo con los datos que declara el agricultor.
        econ = None
        p = prices.get(key)
        if p and p.get("yield_per_ha") is not None and p.get("price_per_unit") is not None and p.get("cost_per_ha") is not None:
            m_ha = p["yield_per_ha"] * p["price_per_unit"] - p["cost_per_ha"]
            econ = {"margin_per_ha": round(m_ha, 2), "margin_total": round(m_ha * area_ha, 2), "loss": m_ha < 0}
            if m_ha < 0:
                risks.append(t("Con tus números daría pérdida.", "With your numbers it would lose money."))
                score += RULES["loss"]
        elif p and p.get("cost_per_ha") is not None and crop["kind"] == "cover":
            econ = {"margin_per_ha": -round(p["cost_per_ha"], 2), "margin_total": -round(p["cost_per_ha"] * area_ha, 2), "loss": False, "investment": True}
        else:
            gaps.append(t("Falta rendimiento, precio y costo para estimar el margen", "Yield, price and cost are missing to estimate the margin"))

        gaps.append(t("Reglas curadas: validar con extensión agrícola local", "Curated rules: check with your local extension office"))
        options.append({
            "crop": key,
            "name": crop_name(key),
            "kind": crop["kind"],
            "family": crop["family"],
            "fixes_n": bool(crop.get("fixes_n")),
            "is_current": key == last_crop,
            "plant_month": start,
            "score": max(0, min(100, round(score))),
            "why": why or [t("Opción compatible con tu historial y clima.", "An option that fits your history and climate.")],
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
        "field_notes": _field_notes(sc, drainage, awc, bare, bare_source, terrain, water, moisture),
        "baseline": base,
        "rotations": rotations,
        "options": [r["sell"] for r in rotations],
        "covers": [],
        "today": today.isoformat(),
        "method": method_rules(),
        "disclaimer": t("Herramienta de apoyo a la decisión. Los números económicos salen solo de lo que tú declares. Valida con un experto local.",
                        "Decision-support tool. The economic figures come only from what you enter. Check with a local expert."),
    }


ART = {"corn": "el", "soybean": "la", "wheat": "el", "sorghum": "el", "sunflower": "el", "oats": "la", "cereal_rye": "el", "clover": "el"}


def _the(o: dict) -> str:
    return t(f"{ART.get(o['crop'], 'el')} {o['name'].lower()}", f"the {o['name'].lower()}")


def _cover_for(cover: dict, sell: dict) -> dict:
    """La cobertura se siembra despues de cosechar el cultivo de venta: se juzga contra ese cultivo."""
    c = {**cover, "why": list(cover["why"]), "risks": list(cover["risks"])}
    sell_name = _the(sell)
    if cover["family"] == sell["family"]:
        c["score"] = max(0, c["score"] - 18)
        c["risks"].insert(0, t(f"Es de la misma familia que {sell_name}: no corta sus plagas. Mejor otra cobertura.",
                               f"It's in the same family as {sell_name}: it doesn't break its pests. Better pick another cover crop."))
    else:
        c["score"] = min(100, c["score"] + 8)
        c["why"].insert(0, t(f"Es de otra familia que {sell_name}: corta sus plagas y enfermedades.",
                             f"It's in a different family from {sell_name}: it breaks its pests and diseases."))
    if cover["fixes_n"] and sell["family"] == "gramineas":
        c["score"] = min(100, c["score"] + 8)
        c["why"].insert(1, t(f"Devuelve al suelo nitrógeno que se llevó {sell_name}.", f"It returns to the soil the nitrogen that {sell_name} took."))
    return c


def _label(rank: int, o: dict, top: int) -> str:
    if o["economics"] and o["economics"].get("loss"):
        return t("Te daría pérdida con tus números", "Would lose money with your numbers")
    if rank == 0:
        return t("Mejor opción", "Best option")
    gap = top - o["score"]
    if gap <= RULES["close_gap"]:
        return t("Casi tan buena", "Almost as good")
    return t("Más arriesgada", "Riskier")


def _behind(o: dict, best: dict) -> str | None:
    """Por que queda detras de la mejor, en una frase: su primer riesgo, si tiene."""
    if o["risks"]:
        reason = o['risks'][0][0].lower() + o['risks'][0][1:].rstrip('.')
        return t(f"Queda detrás de {_the(best)} porque: {reason}.", f"It ranks behind {_the(best)} because: {reason}.")
    return t(f"Queda un poco detrás de {_the(best)}.", f"It ranks slightly behind {_the(best)}.")


def _field_notes(sc, drainage, awc, bare, bare_source, terrain=None, water_bal=None, moisture=None) -> list[dict]:
    """Hechos de tu terreno que valen para todas las opciones: se dicen una sola vez."""
    notes = []
    if sc:
        sand, clay, silt = (sc["sand"] or 0) >= 70, (sc["clay"] or 0) >= 40, (sc["silt"] or 0) >= 50
        texture = t("arenoso" if sand else "arcilloso" if clay else "limoso" if silt else "franco",
                    "sandy" if sand else "clayey" if clay else "silty" if silt else "loamy")
        low, good = awc is not None and awc < 0.12, awc is not None and awc >= 0.18
        water = t("guarda poca agua" if low else "guarda bien el agua" if good else "guarda una cantidad media de agua",
                  "holds little water" if low else "holds water well" if good else "holds a medium amount of water")
        drain = t(DRAIN_ES.get(drainage, "sin dato de drenaje"), DRAIN_EN.get(drainage, "no drainage data"))
        notes.append({"text": t(f"Tu suelo es {texture}, {water} y {drain}", f"Your soil is {texture}, {water} and {drain}"), "kind": "real", "source": "ssurgo"})
        if "poorly" in drainage.lower():
            notes.append({"text": t("Como se encharca, siembra cuando el suelo esté firme y evita meter maquinaria con el campo mojado",
                                    "Since it waterlogs, plant when the soil is firm and keep machinery off the wet field"), "kind": "calc"})
    if bare and bare_source == "ndvi":
        n = len(bare)
        notes.append({"text": t(f"El satélite vio tu campo con poca vegetación en {n} {'mes' if n == 1 else 'meses'} del último año",
                                f"The satellite saw little vegetation on your field in {n} {'month' if n == 1 else 'months'} of the last year"), "kind": "real", "source": "ndvi"})
    if terrain and terrain.get("available"):
        notes.append({"text": t(f"Tu terreno es {terrain['slope_word']} ({terrain['slope_pct']:.1f}% de pendiente) y está a {terrain['elevation_ft']} pies "
                                f"({terrain['elevation_m']} m) sobre el nivel del mar",
                                f"Your field is {terrain['slope_word']} ({terrain['slope_pct']:.1f}% slope) and sits {terrain['elevation_ft']} feet "
                                f"({terrain['elevation_m']} m) above sea level"), "kind": "real", "source": "srtm"})
        if terrain["slope_pct"] >= 5:
            notes.append({"text": t("Con esa pendiente, siembra siguiendo las curvas de nivel y no dejes el suelo desnudo en invierno",
                                    "On that slope, plant along the contour and don't leave the soil bare over winter"), "kind": "calc"})
    if moisture and moisture.get("available") and moisture.get("latest"):
        m = moisture["latest"]
        notes.append({"text": t(f"El satélite midió la superficie de tu suelo {m['word']} ({m['percent']}% de agua) el {_date(m['date'])}",
                                f"The satellite measured your soil surface as {m['word']} ({m['percent']}% water) on {_date(m['date'])}"),
                      "kind": "real", "source": "smap"})
    if water_bal and water_bal.get("available") and water_bal.get("soil_anomaly_pct") is not None:
        a = water_bal["soil_anomaly_pct"]
        mon = _month_year(water_bal["latest_month"])
        if abs(a) >= 10:
            notes.append({"text": t(f"En {mon} tu suelo guardaba {abs(a)}% {'más' if a > 0 else 'menos'} agua que lo normal hasta 1 metro de profundidad",
                                    f"In {mon} your soil held {abs(a)}% {'more' if a > 0 else 'less'} water than normal down to 1 meter"),
                          "kind": "real", "source": "nldas"})
        else:
            notes.append({"text": t(f"En {mon} tu suelo guardaba una cantidad de agua normal hasta 1 metro de profundidad",
                                    f"In {mon} your soil held a normal amount of water down to 1 meter"),
                          "kind": "real", "source": "nldas"})
    return notes


def _date(iso: str) -> str:
    y, m, d = (int(x) for x in iso.split("-"))
    return t(f"{d} de {_month(m)}", f"{_month(m)} {d}")


def _month_year(ym: str) -> str:
    y, m = ym.split("-")
    return t(f"{_month(int(m))} de {y}", f"{_month(int(m))} {y}")


DRAIN_ES = {
    "Excessively drained": "drena en exceso",
    "Somewhat excessively drained": "drena algo en exceso",
    "Well drained": "bien drenado",
    "Moderately well drained": "drena bastante bien",
    "Somewhat poorly drained": "drena algo mal",
    "Poorly drained": "drena mal (se encharca)",
    "Very poorly drained": "drena muy mal (se encharca)",
}

DRAIN_EN = {
    "Excessively drained": "is excessively drained",
    "Somewhat excessively drained": "is somewhat excessively drained",
    "Well drained": "is well drained",
    "Moderately well drained": "is moderately well drained",
    "Somewhat poorly drained": "is somewhat poorly drained",
    "Poorly drained": "is poorly drained (waterlogs)",
    "Very poorly drained": "is very poorly drained (waterlogs)",
}
