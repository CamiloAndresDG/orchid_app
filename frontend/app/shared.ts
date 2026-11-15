export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const CROP_NAMES: Record<"es" | "en", Record<string, string>> = {
  es: {
    corn: "Maíz",
    soybean: "Soja",
    wheat: "Trigo de invierno",
    sorghum: "Sorgo",
    sunflower: "Girasol",
    oats: "Avena",
    cereal_rye: "Centeno de cobertura",
    clover: "Trébol de cobertura",
    fallow: "Barbecho (sin cultivo)",
    other: "Otro cultivo",
  },
  en: {
    corn: "Corn",
    soybean: "Soybeans",
    wheat: "Winter wheat",
    sorghum: "Sorghum",
    sunflower: "Sunflower",
    oats: "Oats",
    cereal_rye: "Cereal rye cover",
    clover: "Clover cover",
    fallow: "Fallow (no crop)",
    other: "Other crop",
  },
};

// Otras clases del mapa de cultivos (CDL) que se ven alrededor del terreno pero no son cultivos de Orchid.
export const LAND_NAMES: Record<"es" | "en", Record<string, string>> = {
  es: { pastizal: "pastizal", "alfalfa/heno": "alfalfa/heno", barbecho: "barbecho", algodon: "algodón", arroz: "arroz" },
  en: { pastizal: "grassland", "alfalfa/heno": "alfalfa/hay", barbecho: "fallow", algodon: "cotton", arroz: "rice" },
};

export const ECON_CROPS = ["corn", "soybean", "wheat", "sorghum", "sunflower", "oats", "cereal_rye", "clover"];
export const COVER_CROPS = ["cereal_rye", "clover"];

export const MONTHS: Record<"es" | "en", string[]> = {
  es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

export type HistoryRow = { crop: string; plant_year: number; plant_month: number; harvest_year: number; harvest_month: number };

// Precios y costos en las unidades del campo de EE. UU.
export type EconUS = { yield: string; price: string; cost: string };

export const HA_PER_ACRE = 0.404686;
const KG_PER_CWT = 45.3592;

// Unidad de rinde, kg por unidad de rinde, unidad de precio y kg por unidad de precio.
export const US_UNITS: Record<string, { yieldUnit: string; kgPerYield: number; priceUnit: string; kgPerPrice: number }> = {
  corn: { yieldUnit: "bu/acre", kgPerYield: 25.401, priceUnit: "$/bu", kgPerPrice: 25.401 },
  soybean: { yieldUnit: "bu/acre", kgPerYield: 27.216, priceUnit: "$/bu", kgPerPrice: 27.216 },
  wheat: { yieldUnit: "bu/acre", kgPerYield: 27.216, priceUnit: "$/bu", kgPerPrice: 27.216 },
  oats: { yieldUnit: "bu/acre", kgPerYield: 14.515, priceUnit: "$/bu", kgPerPrice: 14.515 },
  sorghum: { yieldUnit: "bu/acre", kgPerYield: 25.401, priceUnit: "$/cwt", kgPerPrice: KG_PER_CWT },
  sunflower: { yieldUnit: "lb/acre", kgPerYield: 0.45359, priceUnit: "$/cwt", kgPerPrice: KG_PER_CWT },
};

const num = (v: string | undefined) => (v === undefined || v.trim() === "" || isNaN(parseFloat(v)) ? null : parseFloat(v));

/** Convierte lo que escribe el agricultor (EE. UU.) a lo que usa el motor: t/ha, $/t y $/ha. */
export function toMetric(crop: string, e: EconUS) {
  const cost = num(e.cost);
  const u = US_UNITS[crop];
  const y = num(e.yield);
  const p = num(e.price);
  return {
    yield_per_ha: u && y !== null ? (y * u.kgPerYield) / 1000 / HA_PER_ACRE : null,
    price_per_unit: u && p !== null ? p * (1000 / u.kgPerPrice) : null,
    cost_per_ha: cost !== null ? cost / HA_PER_ACRE : null,
  };
}

export const hasEcon = (e?: EconUS) => !!e && [e.yield, e.price, e.cost].some((v) => v && v.trim() !== "");
