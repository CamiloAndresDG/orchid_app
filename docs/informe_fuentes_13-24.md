# Field Shift: Adapting Farms with NASA Data — Informe de las fuentes 13–24

Fecha de verificación: 2026-11-14. Continuación de [informe_fuentes_1-12.md](informe_fuentes_1-12.md).

**Leyenda:** ✅ comprobado con una petición real hoy · 📚 conocimiento de la documentación oficial, no comprobado hoy · ⚠️ alerta.

Numeración según la pestaña Resources: 13 NLCD, 14 NLDAS/GLDAS, 15 GAEZ, 16 CoCoRaHS, 17 NWIS, 18 AMS Market News, 19 NASS QuickStats, 20 OpenET, 21 LANDFIRE, 22 GEDI, 23 Sentinel-2, 24 ERA5.

## 1. Resumen ejecutivo

| # | Fuente | Para qué sirve en el reto | Resolución | Cobertura | Acceso | Estado |
|---|---|---|---|---|---|---|
| 13 | NLCD | Contexto de uso/cobertura del suelo | 30 m, anual | EE. UU. | Libre | ⚠️ enlace da 403 a curl; WMS ✅ |
| 14 | NLDAS / GLDAS | Series continuas de humedad de suelo, ET, lluvia, radiación | 0.125° horario (NLDAS), 0.25° 3 h (GLDAS) | NLDAS: EE. UU.; GLDAS: global | Earthdata | ✅ activo (NLDAS al 2026-11-10; GLDAS al 2026-07-31) |
| 15 | FAO GAEZ | Aptitud agroclimática y rendimiento potencial por cultivo | ~9 km (5′) | Global | Libre | ✅ servicios ImageServer ✅; portal es **v4** |
| 16 | CoCoRaHS | Lluvia diaria de pluviómetros para validar satélite | Estaciones puntuales | EE. UU., Canadá, otros | Libre | ✅ API probada |
| 17 | USGS NWIS | Caudales y niveles de agua subterránea | Estaciones puntuales | EE. UU. | Libre | ⚠️ API antigua se apaga en 2027; nueva ✅ |
| 18 | USDA AMS Market News | Precios y mercado | Informes por mercado | EE. UU. | API pública sin clave ✅ (v3.1) | ⚠️ sobre todo PDFs/ganadería |
| 19 | NASS QuickStats | Rendimientos, áreas, producción | Condado/estado | EE. UU. | **Clave de API gratis** | ✅ portal; API exige clave |
| 20 | OpenET | ET de campo y consumo de agua | 30 m | Oeste de EE. UU. (y OpenET Global/Brasil) | **Clave de API** | ✅ sitio; API exige clave |
| 21 | LANDFIRE | Vegetación, combustibles, topografía | 30 m | EE. UU. | Libre | ✅ servicios ArcGIS ✅ |
| 22 | GEDI | Altura de dosel y biomasa | Huellas de 25 m, grillas 1 km | ±51.6° | Earthdata | ✅ activo (v3) |
| 23 | Sentinel-2 | NDVI y bandas red-edge a 10–20 m | 10/20/60 m, ~5 días | Global | Cuenta Copernicus gratuita | ✅ al día (2026-11-14) |
| 24 | ERA5 | Clima horario global desde 1940 | 0.25° (~31 km) | Global | Cuenta CDS + clave | ✅ hasta 2026-11-08 |

## 2. Alertas encontradas

1. **USGS NWIS: la API clásica se apaga el 22 de febrero de 2027.** `waterservices.usgs.gov` mostró el aviso de que se ralentizará desde enero de 2027. Hay que usar `https://api.waterdata.usgs.gov` (✅ responde con datos). **Los ejemplos antiguos de internet usan la API que va a morir.**
2. **Los enlaces de NLCD (usgs.gov) y NWIS (waterdata.usgs.gov/nwis) devolvieron 403** a mi petición automática. Eso suele ser protección anti-bot y no significa que estén caídos, pero no pude comprobar su contenido. Para NLCD usé mrlc.gov (✅).
3. **GAEZ: el portal que carga el enlace es v4**, aunque ya puede existir una versión más nueva (no lo comprobé). Importante: GAEZ v4 trae escenarios futuros de clima.
4. **QuickStats y OpenET exigen clave de API.** Es gratis, pero hay que solicitarla (QuickStats respondió `unauthorized`). Conviene que alguien del equipo la pida ya.
5. **El enlace de GEDI redirige** a `gedi.umd.edu/data-collection-started/`. Los productos de biomasa (L4) **no están en el LP DAAC sino en ORNL DAAC.**
6. **NLDAS/GLDAS: el enlace apunta a la portada de Earthdata**, no a los datos. El propio reto dice que se busque "NLDAS" o "GLDAS" en Earthdata Search.
7. **GLDAS v2.1 tiene unos 3 meses de retraso** (último dato 2026-07-31), mientras que NLDAS va con unos 4 días.
8. **GEDI y los reclamos de biomasa:** el reto menciona "L4 biomass". Los productos L4B (grillas de biomasa) en el catálogo terminan en **2023-03-16**. Solo L4A (huellas) sigue en curso, y en versión 3.
9. **Market News:** casi todos los informes públicos recientes que vi eran de ganado en subastas (PDF), poco útiles para precios de cultivos de rotación sin más trabajo.

---

## 3. Fuente por fuente

### 13. USGS National Land Cover Database (NLCD)
- **Enlace del reto:** https://www.usgs.gov/centers/eros/science/national-land-cover-database (⚠️ 403 a mi petición automática).
- **Sitio real de datos:** https://www.mrlc.gov/ (✅ 200), con menús *Data Downloads*, *Services*, *NLCD Viewer*, *EVA Tool*.
- **Qué es:** cobertura y uso del suelo a **30 m**. La versión actual es **Annual NLCD** (serie anual desde 1985 📚).
- **Servicios WMS (✅ `mrlc.gov/geoserver`):** capas `NLCD_Land_Cover`, `NLCD_Impervious`, `NLCD_Impervious_Descriptor`, `NLCD_Canopy`, `Annual_NLCD_LndCov_2024_CU_C1V1`, y resúmenes de cambio `Annual_NLCD_Smy_LndCov_ChgCnt_1985_2023` y `..._ChgIdx_1985_2023` (conteo e índice de cambios de cobertura). También capas de Rangeland (cobertura de herbáceas, arbustos, suelo desnudo, pasto exótico).
- **Variables 📚:** clase de cobertura (agua, desarrollado, bosque, arbustal, pastizal, **pasto/heno, cultivos**, humedales…), impermeabilidad (%), copa de árbol (%).
- **Filtros/visualización:** NLCD Viewer y EVA Tool del MRLC; descargas por año/región.
- **Limitaciones:** la clase "Cultivated Crops" **no distingue cultivos** (para eso está CDL, fuente 9). Solo EE. UU.
- **Uso:** entorno de cada parcela (bosque, agua, humedales, zonas urbanas cerca), y cambios de uso del suelo a largo plazo.

### 14. NLDAS / GLDAS (Land Data Assimilation Systems)
- **Enlace del reto:** https://www.earthdata.nasa.gov/ (portada; buscar "NLDAS" o "GLDAS" en Earthdata Search).
- **NLDAS-2 (✅ CMR, desde 1979, activo, GES DISC):**
  - `NLDAS_FORA0125_H` v2.0 — forzantes horarios (temperatura, humedad específica, viento, presión, radiación, lluvia) 📚.
  - `NLDAS_NOAH0125_H`, `NLDAS_MOS0125_H`, `NLDAS_VIC0125_H` — salidas de tres modelos de superficie (Noah, Mosaic, VIC), **0.125° (~12 km), horario**.
  - Último dato verificado: **2026-11-10 23:00 UTC**.
  - Cobertura: EE. UU. continental y partes de México/Canadá 📚.
- **GLDAS (✅ CMR, GES DISC, global):**
  - `GLDAS_NOAH025_3H` v2.1 (2000 → en curso), 0.25°, 3 horas; `GLDAS_NOAH025_M` mensual; `GLDAS_NOAH10_M` 1°.
  - v2.0 cubre 1948–2014 (cerrado). `GLDAS_CLSM025_D` (Catchment, diario) llega solo a 2014.
  - Último dato verificado de v2.1: **2026-07-31**.
- **Variables 📚 (Noah):** humedad de suelo en 4 capas (0–10, 10–40, 40–100, 100–200 cm), temperatura del suelo, **evapotranspiración**, evaporación de suelo, transpiración, escorrentía superficial y de base, equivalente de agua de nieve, flujos de calor, radiación neta, lluvia.
- **Acceso:** Earthdata Login; NetCDF4; OPeNDAP, `earthaccess`, Giovanni 📚 (series de tiempo y promedios de área). Hay un visor "Hydrology Data Rods" para series puntuales 📚.
- **Limitaciones:** son **salidas de modelo**, no medición. Humedad de suelo con resolución ~12–25 km. NLDAS solo EE. UU.
- **Uso:** series continuas y sin huecos de humedad en 4 profundidades (complementa a SMAP, que es solo superficie), ET y escorrentía; ideal para features de entrenamiento.

### 15. FAO GAEZ (Global Agro-Ecological Zones)
- **Enlace:** https://gaez.fao.org/ (✅ 200). La página que carga se titula **"GAEZ v4 Data Portal"**.
- **Servicios de datos (✅ `gaez-services.fao.org/server/rest/services`):** ImageServers `LR`, `res01`, `res02`, `res05`, `res06`, `res07` (ArcGIS REST).
- **Estructura (✅):** raster de 1 banda, **celda 0.0833° (5′ ≈ 9 km)**. Campos de consulta: `variable`, `sub_theme_name`, `year`, `model`, `rcp`, `units`, `download_url` y, en `res05`, también **`crop`, `water_supply`, `input_level`, `c02_fertilization`**.
- **Qué da 📚:** módulos de recursos de clima, suelo y terreno (res01–res03), **idoneidad y rendimiento potencial** por cultivo (res05) y brechas de rendimiento, bajo secano/riego y bajo/alto insumo, para **clima histórico y futuros (varios modelos y escenarios RCP)**.
- **Variables 📚:** índice de aptitud, rendimiento potencial (kg/ha), longitud del periodo de crecimiento, zonas agroecológicas, déficit hídrico, restricciones de suelo.
- **Filtros:** cultivo, nivel de insumos, riego vs. secano, periodo (histórico, 2020s…2080s), modelo climático, escenario.
- **Limitaciones:** ~9 km (no a escala de parcela). Son modelos agronómicos globales, no consideran manejo local.
- **Uso:** filtrar qué cultivos candidatos son agroclimáticamente viables en una zona y cómo cambiará la aptitud con el clima. **Es la única fuente de la lista que sirve fuera de EE. UU. para esto.**

### 16. CoCoRaHS
- **Enlace:** https://www.cocorahs.org/Maps (✅ 200).
- **API de exportación (✅ probada, sin clave):**
  `https://data.cocorahs.org/export/exportreports.aspx?ReportType=Daily&dtf=1&Format=csv&State=IA&ReportDateType=reportdate&StartDate=6/1/2024&EndDate=6/2/2024&TimesInGMT=False`
- **Columnas devueltas (✅):** `ObservationDate`, `ObservationTime`, `EntryDateTime`, `StationNumber` (ej. `IA-ST-42`), `StationName`, `Latitude`, `Longitude`, **`TotalPrecipAmt`** (en pulgadas 📚), `NewSnowDepth`, `NewSnowSWE`, `TotalSnowDepth`, `TotalSnowSWE`, `DateTimeStamp`.
- **Otros reportes 📚:** informes de granizo, de lluvia intensa (*multi-day*), de condiciones de sequía.
- **Filtros:** estado, condado, fechas, tipo de informe, formato (csv/xml).
- **Limitaciones:** voluntarios, calidad variable; "NA" frecuente en nieve; observaciones a hora local de lectura (~7 am), no a día UTC. Cobertura densa en EE. UU., esparcida fuera.
- **Uso:** **validar IMERG** y detectar eventos locales de lluvia extrema en una parcela.

### 17. USGS NWIS (National Water Information System)
- **Enlace del reto:** https://waterdata.usgs.gov/nwis (⚠️ 403 a mi petición automática).
- **⚠️ API clásica `waterservices.usgs.gov` funciona hoy pero se apaga el 22-feb-2027** (✅ aviso en su sitio; desde enero de 2027 habrá lentitud y cortes intencionales).
- **API nueva (✅ probada, sin clave):** `https://api.waterdata.usgs.gov/ogcapi/v0/`
  - Colecciones (✅): `daily`, `continuous`, `latest-daily`, `latest-continuous`, `field-measurements`, `monitoring-locations`, `time-series-metadata`, `parameter-codes`, `peaks`, `channel-measurements`, `combined-metadata`, y tablas de códigos (sitios, acuíferos, cuencas hidrológicas, etc.).
  - Ejemplo que funcionó: `.../collections/daily/items?monitoring_location_id=USGS-05481650&parameter_code=00060&time=2024-06-01/2024-06-03&f=json` → caudal diario (pies cúbicos/s), con `approval_status` y `qualifier`.
  - También devolvió sitios de monitoreo de agua subterránea de Iowa (`site_type_code=GW`).
- **Variables clave 📚:** caudal (`00060`), nivel del cauce (`00065`), **nivel de agua subterránea** (`72019` y relacionados), temperatura, conductividad específica, nitrato, etc. por código de parámetro.
- **Filtros:** estado, condado, ubicación (bbox), tipo de sitio, código de parámetro, periodo.
- **Limitaciones:** son estaciones puntuales, no cuadrículas; hay que buscar la más cercana a la parcela. La mayoría de los tutoriales usan la API antigua.
- **Uso:** disponibilidad de agua para riego, tendencias de acuífero y validación de humedad y lluvia.

### 18. USDA AMS Market News
- **Enlace:** https://www.ams.usda.gov/market-news (✅ 200).
- **API (MARS):** `https://marsapi.ams.usda.gov/services/...`
  - Endpoints antiguos (v1.2) devuelven **403** sin credenciales (✅).
  - **Endpoints públicos v3.1 (✅ sin clave):** `/services/v3.1/public/listPublishedReports/{nbrOfDays}?format=json`, `listCorrectedReports`, `listPublishedReport/{slug_id}`.
  - La respuesta de prueba trajo **519 informes recientes** en 3 días, con `id`, `reportTitle`, `reportBeginDate`, `fileExtension` (**pdf**). Los primeros eran de subastas de ganado.
  - Documentación de endpoints: https://marsapi.ams.usda.gov/services/help
- **Qué da 📚:** precios reportados por mercado (granos, hortalizas, frutas, ganado, lácteos, algodón, heno), volúmenes, tendencias.
- **Limitaciones:** los informes públicos que vi vienen en **PDF**; para datos estructurados de series de precios (cultivos) la API clásica (con clave gratuita 📚) o MyMarketNews puede ser necesaria. No lo probé.
- **Uso:** viabilidad de mercado de los cultivos candidatos de la rotación (prioridad del agricultor: "market suitability").

### 19. USDA NASS QuickStats
- **Enlace:** https://quickstats.nass.usda.gov/ (✅ 200).
- **API:** `https://quickstats.nass.usda.gov/api/api_GET/?key=TU_CLAVE&...` → **exige clave** (sin clave respondió `{"error":["unauthorized"]}`, ✅). La clave es gratuita 📚 (se solicita en https://quickstats.nass.usda.gov/api).
- **Parámetros 📚:** `commodity_desc` (CORN, SOYBEANS…), `statisticcat_desc` (YIELD, AREA PLANTED, PRODUCTION…), `year`, `state_alpha`, `county_name`, `agg_level_desc` (NATIONAL/STATE/COUNTY), `format` (JSON/CSV/XML). Límite de ~50 000 registros por consulta 📚.
- **Qué da 📚:** rendimiento, área plantada y cosechada, producción, existencias, precios recibidos, **a nivel de condado y estado**, desde el Censo de Agricultura y encuestas anuales.
- **Limitaciones:** solo EE. UU.; datos de condado con huecos por confidencialidad; es estadística agregada, no por parcela.
- **Uso:** calibrar rendimientos esperados de cada cultivo de la rotación y ver frecuencia de cultivos en la zona.

### 20. OpenET
- **Enlace:** https://openetdata.org/ → redirige a https://etdata.org/ (✅ 200).
- **Qué es:** ET **a 30 m** (modelo "ensemble" de varios modelos satelitales: SSEBop, eeMETRIC, geeSEBAL, SIMS, PT-JPL, DisALEXI) 📚. Menús del sitio (✅): *Data Explorer*, *OpenET API*, *FARMS Tool*, *Google Earth Engine*, *OpenET Global*, *OpenET Brazil*, *Accuracy & Known Issues*.
- **Acceso:**
  - **Data Explorer** (web, visor gráfico por polígono).
  - **API** (`developer.openet-api.org`, responde 200 ✅) → **requiere clave** 📚 (cuenta gratuita con cuota limitada).
  - **Google Earth Engine** (colecciones OpenET).
  - **FARMS Tool**, pensada para agricultores 📚.
- **Variables 📚:** ET (mm), ET de referencia (gridMET/ASCE), **ETo** y **coeficiente de cultivo (ETof)**, precipitación, mensual y diario.
- **Cobertura:** **oeste de EE. UU. (17 estados)** como producto principal; existe OpenET Global y OpenET Brasil, que **no comprobé**.
- **Limitaciones:** si la parcela está en el este (Iowa, por ejemplo) no está cubierta. Serie desde 2016 📚.
- **Uso:** **ET real de campo** para comparar con ECOSTRESS (fuente 6) y estimar demanda hídrica de cada cultivo.

### 21. USFS LANDFIRE
- **Enlace:** https://www.landfire.gov/ (✅ 200).
- **Qué es:** capas de vegetación, combustibles, topografía y régimen de fuego, **30 m**, para EE. UU.
- **Servicios ArcGIS (✅ `lfps.usgs.gov/arcgis/rest/services`):** carpetas por versión `Landfire_LF2016`, `LF2020`, `LF2022`, `LF2023`, `LF2024`, `LF2025`, más `Landfire_Disturbance`, `Landfire_LF2025_Seasonal_Fuels_2026`, `Landfire_Topo`, `Landsat`, `RCMAP`.
- **Novedades en el sitio (✅):** *LF 2025 CONUS Final Update*, *2025 Annual Disturbance*, *Fall Seasonal Fuel release*.
- **Variables 📚:**
  - **Vegetación:** tipo existente (EVT), cobertura (EVC), altura (EVH), tipo potencial (BpS).
  - **Combustibles:** modelos de combustible, altura de base de copa, densidad.
  - **Topografía:** elevación, pendiente, aspecto.
  - **Perturbación** anual.
- **Filtros:** región (CONUS, Alaska, Hawái), versión/año; descarga por área con *LFPS* (LANDFIRE Product Service) 📚.
- **Limitaciones:** orientada a incendios y ecosistemas naturales; **poco detalle agrícola** (los cultivos aparecen como clases genéricas).
- **Uso:** vegetación circundante (setos, bosques, perennes), efectos de microclima y erosión. **Es la de menor prioridad del conjunto para un MVP.**

### 22. GEDI (Global Ecosystem Dynamics Investigation)
- **Enlace del reto:** https://gedi.umd.edu/data → redirige a `gedi.umd.edu/data-collection-started/` (✅ 200).
- **Qué es:** lidar de la ISS (huellas de ~25 m, entre ±51.6° de latitud) desde **2019-04**.
- **Colecciones (✅ CMR):**

| Producto | Qué da | DAAC | Estado |
|---|---|---|---|
| `GEDI02_A` v003 | Altura del terreno y métricas de altura (RH) por huella | LP DAAC | activo (v002 hasta 2025-07-10) |
| `GEDI02_B` v003 | Cobertura de dosel y perfil vertical (**LAI**, PAI) | LP DAAC | activo |
| `GEDI_L4A_AGB_Density_V3_2508` v3 | **Biomasa aérea (AGBD)** por huella | ORNL DAAC | activo |
| `GEDI_L4A_AGB_Density_V2_1_2056` v2.1 | Biomasa por huella | ORNL DAAC | hasta 2025-07-09 |
| `GEDI_L4B_Gridded_Biomass_V2_1_2299` v2.1 | Biomasa en grilla de 1 km | ORNL DAAC | **hasta 2023-03-16** |
| `GEDI_L4D_Imputed_Waveforms_2455` v2 | Formas de onda imputadas | ORNL DAAC | hasta 2023-03-16 |
| `GEDI_HighQuality_Shots_Rasters_2339` | Rásteres de estructura y biomasa | ORNL DAAC | hasta 2023-03-16 |

- **Variables 📚:** `agbd` (Mg/ha), `rh100`/`rh98` (altura de dosel), `cover`, `pai`, `lai`, `sensitivity`, `quality_flag`, `degrade_flag`.
- **Formato:** HDF5 por órbita (footprints) y GeoTIFF (grillas). Acceso Earthdata; `earthaccess`, `gedi_subsetter` 📚.
- **Limitaciones:** **diseñado para bosques**; en cultivos bajos hay poca señal y huellas dispersas (no cubre cada campo). Las grillas L4B no llegan a la actualidad. No hay series densas.
- **Uso:** contexto estructural alrededor de la finca (bosques, árboles, cultivos perennes de dosel alto). **No esperes mucha utilidad sobre cultivos anuales.**

### 23. Copernicus Sentinel-2 (ESA)
- **Enlace:** https://dataspace.copernicus.eu/ (✅ 200).
- **STAC (✅ sin cuenta para consultar):** `https://stac.dataspace.copernicus.eu/v1/collections/sentinel-2-l2a` → "Sentinel-2 Level-2A", **desde 2015-06-27 y sin fecha de fin**.
- **OData (✅):** `https://catalogue.dataspace.copernicus.eu/odata/v1/Products?$filter=Collection/Name eq 'SENTINEL-2' and contains(Name,'L2A')&$orderby=ContentDate/Start desc&$top=1` devolvió una escena **de hoy** (`S2C_MSIL2A_20261114T162531_…`, satélite **S2C**).
- **Bandas 📚:** B2/B3/B4/B8 a **10 m**, B5/B6/B7/B8A/B11/B12 a **20 m**, B1/B9/B10 a 60 m. Red-edge (B5–B7) y SWIR (B11–B12) útiles para clorofila y humedad.
- **Producto L2A (corregido a superficie)** incluye máscara de nubes (`SCL`), vapor de agua, espesor óptico de aerosoles.
- **Visualización:** *Copernicus Browser* (browser.dataspace.copernicus.eu) 📚, con índices (NDVI, NDMI, etc.).
- **Filtros:** fecha, geometría, **% de nubes**, nivel (L1C/L2A), satélite (S2A/S2B/S2C), tile MGRS.
- **Acceso:** consulta libre; descargar requiere **cuenta gratuita de Copernicus Data Space** 📚.
- **Limitaciones:** nubes; 10 m es bueno pero no resuelve parcelas muy pequeñas.
- **Alternativa ya integrada:** **HLS** (fuente 3, NASA) ya combina Sentinel-2 con Landsat a 30 m cada 2–3 días, sin cuenta Copernicus.
- **Uso:** NDVI/EVI y NDRE de campo más detallado que Landsat; detectar suelo desnudo y etapas del cultivo.

### 24. ERA5 (ECMWF / Copernicus CDS)
- **Enlace:** https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels?tab=overview (✅ 200).
- **Catálogo (✅):** *"ERA5 hourly data on single levels from 1940 to present"*, extensión temporal **1940-01-01 → 2026-11-08**.
- **Resolución 📚:** 0.25° (~31 km), **horaria**, global.
- **Variables 📚:** temperatura a 2 m y de punto de rocío, precipitación total, viento 10 m, presión, radiación solar y térmica, **temperatura y humedad de suelo en 4 capas** (`swvl1–4`, `stl1–4`), evaporación, escorrentía, nieve, nubosidad.
- **También:** **ERA5-Land** (0.1°, ~9 km) para variables de superficie 📚, que suele ser mejor para suelo.
- **Acceso:** **cuenta CDS gratuita + clave de API** y aceptar las licencias del dataset 📚. Cliente: `cdsapi` (Python). Descarga en GRIB o NetCDF.
- **Limitaciones:** reanálisis (modelo + observaciones), no medición local. Las descargas pasan por cola y pueden tardar. Resolución gruesa para parcelas.
- **Uso:** **clima base global** (alternativa a POWER con más variables y resolución horaria) y validación en zonas sin estaciones. Con ERA5-Land se tiene humedad de suelo por capas para fuera de EE. UU.

---

## 4. Cómo encajan con las fuentes 1–12

| Necesidad | Fuentes nuevas | Complementa a |
|---|---|---|
| **Humedad en profundidad** | NLDAS/GLDAS (14), ERA5-Land (24) | SMAP (1, solo superficie) |
| **Validación de lluvia** | CoCoRaHS (16) | IMERG (2) |
| **ET de campo** | OpenET (20, solo oeste EE. UU.) | ECOSTRESS (6) |
| **Aptitud de cultivos y clima futuro** | **GAEZ (15)** | Nada de la lista 1–12 lo cubre |
| **Rendimientos y mercado** | QuickStats (19), Market News (18) | CDL (9) |
| **Agua para riego** | NWIS (17) | SMAP/IMERG |
| **Contexto del paisaje** | NLCD (13), LANDFIRE (21), GEDI (22) | NAIP (12), Landsat (3) |
| **Imagen de 10 m** | Sentinel-2 (23) | HLS/Landsat (3) |
| **Clima global** | ERA5 (24) | POWER (4) |

## 5. Qué necesita cuenta o clave

- **Sin cuenta (probé ✅):** CoCoRaHS, NWIS (API nueva), Market News v3.1 (reportes públicos), servicios ArcGIS de LANDFIRE y GAEZ, WMS de NLCD, STAC/OData de Copernicus (consulta).
- **Earthdata Login (gratis):** NLDAS, GLDAS, GEDI.
- **Clave gratuita:** **QuickStats**, **OpenET API**, **CDS (ERA5)**, y cuenta **Copernicus Data Space** para descargar Sentinel-2.

## 6. Qué no pude verificar

- Contenido de las páginas de NLCD (`usgs.gov`) y NWIS (`waterdata.usgs.gov/nwis`): devolvieron 403 a mi cliente.
- Datos reales de QuickStats y OpenET (exigen clave).
- Si existe una versión de GAEZ más nueva que v4.
- Cuántos informes de Market News tienen precios de cultivos en formato estructurado.
- Cobertura real de OpenET Global/Brasil.
- Todo lo marcado 📚 viene de documentación oficial que conozco, no de una prueba de hoy.

## 7. Enlaces rápidos

- NLCD: https://www.mrlc.gov/ · WMS: https://www.mrlc.gov/geoserver/mrlc_display/wms
- NLDAS/GLDAS: https://search.earthdata.nasa.gov/search?q=NLDAS · https://search.earthdata.nasa.gov/search?q=GLDAS
- GAEZ: https://gaez.fao.org/ · servicios: https://gaez-services.fao.org/server/rest/services
- CoCoRaHS: https://www.cocorahs.org/Maps · exportar: https://data.cocorahs.org/export/
- NWIS (API nueva): https://api.waterdata.usgs.gov/
- Market News: https://www.ams.usda.gov/market-news · API: https://marsapi.ams.usda.gov/services/help
- QuickStats: https://quickstats.nass.usda.gov/ · clave: https://quickstats.nass.usda.gov/api
- OpenET: https://etdata.org/
- LANDFIRE: https://www.landfire.gov/ · servicios: https://lfps.usgs.gov/arcgis/rest/services
- GEDI: https://gedi.umd.edu/ · biomasa L4 (ORNL DAAC): https://daac.ornl.gov/GEDI/
- Sentinel-2 (STAC): https://stac.dataspace.copernicus.eu/v1/ · visor: https://browser.dataspace.copernicus.eu/
- ERA5: https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels
