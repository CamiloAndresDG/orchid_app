# Field Shift: Adapting Farms with NASA Data — Informe de las fuentes 1–12

Fecha de verificación: 2026-11-14. Pruebas hechas con peticiones reales: API de NASA POWER, catálogo CMR de NASA (Earthdata), Soil Data Access (SSURGO), descarga PRISM, servicio de imágenes NAIP, WMS de CDL, STAC de Landsat, AppEEARS y GIBS/Worldview.

**Leyenda:** ✅ comprobado con una petición real hoy · 📚 conocimiento de la documentación oficial, no comprobado hoy · ⚠️ alerta.

## 0. Resumen del reto (pestaña Details)

- **Qué piden:** una herramienta de apoyo a la decisión (app, modelo, mapa interactivo) que combine observaciones NASA con suelo local, características de cultivos y prioridades del agricultor, para explorar **rotaciones de cultivos** que mejoren la salud del suelo y la resiliencia al clima.
- **Entregable clave:** comparar **al menos 3 estrategias de rotación, incluida la actual**. Para cada una: por qué se sugiere, evidencia, beneficios, vacíos de información y riesgos a revisar con expertos locales. No debe reemplazar el criterio del agricultor.
- **Variables que mencionan:** temperatura, estrés térmico, lluvia, humedad del suelo, evaporación/ET, riesgo de heladas, precipitación extrema, estrés de vegetación, tendencias de agua.
- **Prioridades del agricultor:** uso de agua, forraje, fijación de nitrógeno, reducción de erosión, materia orgánica, mercado.
- **Extras sugeridos:** mapas interactivos, líneas de tiempo, overlays, sliders de escenario, armonizar resoluciones a una grilla común.
- **Nota:** Details menciona GRACE/GRACE-FO y GEDI. GRACE no está en la lista de Resources, así que puede ser un extra para agua subterránea.

## 1. Resumen ejecutivo

| # | Fuente | Para qué sirve en el reto | Resolución | Cobertura | Cuenta Earthdata | Estado |
|---|---|---|---|---|---|---|
| 1 | SMAP | Humedad de suelo (superficie y zona radicular) | 9 km (L3_E), 9 km 3-horario (L4) | Global | Sí | ✅ activo (dato del 2026-11-10) |
| 2 | GPM / IMERG | Lluvia y eventos extremos | 0.1° (~10 km), 30 min a mensual | Global | Sí | ⚠️ la serie "Final" se corta en 2025-09-30 |
| 3 | Landsat / MODIS / VIIRS | NDVI, estrés vegetal, suelo desnudo, LST | 30 m / 250–1000 m | Global | Sí (EarthExplorer pide login) | ⚠️ Suomi NPP ya no entrega datos |
| 4 | NASA POWER | Clima diario por punto (T, lluvia, radiación, humedad) | ~0.5° (MERRA-2); solar ~1° | Global, desde 1981 | **No** | ✅ funciona |
| 5 | SRTM | Pendiente, escorrentía, erosión | 30 m (1″) y 90 m | 60°N–56°S | Sí | ✅ estático (2000) |
| 6 | ECOSTRESS | LST y ET de campo (hotspots de estrés) | 70 m | ±52° aprox., revisita irregular | Sí | ✅ activo (dato del 2026-10-31) |
| 7 | USDA Ag Data Commons | Datasets de investigación (prácticas, fenología, suelos) | Variable | Sobre todo EE. UU. | No | ⚠️ el enlace lleva a la guía, no al buscador |
| 8 | Web Soil Survey | Mapas y reportes de suelo por parcela | Mapas a escala de campo | EE. UU. | No | ✅ funciona |
| 9 | CDL / CropScape | Qué cultivo hubo cada año (rotación real) | 30 m, anual | EE. UU. (CONUS) | No | ⚠️ el enlace redirige a un login |
| 10 | PRISM | Clima histórico de alta calidad | 4 km (diario/mensual), 800 m (normales) | EE. UU. (CONUS) | No | ✅ descarga probada |
| 11 | SSURGO / STATSGO2 | Atributos de suelo (textura, MO, agua disponible…) | Campo / regional | EE. UU. | No | ✅ API probada |
| 12 | NAIP | Imagen aérea de alta resolución (RGB+NIR) | 0.6 m (servicio) | EE. UU. (CONUS) | No | ✅ servicio probado |

**Limitación importante:** las fuentes 7–12 y PRISM son **solo de Estados Unidos**. Si el equipo quiere un alcance global, las fuentes 1–6 son las que funcionan fuera de EE. UU. (POWER es la más fácil de usar). El resto de la cobertura internacional la revisa tu compañero (GAEZ, ERA5, Sentinel-2).

## 2. Alertas encontradas

1. **IMERG Final detenido.** El catálogo CMR lista `GPM_3IMERGDF` v07 (diario Final) con fin el **2025-09-30**, y el último granule es de esa fecha. Las versiones **Late** (`GPM_3IMERGDL`) y **Early** (`GPM_3IMERGDE`) siguen activas. Para datos recientes usa Late. Para análisis históricos hasta septiembre de 2025, Final.
2. **Suomi NPP sin datos nuevos.** Un banner de Earthdata dice que Suomi NPP ya no entrega datos y hay que pasar a productos alternativos. Por eso **VNP13A1/A2 (VIIRS/NPP) dejan de actualizarse**. Usa **VJ113A1 (NOAA-20)**, que existe en AppEEARS. VJ2 (NOAA-21) también debería existir 📚.
3. **El enlace de CropScape ya no abre CropScape.** `nassgeodata.gmu.edu/CropScape/` redirige a un inicio de sesión de **CropSmart** (CSISS-GMU). El WMS y los datos de CDL sí responden (sección 9). El portal oficial actual de NASS es **CroplandCROS** (`croplandcros.scinet.usda.gov`, responde 200).
4. **El enlace de MODIS ya no es el catálogo.** `lpdaac.usgs.gov/products/` redirige a `earthdata.nasa.gov/centers/lp-daac`. Para productos concretos usa Earthdata Search o AppEEARS.
5. **El enlace de Ag Data Commons es una guía de usuario del NAL**, no el portal de búsqueda. El buscador funciona en `data.nal.usda.gov/search`. Su API estilo CKAN (`/api/3/action/...`) **no devolvió JSON** en mi prueba.
6. **El enlace de Landsat** va a EarthExplorer (descargas con login). Para uso programático es mejor el STAC de USGS o HLS.
7. **PRISM:** la página dice que los datos están disponibles en netCDF desde 2026-09-08.

---

## 3. Fuente por fuente

### 1. SMAP — Soil Moisture Active Passive
- **Enlace del reto:** https://www.earthdata.nasa.gov/data/platforms/space-based-platforms/smap (✅ 200)
- **Qué es:** radiómetro de banda L que mide humedad de suelo superficial (~0–5 cm). Datos desde 2015-03-31 (✅ en CMR).
- **Productos útiles (✅ existen en CMR, activos):**
  - `SPL3SMP_E` v006 — L3 diario 9 km, humedad de suelo. **El más simple para empezar.**
  - `SPL3SMP` v009 — L3 diario 36 km.
  - `SPL4SMGP` v008 — L4 **cada 3 h, 9 km**, humedad de **superficie y de zona radicular** (asimilada con modelo). Es el mejor para el reto porque la zona radicular es lo que le importa al cultivo. Último dato 2026-11-10 (✅).
  - `SPL2SMAP_S` v003 — 3 km SMAP/Sentinel-1 (más fino, cobertura más limitada) 📚.
- **Variables principales 📚:**
  - L3: `soil_moisture` (cm³/cm³), `retrieval_qual_flag`, `vegetation_water_content`, `surface_temperature`, `tb_*`.
  - L4: `sm_surface`, `sm_rootzone`, `sm_profile`, temperaturas de suelo por capa, flujos de superficie.
- **Formato / acceso:** HDF5 (`.h5`), con granules de ~143 MB para L4 (✅). Se descarga con **Earthdata Login** desde Earthdata Search, `earthaccess` (Python), AppEEARS (✅ `SPL3SMP_E.006`, 9 km, diario) o Giovanni 📚.
- **Filtros en Earthdata Search 📚:** rango temporal, área (polígono/bbox), producto y versión, nube/calidad no aplica a radiómetro, capa de datos.
- **Visualización:** capas SMAP en Worldview/GIBS (✅ hay capas de temperatura de brillo L1 y órbitas). Giovanni para series y promedios de área.
- **Limitaciones:** 9 km es grueso para una parcela. Hay que **reescalar/combinar** con suelo y NDVI. La vegetación densa y el suelo congelado degradan la calidad.
- **Uso en el reto:** anomalías de humedad, meses de déficit hídrico y capacidad de cada rotación para ahorrar agua.

### 2. GPM / IMERG
- **Enlace:** https://gpm.nasa.gov/data (✅ 200)
- **Qué es:** estimación de precipitación combinando satélites, global a 0.1°.
- **Colecciones (✅ CMR):**

| Colección | Producto | Estado |
|---|---|---|
| `GPM_3IMERGDF` v07 | Final diario | ⚠️ hasta 2025-09-30 |
| `GPM_3IMERGM` v07 | Final mensual | ⚠️ hasta 2025-09-30 |
| `GPM_3IMERGHH` v07 | Final cada 30 min | ⚠️ hasta 2025-09-30 |
| `GPM_3IMERGDL` / `HHL` v07 | Late diario / 30 min | activo |
| `GPM_3IMERGDE` v07 | Early diario | activo |

- **Variables 📚:** `precipitation` (mm/h en 30 min; mm/día en diario), `precipitationQualityIndex`, `randomError`, `probabilityLiquidPrecipitation`, y versiones calibradas con pluviómetros vs. sin calibrar.
- **Formato:** NetCDF4 (`.nc4`). Acceso por Earthdata Search, OPeNDAP, `earthaccess`, Giovanni.
- **Visualización:** Worldview con la capa **`IMERG_Precipitation_Rate`** (✅ en GIBS; también `IMERG_Precipitation_Rate_30min`). El reto indica que se pueden **descargar imágenes de alta resolución** directamente desde Worldview.
- **Filtros:** fecha, área, resolución temporal (30 min, diario, mensual), Early/Late/Final.
- **Limitaciones:** ~10 km, puede subestimar lluvias convectivas locales. **Valídalo con CoCoRaHS** (fuente 16, de tu compañero).
- **Uso:** frecuencia de lluvias extremas, fiabilidad de lluvia por temporada y escenarios de precipitación.

### 3. Landsat + MODIS + VIIRS
- **Enlaces:** EarthExplorer https://earthexplorer.usgs.gov/ · MODIS (LP DAAC) https://lpdaac.usgs.gov/products/ → redirige · VIIRS https://search.earthdata.nasa.gov/search?q=VIIRS (todos ✅ 200)
- **Landsat:**
  - 30 m, revisita 16 días por satélite (8 con Landsat 8+9) 📚.
  - **STAC de USGS (✅):** `landsat-c2l2-sr` (reflectancia de superficie), `landsat-c2l2-st` (temperatura de superficie), ARD y fSCA. Endpoint: https://landsatlook.usgs.gov/stac-server
  - **HLS** (Landsat+Sentinel-2 armonizado, **30 m cada 2–3 días**): `HLSL30` y `HLSS30` v2.0, activos (último dato 2026-11-05 ✅). **Es la mejor opción para NDVI de campo con buena frecuencia.**
  - Variables: bandas azul, verde, rojo, NIR, SWIR1/2, térmica; de ellas NDVI, EVI, NDMI, NBR 📚.
- **MODIS (✅ en CMR):**
  - `MOD13Q1` v061 (NDVI/EVI **250 m, 16 días**), `MOD13A1` (500 m), `MOD11A1` (LST diaria 1 km), `MCD43A4` (reflectancia ajustada 500 m), `MCD12Q1` (cobertura del suelo anual), `MOD16A2GF` (ET 8 días 500 m, vía AppEEARS).
  - Desde 2000, ideal para series largas.
- **VIIRS:**
  - ⚠️ `VNP13A1` y `VNP13A2` (NPP, 500 m y 1 km) existen desde 2012 pero **NPP ya no recibe datos nuevos**.
  - Usa NOAA-20 `VJ113A1` (✅ en AppEEARS).
- **Variables clave:** NDVI, EVI, calidad de píxel (`pixel reliability`, `VI quality`), ángulos, día de composición.
- **Filtros en Earthdata Search 📚:** nube (%), día/noche, tile, fechas, nivel de procesamiento. En EarthExplorer: cobertura de nubes, colección, fecha, path/row.
- **Visualización:** Worldview con `MODIS_Terra_NDVI_8Day`, `HLS_L30/S30_Nadir_BRDF_Adjusted_Reflectance` y `Landsat_WELD_NDVI_*` (✅ en GIBS).
- **AppEEARS (✅ 193 productos):** extrae series de tiempo por punto o polígono sin descargar tiles. **Recomendado para el hackathon.**
- **Limitaciones:** nubes, 250 m–1 km no distingue parcelas pequeñas. Landsat/HLS es lo que sirve a escala de campo.
- **Uso:** vigor del cultivo, periodos de suelo desnudo, estacionalidad e identificar picos de estrés.

### 4. NASA POWER
- **Enlace:** https://power.larc.nasa.gov/ (✅ 200)
- **Es la fuente más fácil del conjunto:** API REST **sin clave ni cuenta**. Probé un punto (Iowa, 42.0 N, −93.6 W) y respondió en menos de 1 s.
- **Ejemplo que funcionó (✅):**
  `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M,ALLSKY_SFC_SW_DWN,GWETROOT,GWETTOP,EVLAND&community=AG&longitude=-93.6&latitude=42.0&start=20240601&end=20240603&format=JSON`
- **Variables verificadas (✅ con unidades):**
  - `T2M`, `T2M_MAX`, `T2M_MIN` (°C)
  - `PRECTOTCORR` (mm/día)
  - `RH2M` (%)
  - `ALLSKY_SFC_SW_DWN` (MJ/m²/día)
  - `GWETROOT` (humedad de zona radicular, 0–1), `GWETTOP` (superficie, 0–1)
  - `EVLAND` (evaporación de tierra, mm/día)
- La respuesta incluye la **elevación del punto** (310.22 m) y un `fill_value` de −999 para faltantes.
- **Catálogo de parámetros (✅):** `.../api/system/manager/parameters?community=ag&temporal=daily` devuelve nombre, unidades y definición (p. ej. `ALLSKY_KT`, `AIRMASS`…).
- **Comunidades:** AG (agroclimatología), RE, SB. **Temporalidades:** horaria, diaria, mensual, climatología; también endpoint regional 📚.
- **Historial:** diario desde 1981 (✅ devolvió 1981-01-01), fuentes MERRA-2 y CERES SYN1deg.
- **Visualización:** Data Access Viewer en la propia web 📚.
- **Limitaciones:** resolución de ~0.5° (50 km), es un **modelo/reanálisis**, no medición local. Sirve como base global; para EE. UU. PRISM es más preciso.
- **Uso:** frío/calor, riesgo de helada (T2M_MIN), balance hídrico simple (lluvia − ET), radiación y degree-days.

### 5. SRTM — Shuttle Radar Topography Mission
- **Enlace:** https://www.earthdata.nasa.gov/data/instruments/srtm (✅ 200)
- **Colecciones (✅ CMR):** `SRTMGL1` v003 (**1″ ≈ 30 m**), `SRTMGL3` v003 (3″ ≈ 90 m), `NASADEM_HGT` v001 (SRTM reprocesado, más limpio; en AppEEARS como `NASADEM_NC.001` y `SRTMGL1_NC.003`, ✅ 30 m estático).
- **Variable:** elevación (m). Es **estático** (misión de feb. 2000), sin serie temporal.
- **Cobertura 📚:** 60°N–56°S.
- **Derivados útiles:** pendiente, orientación (aspecto), curvatura, acumulación de flujo y índice topográfico de humedad (TWI), con GDAL, Whitebox, QGIS o `richdem`.
- **Acceso:** Earthdata Login. Tiles de 1°×1° en `.hgt` o GeoTIFF.
- **Limitaciones:** muestra altura de copa, no del terreno, donde hay vegetación densa. Para el reto, en cultivos de bajo porte es adecuado.
- **Uso:** zonas de erosión, escorrentía, encharcamiento, microclima por exposición.

### 6. ECOSTRESS
- **Enlace:** https://ecostress.jpl.nasa.gov/data (✅ 200)
- **Sensor** en la Estación Espacial Internacional. Revisita **irregular**, que depende de la órbita de la ISS. Resolución **70 m**.
- **Productos (✅ CMR, activos desde 2018-07):**

| Producto | Qué da | Versiones |
|---|---|---|
| `ECO_L2T_LSTE` | Temperatura de superficie (LST) y emisividad | v002, v003 |
| `ECO_L3T_JET` | Evapotranspiración (PT-JPL), instantánea y diurna | v002, v003 |
| `ECO_L4T_ESI` | Índice de estrés evaporativo (ESI) | v002, v003 |
| `ECO_L2_CLOUD` | Máscara de nubes | v002 |

- Último ET disponible: **2026-10-31** (✅).
- Otros productos 📚: WUE (eficiencia del uso de agua), ALEXI/disALEXI ET.
- **Variables:** LST (K), emisividad, ET (W/m² y mm/día), ESI (0–1), calidad y nubes.
- **Formato:** GeoTIFF tileado (COG) en la nube, accesible con `earthaccess` o AppEEARS (✅ `ECO_L2T_LSTE.002`, `ECO_L3T_JET.002`).
- **Filtros:** tile MGRS, fecha, hora del día (útil: pasadas diurnas vs. nocturnas), máscara de nubes.
- **Limitaciones:** la cobertura es irregular, así que **no hay series diarias continuas**. Cuenta mucho con nubes. Ojo con la versión (v002 vs v003).
- **Uso:** puntos calientes de estrés térmico dentro de un campo, comparación entre parcelas, demanda de agua, validar con OpenET (fuente 20, de tu compañero).

### 7. USDA Ag Data Commons
- **Enlace del reto:** https://www.nal.usda.gov/services/agdatacommons (✅ 200, pero es la **guía del usuario**).
- **Portal real de búsqueda:** https://data.nal.usda.gov/search (✅ 200).
- **Qué es:** repositorio abierto de datasets de investigación del USDA: suelos, cultivos, clima, manejo, fenología, calidad del agua.
- **Variables:** no hay un esquema único. Cada dataset trae las suyas (formatos CSV, Excel, shapefile, GeoTIFF, etc.).
- **Filtros del portal 📚:** palabras clave, tema, formato, licencia, año, institución.
- **Ejemplos de búsqueda útiles:** `crop rotation`, `cover crop`, `soil organic carbon`, `nitrogen fixation`, `LTAR`.
- ⚠️ No pude listar datasets por API (el endpoint CKAN no devolvió JSON), así que **no verifiqué cantidades ni datasets concretos**. Hay que buscar a mano.
- **Uso:** parámetros agronómicos de cultivos (aporte de nitrógeno, profundidad de raíz, requerimiento de agua) y ensayos de rotación para respaldar las recomendaciones.

### 8. Web Soil Survey (WSS)
- **Enlace:** https://websoilsurvey.nrcs.usda.gov/app/ (✅ 200)
- **Qué es:** visor interactivo del NRCS con el mapa oficial de suelos de EE. UU.
- **Flujo 📚:** (1) *Area of Interest* (dibujar o buscar) → (2) *Soil Map* → (3) *Soil Data Explorer* con pestañas de propiedades y calidades de suelo → (4) *Shopping Cart* para descargar reportes (PDF) o datos.
- **Variables 📚:** textura, materia orgánica, **clase de drenaje**, **grupo hidrológico (A–D)**, capacidad de agua disponible, conductividad hidráulica, riesgo de erosión (K factor, T factor), pendiente, limitaciones para uso, profundidad a capa restrictiva y a nivel freático.
- **Limitaciones:** es una interfaz web, **sin API pública**. Hay un límite de tamaño de AOI (~10 000 acres 📚). Cubre solo EE. UU.
- **Para automatizar usa Soil Data Access** (fuente 11), que sí tiene API.
- **Uso:** características de suelo por parcela y limitaciones para cada cultivo.

### 9. Cropland Data Layer (CDL) / CropScape
- **Enlace del reto:** https://nassgeodata.gmu.edu/CropScape/ → ⚠️ redirige a un login de CropSmart.
- **Alternativas:**
  - Portal oficial NASS: **CroplandCROS** https://croplandcros.scinet.usda.gov/ (✅ 200).
  - Página de lanzamientos: https://www.nass.usda.gov/Research_and_Science/Cropland/Release/index.php (✅ carga).
- **Qué es:** clasificación anual de cultivos a **30 m** para EE. UU. continental.
- **Cobertura temporal (✅ WMS):** capas `cdl_1997` … `cdl_2025`. (30 m desde ~2008; antes, resolución menor en algunos estados 📚.)
- **WMS (✅ responde):** `https://nassgeodata.gmu.edu/CropScapeService/wms_cdlall.cgi?service=WMS&request=GetCapabilities`
- **Servicios CropScape 📚:** `GetCDLValue`, `GetCDLStat`, `GetCDLFile`. En mis pruebas devolvieron error ("el área debe ser mayor de 60 m" / "Failed to get value"). Probablemente exigen coordenadas proyectadas (EPSG:5070) o parámetros que no usé, así que **no están verificados**.
- **Variables:** una banda ráster de **código de clase** (~130 clases: maíz, soya, algodón, trigo, alfalfa, pastos, barbecho, etc.) y capas de confianza por clase.
- **Derivados valiosos para rotación 📚:** *Crop Frequency* (cuántos años hubo cultivo X) y **Crop Sequence Boundaries** (secuencias multianuales por parcela). **Este es el insumo directo para reconstruir la "rotación actual"** y compararla con alternativas.
- **Uso:** reconstruir la rotación existente, ver qué cultivos son comunes en la zona y cuándo hay suelo desnudo.

### 10. PRISM Climate Data (Oregon State)
- **Enlace:** https://prism.oregonstate.edu/ (✅ 200)
- **Cobertura:** EE. UU. continental, **1895–presente** (según la propia página; datos diarios desde 1981 📚).
- **Descarga programática (✅ probada):**
  `https://services.nacse.org/prism/data/get/us/4km/ppt/20240601` devolvió un ZIP (`prism_ppt_us_25m_20240601.zip`, 1.6 MB).
  Patrón: `.../get/us/{4km|800m}/{variable}/{YYYYMMDD | YYYYMM | YYYY}`.
- **Variables 📚:** `ppt` (precipitación), `tmin`, `tmax`, `tmean`, `tdmean` (punto de rocío), `vpdmin`, `vpdmax` (déficit de presión de vapor) y radiación solar (`solslope`, `soltotal`, `solclear`).
- **Normales 1991–2020** en 800 m y 4 km.
- ℹ️ La página del reto dice que PRISM incluye "fechas de helada/congelación", pero **no lo vi como producto aparte**. Se calculan a partir de `tmin` (días con tmin ≤ 0 °C).
- **Herramientas web (✅ aparecen en la página):** Data Explorer, series de tiempo, Drought Indicator Tool, gráficos de anomalías y mes-a-la-fecha, mapas diarios.
- **Formatos:** BIL/GeoTIFF en ZIP; netCDF disponible desde 2026-09-08 (✅ anuncio en la página).
- **Limitaciones:** solo CONUS. Bajar un ráster por día y variable es pesado para series largas. Hay un límite de descargas repetidas 📚 (revisar términos de uso).
- **Uso:** historial de lluvia/temperatura a escala de campo, tendencias, validar POWER y NASA.

### 11. USDA NRCS SSURGO / STATSGO2
- **Enlace:** https://www.nrcs.usda.gov/resources/data-and-reports/soils (✅ 200, es una página índice).
- **Qué es:** SSURGO = detalle de campo (mapas 1:12 000–1:63 360). STATSGO2 = regional (1:250 000).
- **Cómo usarlo de forma programática (✅ probado):** **Soil Data Access (SDA)** REST: `POST https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest` con SQL en JSON, sin cuenta.
- **Resultado real (✅) para un punto de Iowa (42.0 N, −93.6 W):**
  - Unidad de mapa: *Hanlon-Spillville complex, channeled, 0 to 2 percent slopes*.
  - Componentes: Hanlon 60 % (grupo hidrológico A), Spillville 30 % (B/D). Drenaje: moderadamente bien drenado. Orden: Mollisols. Pendiente 1 %.
  - Horizontes: arena 65.4 %, arcilla 15 %, **materia orgánica 2.5 %** (0–99 cm), **AWC 0.17**, ksat 28, pH 6.5.
  - `muaggatt` (resumen agregado) incluye: profundidad del nivel freático (`wtdepannmin`), **frecuencia de inundación** (`flodfreqdcd`, aquí "Frequent"), agua disponible a 25/50/100/150 cm (`aws025wta`…`aws0150wta`), clase de drenaje, grupo hidrológico, "Erosion hazard slight", limitaciones de ingeniería.
- **Tablas clave:** `mapunit`, `component` (hydgrp, drainagecl, slope_r, taxorder), `chorizon` (sandtotal_r, claytotal_r, om_r, awc_r, ksat_r, ph1to1h2o_r), `muaggatt`.
- **Función útil (✅):** `SDA_Get_Mukey_from_intersection_with_WktWgs84('POINT(lon lat)')`, que da el `mukey` de un punto o polígono.
- **Otras vías 📚:** gSSURGO (geodatabase/ráster 30 m por estado), Geospatial Data Gateway.
- **Limitaciones:** solo EE. UU. Los valores son **estimaciones por componente** (porcentaje de la unidad). Algunas áreas (p. ej. tierras tribales o urbanas) pueden no estar cartografiadas.
- **Uso:** capacidad de agua disponible, drenaje y materia orgánica, que alimentan directamente la comparación de rotaciones.

### 12. NAIP — National Agriculture Imagery Program
- **Enlace del reto:** https://naip-usdaonline.hub.arcgis.com/ (✅ 200, sitio hub del USDA-FSA).
- **Servicio verificado (✅):** USGS National Map `USGSNAIPImagery` ImageServer
  `https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer`
  - Descripción del servicio: mosaico de imágenes **4 bandas (RGB + infrarrojo cercano), principalmente 0.6 m**. (El reto dice "típicamente 1 m"; en el servicio el tamaño de celda es 0.3 m a máxima resolución y el mosaico es mayormente 0.6 m.)
  - Campos de consulta (✅): `State`, `Year`, `acquisition_date`, `agency`, `vendor`, `raster_name`, `download_url`, `MinPS`, `MaxPS`, `CenterX/CenterY`.
  - Extensión: EE. UU. continental.
- **Ciclo 📚:** una adquisición cada ~2–3 años por estado, en temporada de crecimiento. **No es una serie densa en el tiempo.**
- **Variables:** reflectancia en 4 bandas. Con la banda NIR se puede calcular un **NDVI de campo** (resolución sub-métrica).
- **Visualización/filtros:** servicio de imagen consultable por estado, año y fecha. El hub permite ver el visor y descargar por condado/estado.
- **También disponible en 📚:** Google Earth Engine y Microsoft Planetary Computer.
- **Limitaciones:** archivos pesados, pocas fechas, cobertura solo de EE. UU., y sin calibración radiométrica para comparar entre años.
- **Uso:** delimitar parcelas, detectar suelo desnudo y validar lo que ven Landsat y MODIS.

---

## 4. Cómo encajan entre sí

| Necesidad del reto | Fuentes |
|---|---|
| **Agua** (lluvia y humedad) | IMERG (2), SMAP (1), POWER (4: `GWETROOT`), PRISM (10) |
| **Calor y heladas** | POWER (4: `T2M_MIN`), PRISM (10: `tmin`), ECOSTRESS (6: LST) |
| **Estrés del cultivo** | MODIS/VIIRS/HLS (3: NDVI), ECOSTRESS (6: ESI/ET) |
| **Suelo** | SSURGO/WSS (8, 11), SRTM (5) |
| **Rotación actual** | CDL (9) → *Crop Sequence Boundaries* |
| **Validación visual** | NAIP (12), Landsat/HLS (3) |
| **Contexto agronómico** | Ag Data Commons (7) |

**Armonización:** la grilla común sugerida por el reto se puede hacer a 30 m (HLS/SRTM/CDL), reescalando SMAP, IMERG, POWER y PRISM por remuestreo o promedio por polígono.

**Sin cuenta ni clave (los más rápidos para un MVP):** POWER, PRISM, SDA/SSURGO, WMS de CDL, servicio NAIP y los endpoints públicos de CMR/GIBS.
**Requieren Earthdata Login (gratis):** SMAP, IMERG, MODIS/VIIRS, HLS, ECOSTRESS, SRTM (por Earthdata/AppEEARS).

## 5. Qué no pude verificar

- Cantidades y calidad de datasets en Ag Data Commons.
- Servicios `GetCDLValue/GetCDLStat/GetCDLFile` de CropScape (devolvieron error).
- Capas SMAP de humedad de suelo en Worldview (solo vi capas de temperatura de brillo y órbitas en la lista parcial que revisé).
- Límites de uso (rate limits) de POWER, PRISM y SDA.
- Todo lo marcado 📚 viene de documentación oficial que conozco, no de una prueba de hoy.

## 6. Enlaces rápidos

- SMAP: https://www.earthdata.nasa.gov/data/platforms/space-based-platforms/smap
- GPM/IMERG: https://gpm.nasa.gov/data
- Landsat (EarthExplorer): https://earthexplorer.usgs.gov/ · STAC: https://landsatlook.usgs.gov/stac-server
- MODIS/LP DAAC: https://www.earthdata.nasa.gov/centers/lp-daac
- VIIRS: https://search.earthdata.nasa.gov/search?q=VIIRS
- AppEEARS: https://appeears.earthdatacloud.nasa.gov/
- Worldview: https://worldview.earthdata.nasa.gov/
- NASA POWER: https://power.larc.nasa.gov/
- SRTM: https://www.earthdata.nasa.gov/data/instruments/srtm
- ECOSTRESS: https://ecostress.jpl.nasa.gov/data
- Ag Data Commons (búsqueda): https://data.nal.usda.gov/search
- Web Soil Survey: https://websoilsurvey.nrcs.usda.gov/app/
- CDL (CroplandCROS): https://croplandcros.scinet.usda.gov/
- PRISM: https://prism.oregonstate.edu/
- Soil Data Access: https://sdmdataaccess.sc.egov.usda.gov/
- NAIP (servicio USGS): https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer
