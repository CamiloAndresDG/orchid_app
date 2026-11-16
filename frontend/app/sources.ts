// Official links that reproduce exactly the query the app made.

// Official page (Data Access Viewer) with the point, dates and parameters already filled in.
// The viewer fills in the form; the person only presses "Submit" to chart or download.
export function powerViewerUrl(lat: number, lon: number, temporal: "daily" | "monthly", start: string, end: string): string {
  const q = new URLSearchParams({
    pane: "single-point",
    lat: String(lat),
    lon: String(lon),
    community: "ag",
    temporal,
    parameters: "PRECTOTCORR,T2M,GWETROOT",
    start,
    end,
  });
  return `https://power.larc.nasa.gov/data-access-viewer/?${q}`;
}

// Raw data (JSON) for the same query the base analysis uses.
export function powerApiUrl(lat: number, lon: number): string {
  const q = new URLSearchParams({
    parameters: "PRECTOTCORR,T2M,GWETROOT",
    community: "AG",
    longitude: String(lon),
    latitude: String(lat),
    start: "2015",
    end: "2024",
    format: "JSON",
  });
  return `https://power.larc.nasa.gov/api/temporal/monthly/point?${q}`;
}

// 2015-2024 monthly average used by the vulnerability index, on the official page.
export function powerUrl(lat: number, lon: number): string {
  return powerViewerUrl(lat, lon, "monthly", "2015-01-01", "2024-12-31");
}

export function cdlUrl(lat: number, lon: number, year = 2025, half = 0.01): string {
  const q = new URLSearchParams({
    service: "WMS",
    version: "1.1.1",
    request: "GetMap",
    layers: `cdl_${year}`,
    srs: "EPSG:4326",
    bbox: `${lon - half},${lat - half},${lon + half},${lat + half}`,
    width: "600",
    height: "600",
    format: "image/png",
    styles: "",
    transparent: "false",
  });
  return `https://nassgeodata.gmu.edu/CropScapeService/wms_cdlall.cgi?${q}`;
}

export function ssurgoMapUrl(lat: number, lon: number, half = 0.01): string {
  const bbox = `${lon - half},${lat - half},${lon + half},${lat + half}`;
  return `https://sdmdataaccess.sc.egov.usda.gov/Spatial/SDM.wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=mapunitpoly&SRS=EPSG:4326&BBOX=${bbox}&WIDTH=600&HEIGHT=600&FORMAT=image/png&STYLES=&TRANSPARENT=FALSE`;
}

function modisDate(d: Date): string {
  const doy = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000);
  return `A${d.getUTCFullYear()}${String(doy).padStart(3, "0")}`;
}

// Official query (ORNL DAAC, NASA) of MODIS NDVI at the point: the last 10 available composites.
export function ndviUrl(lat: number, lon: number): string {
  const limit = new Date(Date.now() - 28 * 86400000);
  let c = new Date(Date.UTC(limit.getUTCFullYear(), 0, 1));
  while (new Date(c.getTime() + 16 * 86400000) <= limit) {
    c = new Date(c.getTime() + 16 * 86400000);
  }
  const start = new Date(c.getTime() - 9 * 16 * 86400000);
  const q = `latitude=${lat}&longitude=${lon}&band=250m_16_days_NDVI&startDate=${modisDate(start)}&endDate=${modisDate(c)}&kmAboveBelow=0&kmLeftRight=0`;
  return `https://modis.ornl.gov/rst/api/v1/MOD13Q1/subset?${q}`;
}

export type SourceKey = "power" | "cdl" | "ssurgo" | "ndvi" | "smap" | "imerg" | "nldas" | "srtm";

// NASA Earthdata sources: downloading requires an account, so we link each product's official page.
const EARTHDATA_PAGES = {
  smap: "https://nsidc.org/data/spl3smp_e/versions/6",
  imerg: "https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGDL_07/summary",
  nldas: "https://disc.gsfc.nasa.gov/datasets/NLDAS_NOAH0125_M_2.0/summary",
  srtm: "https://lpdaac.usgs.gov/products/srtmgl1v003/",
} as const;

export function sourceUrl(key: SourceKey, lat: number, lon: number): string {
  if (key === "smap" || key === "imerg" || key === "nldas" || key === "srtm") return EARTHDATA_PAGES[key];
  return key === "cdl" ? cdlUrl(lat, lon) : key === "ssurgo" ? ssurgoMapUrl(lat, lon) : key === "ndvi" ? ndviUrl(lat, lon) : powerUrl(lat, lon);
}

// Official FAO GAEZ v4 data viewer (suitability, season and actual harvests).
export function gaezUrl(): string {
  return "https://gaez.fao.org/pages/data-viewer";
}

// Official page (NOAA NCEI) for a GHCN-Daily station, for example a CoCoRaHS one (US1...).
export function stationUrl(id: string): string {
  return `https://www.ncei.noaa.gov/cdo-web/datasets/GHCND/stations/GHCND:${id}/detail`;
}

export const SOURCE_LABELS: Record<"es" | "en", Record<SourceKey | "gaez" | "cocorahs", string>> = {
  es: {
    gaez: "FAO GAEZ v4: visor oficial de datos agroecológicos (temas 2, 4 y 5)",
    cocorahs: "CoCoRaHS en GHCN-Daily (NOAA NCEI): ficha oficial de la estación con sus datos diarios",
    power: "NASA POWER (página oficial): punto, fechas y parámetros ya cargados; pulsa Submit para ver o descargar",
    cdl: "CDL (USDA NASS): imagen oficial de la capa 2025 en este punto",
    ssurgo: "SSURGO (USDA NRCS): mapa oficial de unidades de suelo en este punto",
    ndvi: "NDVI MODIS (ORNL DAAC, NASA): consulta oficial del punto con los últimos compuestos",
    smap: "SMAP (NASA, NSIDC): ficha oficial del producto de humedad del suelo de 9 km",
    imerg: "GPM IMERG Late (NASA, GES DISC): ficha oficial de la lluvia diaria por satélite",
    nldas: "NLDAS-2 Noah (NASA, GES DISC): ficha oficial del balance de agua mensual",
    srtm: "SRTM (NASA, LP DAAC): ficha oficial del modelo de elevación de 30 m",
  },
  en: {
    gaez: "FAO GAEZ v4: official agro-ecological data viewer (themes 2, 4 and 5)",
    cocorahs: "CoCoRaHS in GHCN-Daily (NOAA NCEI): official station page with its daily data",
    power: "NASA POWER (official page): point, dates and parameters preloaded; press Submit to view or download",
    cdl: "CDL (USDA NASS): official image of the 2025 layer at this point",
    ssurgo: "SSURGO (USDA NRCS): official soil map units at this point",
    ndvi: "MODIS NDVI (ORNL DAAC, NASA): official point query with the latest composites",
    smap: "SMAP (NASA, NSIDC): official page for the 9 km soil moisture product",
    imerg: "GPM IMERG Late (NASA, GES DISC): official page for daily satellite rainfall",
    nldas: "NLDAS-2 Noah (NASA, GES DISC): official page for the monthly water balance",
    srtm: "SRTM (NASA, LP DAAC): official page for the 30 m elevation model",
  },
};
