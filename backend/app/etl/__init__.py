"""ETL de la base de datos NASA Space Apps (Adapting Farms with NASA Data).

Convierte el notebook `etl_nasa_space_apps.ipynb` en modulos reutilizables:

| # | Tabla                 | Modulo          | Fuente                                                  |
|---|-----------------------|-----------------|---------------------------------------------------------|
| 1 | cells                 | grid            | Cuadricula GLDAS 0.25 grados + zonas piloto             |
| 2 | coverage              | grid            | Derivada: que fuentes cubren cada celda                 |
| 3 | gaez_actual           | gaez            | GAEZ v4 Tema 5 (servidor FAO o carpeta local)           |
| 4 | climate_monthly       | ldas            | GLDAS 2.1 (global) y NLDAS-2 (EE. UU.) via Earthdata    |
| 5 | climatology           | ldas            | Derivada de climate_monthly                             |
| 6 | landcover             | landcover       | NLCD (MRLC via pygeohydro), solo EE. UU.                |
| 7 | stations_validation   | stations        | CoCoRaHS en GHCN-Daily (NOAA NCEI) + climate_monthly    |
| 8 | gaez_growing          | gaez            | GAEZ v4 Tema 2 (res01)                                  |
| 9 | gaez_suitability      | gaez            | GAEZ v4 Tema 4 (res05)                                  |
|10 | crop_traits           | traits          | Manual (borrador botanico, CSV editable)                |
|11 | indicators_monthly    | indicators      | Derivada de climate_monthly                             |

Construir tablas:  `python -m app.etl build [tabla ...]`  (desde la carpeta backend)
Ver estado:        `python -m app.etl status`
"""
