"""ETL for the NASA Space Apps database (Adapting Farms with NASA Data).

Turns the `etl_nasa_space_apps.ipynb` notebook into reusable modules:

| # | Table                 | Module          | Source                                                  |
|---|-----------------------|-----------------|---------------------------------------------------------|
| 1 | cells                 | grid            | GLDAS 0.25-degree grid + pilot zones                    |
| 2 | coverage              | grid            | Derived: which sources cover each cell                  |
| 3 | gaez_actual           | gaez            | GAEZ v4 Theme 5 (FAO server or local folder)            |
| 4 | climate_monthly       | ldas            | GLDAS 2.1 (global) and NLDAS-2 (U.S.) via Earthdata     |
| 5 | climatology           | ldas            | Derived from climate_monthly                            |
| 6 | landcover             | landcover       | NLCD (MRLC via pygeohydro), U.S. only                   |
| 7 | stations_validation   | stations        | CoCoRaHS in GHCN-Daily (NOAA NCEI) + climate_monthly    |
| 8 | gaez_growing          | gaez            | GAEZ v4 Theme 2 (res01)                                 |
| 9 | gaez_suitability      | gaez            | GAEZ v4 Theme 4 (res05)                                 |
|10 | crop_traits           | traits          | Manual (botanical draft, editable CSV)                  |
|11 | indicators_monthly    | indicators      | Derived from climate_monthly                            |

Build tables:  `python -m app.etl build [table ...]`  (from the backend folder)
Show status:   `python -m app.etl status`

Column names inside the parquet files (zona, año, mes, fuente, valor, ...) stay in Spanish:
they are the stored schema shared with the notebook, and renaming them would break existing data.
"""
