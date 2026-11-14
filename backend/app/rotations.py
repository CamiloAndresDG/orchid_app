"""Motor de reglas de rotacion (MVP).

Tabla curada: cada estrategia declara beneficios, evidencia, vacios y riesgos,
como exige el reto (apoyar el criterio del agricultor, no reemplazarlo).
Las cifras cualitativas deben validarse con extension services locales
(K-State Research and Extension, Iowa State Extension) antes de la demo final.
"""

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
            "evidence": ["Precipitación (NASA POWER)", "Rotaciones documentadas por K-State"],
            "gaps": ["Precio local del sorgo", "Si hay contratos disponibles"],
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
            "evidence": ["Rotaciones largas de Iowa State", "Vegetación (NDVI) y humedad del suelo"],
            "gaps": ["Precios locales de la avena"],
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


def strategies_for(zone_id: str):
    return STRATEGIES.get(zone_id, [])
