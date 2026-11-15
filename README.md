# Orchid

Hecho por **Orbital Farmers**, equipo participante en el NASA Space Apps Challenge 2026.

Herramienta de apoyo a la decisión para agricultores, hecha para el reto [Field Shift: Adapting Farms with NASA Data](https://www.spaceappschallenge.org/2026/challenges/adapting-farms-with-nasa-data/?tab=details) del NASA Space Apps Challenge 2026.

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
├── infra/azure/        Script y plantilla para desplegar en Azure Container Apps
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

## Despliegue en Azure

Frontend y backend corren en Azure Container Apps, las cuentas y los terrenos en Azure Database for PostgreSQL y la
caché del backend en Azure Files. El primer despliegue
se hace con `bash infra/azure/setup.sh` y los siguientes con GitHub Actions. Paso a paso en [infra/azure/README.md](infra/azure/README.md).

## Estado del MVP

**Datos reales, consultados en vivo para el punto del agricultor:** NASA POWER (clima), MODIS (NDVI), SMAP (humedad
del suelo), GPM IMERG (lluvia por satélite), NLDAS-2 (agua en el suelo), SRTM (relieve), SSURGO (suelo), CDL (cultivos
de la zona), FAO GAEZ (idoneidad), CoCoRaHS (pluviómetros), Censo de EE. UU. (geocodificación) y QuickStats (precios,
con clave). La economía usa solo los números que declara el agricultor.

**Reglas nuestras, no datos (todavía sin validar por un agrónomo):** el motor de rotaciones (`backend/app/recommend.py`:
catálogo de 8 cultivos con meses de siembra, ciclo y necesidad de agua, y los pesos de `RULES`), los pesos del índice
de meses difíciles (`analysis.py`, `WEIGHTS`) y las estrategias de las dos zonas de ejemplo (`rotations.py`, Sumner
County, Kansas, y Story County, Iowa, con una rotación actual supuesta). El informe completo muestra las reglas con sus
números. Algunos colores del mapa CDL (sorgo, girasol, alfalfa, barbecho, algodón, arroz) aún no se verificaron con un
punto real y se marcan como tales.

**Pendiente:** validar las reglas con la extensión agrícola (K-State, Iowa State) o un agrónomo; la clave de QuickStats
del servidor; las tablas del ETL que necesitan Earthdata (clima GLDAS/NLDAS, cobertura NLCD).
