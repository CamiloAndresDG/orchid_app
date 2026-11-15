"""Traduce al inglés los textos fijos que devuelven las fuentes (notas, palabras de clase).

Las fuentes guardan sus respuestas en caché en disco, en español. En vez de duplicar cada caché por idioma,
la respuesta se traduce al salir, solo si la petición pidió inglés. Lo que no está en estas tablas se deja igual.
"""
import re

from .i18n import lang

EXACT = {
    # NASA Earthdata
    "Falta configurar el token de NASA Earthdata en el servidor.": "The NASA Earthdata token isn't configured on the server.",
    "NASA Earthdata rechazó el token: puede haber vencido (dura 60 días) o falta autorizar el centro de datos en tu cuenta de Earthdata.":
        "NASA Earthdata rejected the token: it may have expired (it lasts 60 days) or the data center isn't authorized in the Earthdata account.",
    "SMAP no cubre esta latitud.": "SMAP doesn't cover this latitude.",
    "Humedad de los primeros ~5 cm del suelo en una celda de 9 km. SMAP pasa por cada lugar cada 2 o 3 días y no mide con suelo helado o nieve; esos días quedan sin dato.":
        "Moisture in the top ~5 cm of soil in a 9 km cell. SMAP passes over each place every 2 or 3 days and doesn't measure frozen or snow-covered soil; those days have no data.",
    "SMAP no tiene medidas recientes para este punto (suelo helado, nieve, agua o días sin pasada).":
        "SMAP has no recent readings for this point (frozen soil, snow, water or days without a pass).",
    "IMERG solo cubre entre 60° norte y 60° sur.": "IMERG only covers between 60° north and 60° south.",
    "Lluvia estimada por satélite en una celda de unos 10 km; la versión «Late» sale con 1 o 2 días de retraso.":
        "Satellite-estimated rain in a cell of about 10 km; the “Late” version comes out 1 or 2 days behind.",
    "NLDAS solo cubre los 48 estados contiguos de EE. UU.": "NLDAS only covers the 48 contiguous U.S. states.",
    "NLDAS no tiene datos en este punto (agua o fuera de tierra).": "NLDAS has no data at this point (water or off land).",
    "Modelo de superficie terrestre (no una medición directa) en una celda de unos 12 km. kg/m² equivale a milímetros de agua.":
        "Land surface model (not a direct measurement) in a cell of about 12 km. kg/m² equals millimeters of water.",
    "SRTM solo cubre entre 60° norte y 56° sur.": "SRTM only covers between 60° north and 56° south.",
    "SRTM no tiene datos aquí (agua o fuera de tierra).": "SRTM has no data here (water or off land).",
    "SRTM tiene un vacío de datos justo en este punto.": "SRTM has a data gap right at this point.",
    "Pendiente promedio en unos 270 m alrededor del punto, calculada con el modelo de elevación SRTM (año 2000, píxeles de ~30 m).":
        "Average slope within about 270 m of the point, calculated with the SRTM elevation model (year 2000, ~30 m pixels).",
    "m³ de agua por m³ de suelo": "m³ of water per m³ of soil",
    # FAO GAEZ
    "Idoneidad 0-10000 (clases GAEZ). Rendimiento alcanzable en kg de materia seca por hectarea salvo que se indique otra unidad. Riego: el mejor sistema disponible.":
        "Suitability 0-10000 (GAEZ classes). Attainable yield in kg of dry matter per hectare unless another unit is given. Irrigation: the best available system.",
    "GAEZ no tiene datos de tierra de cultivo en este punto (agua, ciudad o fuera de tierra cultivada).":
        "GAEZ has no cropland data at this point (water, city or outside cropland).",
    "GAEZ no tiene datos agroclimaticos en este punto (agua o fuera de tierra).": "GAEZ has no agro-climatic data at this point (water or off land).",
    "Hectareas cosechadas en el pixel (~85 km2 en el ecuador) y rendimiento medio en t/ha.":
        "Hectares harvested in the pixel (~85 km² at the equator) and average yield in t/ha.",
    "GAEZ no registra cultivos cosechados en este pixel.": "GAEZ records no harvested crops in this pixel.",
    # CoCoRaHS / NOAA
    "NOAA NCEI no respondio con datos. Intenta de nuevo.": "NOAA NCEI didn't return data. Try again.",
    "Lluvia mensual media de las estaciones (solo meses con al menos 80 % de dias reportados). Sesgo = NASA POWER menos estaciones.":
        "Average monthly rain from the stations (only months with at least 80% of days reported). Bias = NASA POWER minus stations.",
    # SSURGO
    "Sin datos de SSURGO en este punto (cubre EE. UU. y no todas las zonas urbanas o de agua).":
        "No SSURGO data at this point (it covers the U.S., and not all urban or water areas).",
    "No se pudo consultar SSURGO ahora. Intenta de nuevo.": "We couldn't query SSURGO right now. Try again.",
    "Suelo de la capa superior del componente dominante (SSURGO).": "Topsoil of the dominant component (SSURGO).",
    # MODIS
    "MOD13Q1 (MODIS/Terra, 250 m, cada 16 días)": "MOD13Q1 (MODIS/Terra, 250 m, every 16 days)",
    "NDVI del píxel de 250 m que contiene tu punto; puede incluir terreno vecino.": "NDVI of the 250 m pixel containing your point; it may include neighboring land.",
    "No se pudo obtener NDVI para este punto ahora.": "We couldn't get NDVI for this point right now.",
}

PATTERNS = [
    (re.compile(r"^NASA Earthdata no respondió \((\w+)\)\. Intenta de nuevo en un rato\.$"), r"NASA Earthdata didn't respond (\1). Try again in a while."),
    (re.compile(r"^No se pudo consultar GAEZ ahora \((\w+)\)\. Intenta de nuevo\.$"), r"We couldn't query GAEZ right now (\1). Try again."),
    (re.compile(r"^No se pudo descargar el inventario de GHCN-Daily \((\w+)\)\.$"), r"We couldn't download the GHCN-Daily inventory (\1)."),
    (re.compile(r"^No hay estaciones CoCoRaHS con lluvia en (\d+) a menos de (\d+) km\. CoCoRaHS cubre EE\. UU\. \(y algunas zonas de Canada y Bahamas\)\.$"),
     r"There are no CoCoRaHS stations with rain in \1 within \2 km. CoCoRaHS covers the U.S. (and some areas of Canada and the Bahamas)."),
]

# Palabras de clase que el frontend muestra tal cual.
WORDS = {
    # SMAP
    "seco": "dry", "con humedad media": "medium moist", "húmedo": "moist", "muy húmedo": "very moist",
    # SRTM
    "plano": "flat", "de pendiente suave": "gently sloping", "de pendiente moderada": "moderately sloping",
    "de pendiente fuerte": "steeply sloping",
    # GAEZ
    "muy alta": "very high", "alta": "high", "buena": "good", "media": "medium", "moderada": "moderate",
    "marginal": "marginal", "muy marginal": "very marginal", "no apta": "not suitable",
}
WORD_KEYS = {"word", "slope_word", "suitability_class"}


def _text(s: str) -> str:
    if s in EXACT:
        return EXACT[s]
    for rx, rep in PATTERNS:
        if rx.match(s):
            return rx.sub(rep, s)
    return s


def _walk(v, key: str | None = None):
    if isinstance(v, dict):
        return {k: _walk(x, k) for k, x in v.items()}
    if isinstance(v, list):
        return [_walk(x) for x in v]
    if isinstance(v, str):
        if key in WORD_KEYS:
            return WORDS.get(v, v)
        return _text(v)
    return v


def localize(out):
    """La respuesta tal cual en español; en inglés, con las notas y palabras fijas traducidas."""
    return out if lang() != "en" else _walk(out)
