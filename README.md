# NASA Space Apps 2026: Field Shift

Proyecto para el reto [Field Shift: Adapting Farms with NASA Data](https://www.spaceappschallenge.org/2026/challenges/adapting-farms-with-nasa-data/?tab=details) del NASA Space Apps Challenge 2026.

## Objetivo

Crear una herramienta de apoyo a la decisión que combine observaciones de la Tierra de NASA con información local de suelo, características de cultivos y prioridades del agricultor, para explorar estrategias de rotación que mejoren la salud del suelo y la resiliencia al clima.

Requisitos principales del reto:
- Comparar al menos 3 estrategias de rotación, incluida la rotación actual.
- Para cada una: por qué se sugiere, qué evidencia la respalda, beneficios, vacíos de información y riesgos que deben revisar agricultores o expertos locales.
- Apoyar el criterio del agricultor, no reemplazarlo.

## Documentación de fuentes de datos

Verificación de las 24 fuentes de la pestaña Resources, hecha el 2026-11-14 con consultas reales a sus APIs y catálogos.

| Archivo | Contenido |
|---|---|
| [docs/informe_fuentes_1-12.md](docs/informe_fuentes_1-12.md) | SMAP, GPM/IMERG, Landsat/MODIS/VIIRS, NASA POWER, SRTM, ECOSTRESS, Ag Data Commons, Web Soil Survey, CDL, PRISM, SSURGO/STATSGO2, NAIP |
| [docs/informe_fuentes_13-24.md](docs/informe_fuentes_13-24.md) | NLCD, NLDAS/GLDAS, GAEZ, CoCoRaHS, NWIS, Market News, QuickStats, OpenET, LANDFIRE, GEDI, Sentinel-2, ERA5 |
| [docs/fuentes-field-shift.html](docs/fuentes-field-shift.html) | Resumen combinado con tabla filtrable (abrir en el navegador) |

## Resumen rápido

- **Sin cuenta, listas para usar:** NASA POWER, PRISM, SSURGO (Soil Data Access), CoCoRaHS, NWIS (API nueva), WMS de CDL y NLCD, servicio NAIP, GAEZ, LANDFIRE.
- **Cuenta Earthdata (gratis):** SMAP, IMERG, MODIS/VIIRS, HLS, ECOSTRESS, SRTM, NLDAS/GLDAS, GEDI.
- **Claves gratuitas a solicitar:** NASS QuickStats, OpenET, ERA5 (CDS) y cuenta Copernicus para descargar Sentinel-2.
- **Cobertura:** 13 de las 24 fuentes son solo de EE. UU.

### Alertas

- NWIS: la API clásica `waterservices.usgs.gov` se apaga el 2027-02-22. Usar `api.waterdata.usgs.gov`.
- IMERG Final termina el 2025-09-30. Para fechas recientes usar IMERG Late o Early.
- Suomi NPP ya no entrega datos nuevos. Usar NOAA-20 (`VJ113A1`) en lugar de VNP13.
- El enlace de CropScape redirige a un login. El WMS de CDL funciona y el portal oficial es CroplandCROS.
- GEDI L4B (biomasa en grilla) termina en 2023-03. GLDAS v2.1 tiene unos 3 meses de retraso.

## Estructura

```
.
├── README.md
├── backend/            FastAPI: zonas, NASA POWER, vulnerabilidad, estrategias
│   ├── app/            main.py, zones.py, nasa_power.py, analysis.py, rotations.py, datasets.py
│   │   └── etl/        GAEZ, GLDAS/NLDAS, NLCD, CoCoRaHS (python -m app.etl)
│   └── data/db/        tablas parquet del ETL
├── frontend/           Next.js + MapLibre + Recharts
└── docs/
    ├── informe_fuentes_1-12.md
    ├── informe_fuentes_13-24.md
    └── fuentes-field-shift.html
```

## Cómo correrlo

```bash
# Backend (puerto 8000)
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m uvicorn app.main:app --reload
```

### Fuentes nuevas: GAEZ, GLDAS/NLDAS, NLCD y CoCoRaHS (`backend/app/etl/`)

Las funciones del notebook `backend/app/etl_nasa_space_apps.ipynb` viven ahora como módulos de Python.
Hay dos formas de usarlas:

**1. En vivo por punto (sin construir nada).** Cuerpo `{"lat": .., "lon": ..}`:

| Endpoint | Fuente | Cobertura |
|---|---|---|
| `POST /point/gaez/suitability?input_level=High` | GAEZ v4 Tema 4: idoneidad y rendimiento alcanzable por cultivo, en secano y con riego | Global |
| `POST /point/gaez/growing` | GAEZ v4 Tema 2: periodo de crecimiento, días de helada y calor, lluvia, P/PET | Global |
| `POST /point/gaez/actual` | GAEZ v4 Tema 5: área, producción y rendimiento reales (2010) | Global |
| `POST /point/stations` (`year`, `radius_km` opcionales) | Estaciones CoCoRaHS (NOAA GHCN-Daily) frente a NASA POWER | EE. UU. |

**2. Base de datos de las zonas piloto (parquet en `backend/data/db/`).**

```bash
cd backend
.venv/Scripts/python -m app.etl status                 # qué tablas hay
.venv/Scripts/python -m app.etl build                  # construye lo que falte (GAEZ, cells, crop_traits sin cuenta)
.venv/Scripts/python -m app.etl build gaez_suitability --force
# Clima GLDAS/NLDAS y NLCD necesitan dependencias extra y, para el clima, un token de Earthdata:
.venv/Scripts/python -m pip install -r requirements-etl.txt
export EARTHDATA_TOKEN=...   # https://urs.earthdata.nasa.gov -> Generate Token
.venv/Scripts/python -m app.etl build climate_monthly landcover stations_validation indicators_monthly
```

Los parquet que genera el notebook en Colab tienen el mismo esquema: basta copiarlos a `backend/data/db/`.
Las zonas piloto se editan en `PILOTOS` (`app/etl/grid.py`). `crop_traits` se edita en `backend/data/db/crop_traits.csv`.

| Endpoint | Qué devuelve |
|---|---|
| `GET /datasets` | Estado de las 11 tablas y zonas piloto |
| `GET /datasets/cell?lat=..&lon=..` | Todo lo que la base sabe de la celda de 0,25° del punto |
| `GET /datasets/zones/{zona}` | Cultivos principales, sequía reciente, cobertura del suelo y validación de una zona |
| `GET /datasets/{tabla}?zona=&cell_id=&crop=&fuente=&limit=&offset=` | Filas de una tabla |

```bash
# Frontend (puerto 3000)
cd frontend
npm install
npm run dev
```

## Estado del MVP

Zonas de demo: Sumner County (Kansas, trigo-barbecho) y Story County (Iowa, maíz-soja).
Hoy la vulnerabilidad usa clima mensual de NASA POWER (lluvia, temperatura, humedad de zona radicular)
y los meses sin cultivo salen de calendarios fijos. Pendiente: NDVI real (HLS/MODIS), CDL para
el historial de rotación, SSURGO para suelos, SMAP, y el agente con Claude API.
