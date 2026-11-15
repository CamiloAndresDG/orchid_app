// Enlaces oficiales que reproducen exactamente la consulta que hizo la app.

// Pagina oficial (Data Access Viewer) con el punto, las fechas y los parametros ya cargados.
// El visor llena el formulario; la persona solo pulsa "Submit" para graficar o descargar.
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

// Datos crudos (JSON) de la misma consulta que usa el analisis base.
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

// Promedio mensual 2015-2024 que usa el indice de vulnerabilidad, en la pagina oficial.
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

// Consulta oficial (ORNL DAAC, NASA) del NDVI MODIS en el punto: los ultimos 10 compuestos disponibles.
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

export type SourceKey = "power" | "cdl" | "ssurgo" | "ndvi";

export function sourceUrl(key: SourceKey, lat: number, lon: number): string {
  return key === "cdl" ? cdlUrl(lat, lon) : key === "ssurgo" ? ssurgoMapUrl(lat, lon) : key === "ndvi" ? ndviUrl(lat, lon) : powerUrl(lat, lon);
}

// Visor oficial de datos de FAO GAEZ v4 (idoneidad, temporada y cosechas reales).
export function gaezUrl(): string {
  return "https://gaez.fao.org/pages/data-viewer";
}

// Ficha oficial (NOAA NCEI) de una estacion GHCN-Daily, por ejemplo una de CoCoRaHS (US1...).
export function stationUrl(id: string): string {
  return `https://www.ncei.noaa.gov/cdo-web/datasets/GHCND/stations/GHCND:${id}/detail`;
}

export const SOURCE_LABEL: Record<SourceKey | "gaez" | "cocorahs", string> = {
  gaez: "FAO GAEZ v4: visor oficial de datos agroecológicos (temas 2, 4 y 5)",
  cocorahs: "CoCoRaHS en GHCN-Daily (NOAA NCEI): ficha oficial de la estación con sus datos diarios",
  power: "NASA POWER (página oficial): punto, fechas y parámetros ya cargados; pulsa Submit para ver o descargar",
  cdl: "CDL (USDA NASS): imagen oficial de la capa 2025 en este punto",
  ssurgo: "SSURGO (USDA NRCS): mapa oficial de unidades de suelo en este punto",
  ndvi: "NDVI MODIS (ORNL DAAC, NASA): consulta oficial del punto con los últimos compuestos",
};
