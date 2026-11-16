"""Rotation rules engine (MVP).

Hand-written table for the two example zones: each strategy states benefits, evidence,
gaps and risks, as the challenge requires (support the farmer's judgment, not replace it).
"evidence" names the kind of data backing each point; they aren't queries run for the example.
None of this has been validated by local agricultural extension yet (K-State, Iowa State).
"""
from .i18n import lang

STRATEGIES = {
    "ks-sumner": [
        {
            "id": "current",
            "name": "Trigo y barbecho (actual)",
            "sequence": ["wheat", "fallow"],
            "is_current": True,
            "benefits": ["Guarda humedad para el siguiente trigo", "Bajo costo de insumos"],
            "risks": ["Suelo sin cubrir muchos meses", "Erosión por viento y poca infiltración del agua", "No corta los ciclos de malezas y plagas"],
            "evidence": ["Poca vegetación en el barbecho (NDVI)", "Humedad del suelo (SMAP)"],
            "gaps": ["Costos reales de tu finca"],
        },
        {
            "id": "wheat-sorghum-fallow",
            "name": "Trigo, sorgo y barbecho",
            "sequence": ["wheat", "sorghum", "fallow"],
            "is_current": False,
            "benefits": ["Corta ciclos de plagas y malezas", "Necesita menos agua que el maíz", "Ingreso extra por el sorgo"],
            "risks": ["Riesgo de sequía durante el establecimiento del sorgo", "Necesita maquinaria y comprador"],
            "evidence": ["Precipitación (NASA POWER)"],
            "gaps": ["Precio local del sorgo", "Si hay contratos disponibles", "Que la extensión agrícola de Kansas (K-State) confirme la rotación para tu zona"],
        },
        {
            "id": "wheat-cover-soy",
            "name": "Trigo, cobertura y soja",
            "sequence": ["wheat", "cover_crop", "soybean"],
            "is_current": False,
            "benefits": ["Elimina el barbecho sin cubrir", "Mejora la infiltración y la materia orgánica", "Fija nitrógeno"],
            "risks": ["La cobertura gasta agua en años secos", "Costo de semilla y manejo"],
            "evidence": ["Vegetación en los meses sin cobertura (NDVI)", "Textura del suelo (SSURGO)"],
            "gaps": ["Mejor fecha para terminar la cobertura según la lluvia del año"],
        },
    ],
    "ia-story": [
        {
            "id": "current",
            "name": "Maíz y soja (actual)",
            "sequence": ["corn", "soybean"],
            "is_current": True,
            "benefits": ["Sistema conocido y rentable", "Maquinaria y mercado ya disponibles"],
            "risks": ["Invierno sin cobertura", "Pérdida de nitrógeno con la escorrentía", "Más plagas por repetir cultivos"],
            "evidence": ["Poca vegetación en invierno (NDVI)", "Lluvia por satélite (IMERG)"],
            "gaps": ["Pérdidas reales de nitrógeno en tu campo"],
        },
        {
            "id": "corn-soy-oats",
            "name": "Maíz, soja y avena con trébol",
            "sequence": ["corn", "soybean", "oats_clover"],
            "is_current": False,
            "benefits": ["Corta ciclos de plagas", "Reduce el fertilizante nitrogenado", "Ingreso extra por avena y paja"],
            "risks": ["Menos ganancia que el maíz en años de buen precio", "Hay que planificar la siembra"],
            "evidence": ["Vegetación (NDVI) y humedad del suelo"],
            "gaps": ["Precios locales de la avena", "Que la extensión agrícola de Iowa (Iowa State) confirme la rotación para tu zona"],
        },
        {
            "id": "corn-rye-soy",
            "name": "Maíz, centeno de cobertura y soja",
            "sequence": ["corn", "cereal_rye", "soybean"],
            "is_current": False,
            "benefits": ["Cubre el suelo en invierno", "Mejora la infiltración y reduce la erosión", "Retiene el nitrógeno"],
            "risks": ["Puede retrasar la siembra de la soja", "Costo de semilla"],
            "evidence": ["Vegetación en invierno (NDVI)", "Drenaje del suelo (SSURGO)"],
            "gaps": ["Fecha para terminar la cobertura según el clima"],
        },
    ],
}


# The same texts in English, in the same order.
STRATEGIES_EN = {
    "ks-sumner": [
        {
            "name": "Wheat and fallow (current)",
            "benefits": ["Saves moisture for the next wheat crop", "Low input cost"],
            "risks": ["Soil left bare for many months", "Wind erosion and poor water infiltration", "Doesn't break weed and pest cycles"],
            "evidence": ["Little vegetation during fallow (NDVI)", "Soil moisture (SMAP)"],
            "gaps": ["Your farm's real costs"],
        },
        {
            "name": "Wheat, sorghum and fallow",
            "benefits": ["Breaks pest and weed cycles", "Needs less water than corn", "Extra income from sorghum"],
            "risks": ["Drought risk while sorghum establishes", "Needs machinery and a buyer"],
            "evidence": ["Precipitation (NASA POWER)"],
            "gaps": ["Local sorghum price", "Whether contracts are available", "Confirmation from Kansas extension (K-State) that the rotation fits your area"],
        },
        {
            "name": "Wheat, cover crop and soybeans",
            "benefits": ["Ends bare fallow", "Improves infiltration and organic matter", "Fixes nitrogen"],
            "risks": ["The cover crop uses water in dry years", "Seed and management cost"],
            "evidence": ["Vegetation in months without cover (NDVI)", "Soil texture (SSURGO)"],
            "gaps": ["Best date to terminate the cover crop given the year's rain"],
        },
    ],
    "ia-story": [
        {
            "name": "Corn and soybeans (current)",
            "benefits": ["Well-known, profitable system", "Machinery and markets already in place"],
            "risks": ["Winter without cover", "Nitrogen loss with runoff", "More pests from repeating crops"],
            "evidence": ["Little vegetation in winter (NDVI)", "Satellite rainfall (IMERG)"],
            "gaps": ["Real nitrogen losses on your field"],
        },
        {
            "name": "Corn, soybeans and oats with clover",
            "benefits": ["Breaks pest cycles", "Reduces nitrogen fertilizer", "Extra income from oats and straw"],
            "risks": ["Less profit than corn in good-price years", "Planting needs planning"],
            "evidence": ["Vegetation (NDVI) and soil moisture"],
            "gaps": ["Local oat prices", "Confirmation from Iowa extension (Iowa State) that the rotation fits your area"],
        },
        {
            "name": "Corn, cereal rye cover and soybeans",
            "benefits": ["Covers the soil in winter", "Improves infiltration and reduces erosion", "Holds on to nitrogen"],
            "risks": ["It can delay soybean planting", "Seed cost"],
            "evidence": ["Vegetation in winter (NDVI)", "Soil drainage (SSURGO)"],
            "gaps": ["Date to terminate the cover crop given the weather"],
        },
    ],
}


def strategies_for(zone_id: str):
    base = STRATEGIES.get(zone_id, [])
    if lang() != "en":
        return base
    return [{**s, **en} for s, en in zip(base, STRATEGIES_EN.get(zone_id, []))]
