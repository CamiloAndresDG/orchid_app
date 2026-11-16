"use client";

// ETL sources (backend/app/etl): FAO GAEZ v4 (season, suitability and actual harvests) and
// CoCoRaHS rain stations (NOAA) compared with NASA POWER.

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ExternalIcon } from "./icons";
import { HA_PER_ACRE, MONTHS, US_UNITS } from "./shared";
import { SOURCE_LABELS, gaezUrl, stationUrl } from "./sources";
import { Lang, fmtNum, langHeaders, useLang } from "./i18n";

const T = {
  es: {
    part: ["principios", "mediados", "finales"],
    doy: (part: string, m: string) => `${part} de ${m}`,
    off: "No pudimos consultar esta fuente ahora. Vuelve a marcar el terreno para intentarlo otra vez.",
    checking: "Consultando…",
    slow: " la primera vez tarda hasta un minuto.",
    seasonTitle: "Tu temporada de cultivo",
    avg30: "Promedio de 30 años (1981 a 2010) para tu zona.",
    growDays: "Días para crecer",
    perYear: (n: string) => `${n} días al año`,
    since: (d: string) => `, desde ${d}`,
    growNote: "Días con temperatura y humedad suficientes para que un cultivo crezca.",
    frost: "Días con helada",
    frostN: (n: string) => `${n} al año`,
    frostNote: "(mínima bajo 32 °F)",
    heat: "Días de calor fuerte",
    heatNote: "(máxima sobre 95 °F)",
    rainYear: "Lluvia al año",
    enough: "¿Alcanza la lluvia?",
    enoughW: ["Sí, sobra", "Casi alcanza", "Se queda corta", "Falta mucha agua"],
    pPet: (p: string) => `La lluvia cubre el ${p}% del agua que el calor y el viento sacarían del campo en el año.`,
    gdd: "Calor acumulado",
    gddV: (f: string) => `${f} grados-día °F`,
    gddNote: (c: string) => `(base 41 °F; ${c} en °C)`,
    seeGaez: "Ver en el visor de la FAO (GAEZ)",
    index: (label: string, v: string) => `${label}: índice ${v} de 10.000`,
    noData: "sin dato",
    fitTitle: "Qué cultivos se dan bien aquí, según la FAO",
    fitLead: "Junta el clima de 30 años, el suelo y el relieve de tu zona, con buen manejo y fertilización.",
    fitIrr: "Como tienes riego, mira las dos columnas.",
    fitDry: "Sin riego, la columna que te importa es «Solo lluvia».",
    rainOnly: "Solo lluvia",
    irrigated: "Con riego",
    othersOk: (list: string) => `Otros cultivos que se darían bien sin riego: ${list}.`,
    seeAll: (n: number) => `Ver los ${n} cultivos con su rendimiento posible`,
    crop: "Cultivo",
    dryMatter: "(materia seca)",
    fitNote: "Índice de idoneidad de 0 a 10.000 agrupado en las clases de la FAO. Con riego se muestra el mejor sistema (goteo, aspersión o gravedad).",
    harvTitle: "Cuánto se cosechaba en tu zona",
    harvLead: (y: number) => `Área cosechada y rendimiento real en ${y}, en un cuadro de unos 6 por 6 millas alrededor de tu terreno.`,
    yieldW: "rinde",
    irrShare: (p: string) => `${p}% con riego`,
    harvNote: "Sirve para comparar tu rinde con el de la zona. Son datos de 2010: el rinde actual suele ser algo mayor.",
    agree: ["coincide bien", "coincide más o menos", "coincide poco"],
    rainTitle: "Lluvia medida por tus vecinos",
    rainLead: (y: number, n: number, mi: string) =>
      `Voluntarios de la red CoCoRaHS miden la lluvia con un pluviómetro cada mañana. En ${y} hubo ${n} a menos de ${mi} millas`,
    nearest: (mi: string) => ` (la más cercana a ${mi} millas)`,
    rainCmp: "La lluvia que estima la NASA para tu terreno ",
    rainCmp2: (a: string, b: string) => ` con lo que midieron: ${a} in en el año según ellos y ${b} in según la NASA.`,
    neighbors: "Vecinos",
    rainNote:
      "Lluvia de cada mes, promedio de las estaciones que reportaron al menos 8 de cada 10 días. Si la NASA y tus vecinos coinciden, puedes confiar más en el clima que usamos para las sugerencias.",
    station: "Estación",
  },
  en: {
    part: ["early", "mid", "late"],
    doy: (part: string, m: string) => `${part} ${m}`,
    off: "We couldn't query this source right now. Mark your field again to retry.",
    checking: "Checking…",
    slow: " the first time it can take up to a minute.",
    seasonTitle: "Your growing season",
    avg30: "30-year average (1981 to 2010) for your area.",
    growDays: "Growing days",
    perYear: (n: string) => `${n} days a year`,
    since: (d: string) => `, starting ${d}`,
    growNote: "Days with enough warmth and moisture for a crop to grow.",
    frost: "Frost days",
    frostN: (n: string) => `${n} a year`,
    frostNote: "(low below 32 °F)",
    heat: "Very hot days",
    heatNote: "(high above 95 °F)",
    rainYear: "Rain per year",
    enough: "Is the rain enough?",
    enoughW: ["Yes, plenty", "Almost enough", "Falls short", "Far too little water"],
    pPet: (p: string) => `Rain covers ${p}% of the water that heat and wind would draw from the field over the year.`,
    gdd: "Accumulated heat",
    gddV: (f: string) => `${f} °F growing degree days`,
    gddNote: (c: string) => `(base 41 °F; ${c} in °C)`,
    seeGaez: "See on the FAO viewer (GAEZ)",
    index: (label: string, v: string) => `${label}: index ${v} of 10,000`,
    noData: "no data",
    fitTitle: "Which crops do well here, according to FAO",
    fitLead: "It combines 30 years of climate with your area's soil and terrain, assuming good management and fertilization.",
    fitIrr: "Since you irrigate, look at both columns.",
    fitDry: "Without irrigation, the column that matters is “Rain only”.",
    rainOnly: "Rain only",
    irrigated: "Irrigated",
    othersOk: (list: string) => `Other crops that would do well without irrigation: ${list}.`,
    seeAll: (n: number) => `See all ${n} crops with their attainable yield`,
    crop: "Crop",
    dryMatter: "(dry matter)",
    fitNote: "Suitability index from 0 to 10,000 grouped into FAO classes. For irrigation the best system is shown (drip, sprinkler or gravity).",
    harvTitle: "How much was harvested in your area",
    harvLead: (y: number) => `Harvested area and actual yield in ${y}, in a square about 6 by 6 miles around your field.`,
    yieldW: "yield",
    irrShare: (p: string) => `${p}% irrigated`,
    harvNote: "Useful to compare your yield with the area's. This is 2010 data: current yields are usually somewhat higher.",
    agree: ["matches well", "roughly matches", "matches poorly"],
    rainTitle: "Rain measured by your neighbors",
    rainLead: (y: number, n: number, mi: string) =>
      `CoCoRaHS volunteers measure rain with a gauge every morning. In ${y} there were ${n} within ${mi} miles`,
    nearest: (mi: string) => ` (the nearest ${mi} miles away)`,
    rainCmp: "The rain NASA estimates for your field ",
    rainCmp2: (a: string, b: string) => ` what they measured: ${a} in for the year by their count and ${b} in by NASA's.`,
    neighbors: "Neighbors",
    rainNote:
      "Rain each month, averaged over stations that reported at least 8 of every 10 days. If NASA and your neighbors agree, you can trust the climate we use for the suggestions more.",
    station: "Station",
  },
};

// GAEZ names are in English: shown as is in English.
const cropName = (c: string, l: Lang) => (l === "en" ? c : es(c));

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Point = { lat: number; lon: number };
type Regime = { suitability?: number; suitability_class?: string; attainable_yield?: number; yield_units?: string; water_deficit_mm?: number; irrigation_type?: string };
export type Suitability = { available: boolean; crops: { crop: string; secano: Regime; riego: Regime }[]; note: string; source: string };
export type Growing = { available: boolean; highlights: Partial<Record<string, number>>; note: string; source: string };
type Yields = { area_kha?: number; production_kt?: number; yield_t_ha?: number };
export type Actual = { available: boolean; year: number; crops: { crop: string; area_ha: number; irrigated_share: number | null; total: Yields }[]; note: string; source: string };
export type Rain = {
  available: boolean;
  year: number;
  radius_km: number;
  stations: { id: string; distance_km: number; complete_months: number; annual_mm: number | null }[];
  months: { month: number; stations_mm: number | null; n_stations: number; power_mm: number | null }[];
  summary: { months_compared: number; correlation: number; bias_mm: number; stations_total_mm: number; power_total_mm: number } | null;
  note: string;
};
export type Agro = { suit: Suitability | null; grow: Growing | null; actual: Actual | null; rain: Rain | null };

// GAEZ names -> Spanish. Missing ones are shown as is.
const CROP_ES: Record<string, string> = {
  Maize: "Maíz", Soybean: "Soja", Wheat: "Trigo", Sorghum: "Sorgo", Sunflower: "Girasol", Oat: "Avena", Rye: "Centeno",
  Barley: "Cebada", Alfalfa: "Alfalfa", "Dry pea": "Arveja seca", Chickpea: "Garbanzo", "Phaseolus bean": "Frijol", Flax: "Lino",
  Rapeseed: "Colza (canola)", Cotton: "Algodón", Sugarbeet: "Remolacha azucarera", Sugarcane: "Caña de azúcar", "White potato": "Papa",
  "Sweet potato": "Camote", "Potato and sweet potato": "Papa y camote", Onion: "Cebolla", Cabbage: "Repollo", Carrot: "Zanahoria",
  Tomato: "Tomate", Tobacco: "Tabaco", Buckwheat: "Trigo sarraceno", "Foxtail millet": "Mijo cola de zorra", "Pearl millet": "Mijo perla",
  Millet: "Mijo", "Wetland rice": "Arroz inundado", "Dryland rice": "Arroz de secano", Groundnut: "Maní", Cassava: "Yuca",
  Switchgrass: "Pasto varilla", Miscanthus: "Miscanto", "Reed canary grass": "Alpiste forrajero", "Biomass sorghum": "Sorgo para biomasa",
  "Napier grass": "Pasto elefante", Cowpea: "Caupí", Gram: "Gram", Pigeonpea: "Guandú", Yam: "Ñame", Banana: "Plátano",
  Citrus: "Cítricos", Olive: "Olivo", Coffee: "Café", Cocoa: "Cacao", Tea: "Té", Coconut: "Coco", "Oil palm": "Palma de aceite",
  Rubber: "Caucho", Jatropha: "Jatrofa", Pulses: "Legumbres", Vegetables: "Hortalizas", "Fruits and nuts": "Frutas y nueces",
  "Other cereals": "Otros cereales", "Fodder crops": "Forrajes", "Yams and other roots": "Ñame y otras raíces", Stimulants: "Estimulantes",
  "Rest of crops": "Otros cultivos", "Oil seeds": "Oleaginosas",
};
const es = (c: string) => CROP_ES[c] ?? c;
// Crops ORCHID handles, in display order.
const MAIN = ["Maize", "Soybean", "Wheat", "Sorghum", "Sunflower", "Oat", "Rye", "Barley", "Alfalfa"];
// GAEZ crop -> U.S. units key (shared.ts)
const US_KEY: Record<string, string> = { Maize: "corn", Soybean: "soybean", Wheat: "wheat", Sorghum: "sorghum", Sunflower: "sunflower", Oat: "oats" };

const toIn = (mm: number) => mm / 25.4;
const acres = (ha: number) => ha / HA_PER_ACRE;
const fmt = (n: number, d = 0) => fmtNum("es", n, d);

/** Yield in t/ha -> U.S. farm unit if the crop has one. */
function usYield(crop: string, tHa: number, l: Lang): string | null {
  const u = US_UNITS[US_KEY[crop]];
  if (!u) return null;
  return `${fmtNum(l, (tHa * 1000 * HA_PER_ACRE) / u.kgPerYield)} ${u.yieldUnit}`;
}

function dayOfYear(doy: number, l: Lang = "es"): string {
  const d = new Date(Date.UTC(2001, 0, Math.round(doy)));
  const i = d.getUTCDate() <= 10 ? 0 : d.getUTCDate() <= 20 ? 1 : 2;
  return T[l].doy(T[l].part[i], MONTHS[l][d.getUTCMonth()]);
}

export function useAgro(point: Point | null): Agro {
  const lang = useLang();
  const [suit, setSuit] = useState<Suitability | null>(null);
  const [grow, setGrow] = useState<Growing | null>(null);
  const [actual, setActual] = useState<Actual | null>(null);
  const [rain, setRain] = useState<Rain | null>(null);

  useEffect(() => {
    if (!point) return;
    const ctl = new AbortController();
    const post = (path: string) =>
      fetch(`${API}${path}`, { method: "POST", headers: langHeaders({ "content-type": "application/json" }), body: JSON.stringify(point), signal: ctl.signal }).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
      );
    const fail = (note: string) => ({ available: false, note });
    /* eslint-disable react-hooks/set-state-in-effect */
    setSuit(null);
    setGrow(null);
    setActual(null);
    setRain(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    const off = T[lang].off;
    post("/point/gaez/suitability").then(setSuit).catch((e) => e.name !== "AbortError" && setSuit({ ...fail(off), crops: [], source: "" }));
    post("/point/gaez/growing").then(setGrow).catch((e) => e.name !== "AbortError" && setGrow({ ...fail(off), highlights: {}, source: "" }));
    post("/point/gaez/actual").then(setActual).catch((e) => e.name !== "AbortError" && setActual({ ...fail(off), year: 2010, crops: [], source: "" }));
    post("/point/stations")
      .then(setRain)
      .catch((e) => e.name !== "AbortError" && setRain({ ...fail(off), year: 0, radius_km: 0, stations: [], months: [], summary: null }));
    return () => ctl.abort();
  }, [point, lang]);

  return { suit, grow, actual, rain };
}

/** Lines for the summary the AI assistant receives. */
export function agroBrief(a: Agro): string[] {
  const L: string[] = [];
  const h = a.grow?.available ? a.grow.highlights : null;
  if (h) {
    const parts = [
      h.growing_period_days !== undefined && `${h.growing_period_days} días de periodo de crecimiento`,
      h.growing_period_start_doy !== undefined && h.growing_period_start_doy > 0 && `que empieza hacia ${dayOfYear(h.growing_period_start_doy)}`,
      h.frost_days !== undefined && `${h.frost_days} días con helada al año`,
      h.heat_days_35 !== undefined && `${h.heat_days_35} días sobre 35 °C`,
      h.annual_precip_mm !== undefined && `lluvia anual ${h.annual_precip_mm} mm`,
      h.p_pet_pct !== undefined && `la lluvia cubre el ${h.p_pet_pct}% de la evaporación potencial`,
    ].filter(Boolean);
    L.push(`Temporada (FAO GAEZ, promedio 1981-2010): ${parts.join(", ")}.`);
  }
  if (a.suit?.available) {
    const main = MAIN.map((c) => a.suit!.crops.find((x) => x.crop === c)).filter((x) => !!x);
    if (main.length)
      L.push(
        `Idoneidad del clima y el suelo según la FAO (GAEZ, insumos altos), en secano / con riego: ${main
          .map((c) => `${es(c!.crop)} ${c!.secano.suitability_class ?? "sin dato"} / ${c!.riego.suitability_class ?? "sin dato"}`)
          .join("; ")}.`,
      );
  }
  if (a.actual?.available) {
    L.push(
      `Lo que se cosechaba en la zona en ${a.actual.year} (FAO GAEZ, pixel de ~9 km): ${a.actual.crops
        .slice(0, 5)
        .map((c) => `${es(c.crop)} ${fmt(acres(c.area_ha))} acres${c.total.yield_t_ha ? ` a ${c.total.yield_t_ha.toFixed(1)} t/ha` : ""}`)
        .join("; ")}.`,
    );
  }
  const s = a.rain?.available ? a.rain.summary : null;
  if (s)
    L.push(
      `Lluvia medida por estaciones CoCoRaHS cercanas en ${a.rain!.year}: ${s.stations_total_mm} mm en el año; NASA POWER estimó ${s.power_total_mm} mm (correlación mensual ${s.correlation}).`,
    );
  return L;
}

function Source({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title={title} className="inline-flex items-center gap-1 text-sm font-semibold text-moss underline">
      {children} <ExternalIcon />
    </a>
  );
}

const Loading = ({ slow }: { slow?: boolean }) => {
  const t = T[useLang()];
  return (
    <p className="mt-1 text-ink-soft">
      {t.checking}
      {slow && t.slow}
    </p>
  );
};

/* ----------------------------------- Season ------------------------------------- */

export function AboutSeason({ grow }: { grow: Growing | null }) {
  const l = useLang();
  const t = T[l];
  const fmt = (n: number, d = 0) => fmtNum(l, n, d);
  const h = grow?.available ? grow.highlights : null;
  const pPet = h?.p_pet_pct;
  return (
    <section>
      <h4 className="font-serif text-lg font-semibold">{t.seasonTitle}</h4>
      {!grow && <Loading />}
      {grow && !h && <p className="mt-1 text-ink-soft">{grow.note}</p>}
      {h && (
        <>
          <p className="mt-1 text-ink-soft">{t.avg30}</p>
          <dl className="mt-2 grid max-w-xl grid-cols-[11rem_1fr] gap-x-4 gap-y-3">
            {h.growing_period_days !== undefined && (
              <>
                <dt className="text-ink-soft">{t.growDays}</dt>
                <dd>
                  {t.perYear(fmt(h.growing_period_days))}
                  {h.growing_period_start_doy !== undefined &&
                    h.growing_period_start_doy > 0 &&
                    h.growing_period_days < 365 &&
                    t.since(dayOfYear(h.growing_period_start_doy, l))}
                  <span className="block text-sm text-ink-soft">{t.growNote}</span>
                </dd>
              </>
            )}
            {h.frost_days !== undefined && (
              <>
                <dt className="text-ink-soft">{t.frost}</dt>
                <dd>
                  {t.frostN(fmt(h.frost_days))} <span className="text-sm text-ink-soft">{t.frostNote}</span>
                </dd>
              </>
            )}
            {h.heat_days_35 !== undefined && (
              <>
                <dt className="text-ink-soft">{t.heat}</dt>
                <dd>
                  {t.frostN(fmt(h.heat_days_35))} <span className="text-sm text-ink-soft">{t.heatNote}</span>
                </dd>
              </>
            )}
            {h.annual_precip_mm !== undefined && (
              <>
                <dt className="text-ink-soft">{t.rainYear}</dt>
                <dd>
                  {fmt(toIn(h.annual_precip_mm), 1)} in <span className="text-sm text-ink-soft">({fmt(h.annual_precip_mm)} mm)</span>
                </dd>
              </>
            )}
            {pPet !== undefined && (
              <>
                <dt className="text-ink-soft">{t.enough}</dt>
                <dd>
                  {t.enoughW[pPet >= 100 ? 0 : pPet >= 75 ? 1 : pPet >= 50 ? 2 : 3]}
                  <span className="block text-sm text-ink-soft">{t.pPet(fmt(pPet))}</span>
                </dd>
              </>
            )}
            {h.degree_days_5 !== undefined && (
              <>
                <dt className="text-ink-soft">{t.gdd}</dt>
                <dd>
                  {t.gddV(fmt(h.degree_days_5 * 1.8))} <span className="text-sm text-ink-soft">{t.gddNote(fmt(h.degree_days_5))}</span>
                </dd>
              </>
            )}
          </dl>
        </>
      )}
      <p className="mt-2">
        <Source href={gaezUrl()} title={SOURCE_LABELS[l].gaez}>
          {t.seeGaez}
        </Source>
      </p>
    </section>
  );
}

/* --------------------------------- Suitability ---------------------------------- */

const CLASS_TONE: Record<string, string> = {
  "muy alta": "bg-moss", alta: "bg-moss", buena: "bg-moss/60", media: "bg-clay/50", moderada: "bg-clay/50", marginal: "bg-clay", "muy marginal": "bg-clay", "no apta": "bg-clay",
  "very high": "bg-moss", high: "bg-moss", good: "bg-moss/60", medium: "bg-clay/50", moderate: "bg-clay/50", "very marginal": "bg-clay", "not suitable": "bg-clay",
};

function FitBar({ r, label }: { r: Regime; label: string }) {
  const l = useLang();
  const t = T[l];
  const v = r.suitability ?? 0;
  return (
    <span className="grid grid-cols-[1fr_6.5rem] items-center gap-2" title={t.index(label, fmtNum(l, v))}>
      <span className="h-2.5 rounded-full bg-paper-deep">
        <span className={`block h-full rounded-full ${CLASS_TONE[r.suitability_class ?? ""] ?? "bg-rule"}`} style={{ width: `${Math.max(2, v / 100)}%` }} />
      </span>
      <span className="text-sm text-ink-soft">{r.suitability_class ?? t.noData}</span>
    </span>
  );
}

export function AboutFit({ suit, irrigated }: { suit: Suitability | null; irrigated: boolean }) {
  const l = useLang();
  const t = T[l];
  const fmt = (n: number, d = 0) => fmtNum(l, n, d);
  const crops = suit?.available ? suit.crops : [];
  const main = MAIN.map((c) => crops.find((x) => x.crop === c)).filter((x): x is Suitability["crops"][number] => !!x);
  const others = crops
    .filter((c) => !MAIN.includes(c.crop) && (c.secano.suitability ?? 0) >= 7000)
    .slice(0, 6)
    .map((c) => cropName(c.crop, l).toLowerCase());
  return (
    <section>
      <h4 className="font-serif text-lg font-semibold">{t.fitTitle}</h4>
      {!suit && <Loading />}
      {suit && !suit.available && <p className="mt-1 text-ink-soft">{suit.note}</p>}
      {main.length > 0 && (
        <>
          <p className="mt-1 text-ink-soft">
            {t.fitLead} {irrigated ? t.fitIrr : t.fitDry}
          </p>
          <div className="mt-3 max-w-xl">
            <div className="grid grid-cols-[8rem_1fr_1fr] gap-x-4 pb-1 text-sm text-ink-soft">
              <span />
              <span>{t.rainOnly}</span>
              <span>{t.irrigated}</span>
            </div>
            <ul className="space-y-2">
              {main.map((c) => (
                <li key={c.crop} className="grid grid-cols-[8rem_1fr_1fr] items-center gap-x-4">
                  <span>{cropName(c.crop, l)}</span>
                  <FitBar r={c.secano} label={t.rainOnly} />
                  <FitBar r={c.riego} label={t.irrigated} />
                </li>
              ))}
            </ul>
          </div>
          {others.length > 0 && <p className="mt-3 text-ink-soft">{t.othersOk(others.join(", "))}</p>}
          <details className="mt-2 text-sm text-ink-soft">
            <summary className="cursor-pointer text-moss underline">{t.seeAll(crops.length)}</summary>
            <table className="mt-2 w-full max-w-xl text-left">
              <thead>
                <tr className="border-b border-rule">
                  <th className="py-1 font-normal">{t.crop}</th>
                  <th className="py-1 font-normal">{t.rainOnly}</th>
                  <th className="py-1 font-normal">{t.irrigated}</th>
                </tr>
              </thead>
              <tbody>
                {crops.map((c) => (
                  <tr key={c.crop} className="border-b border-rule/60">
                    <td className="py-1 text-ink">{cropName(c.crop, l)}</td>
                    {[c.secano, c.riego].map((r, i) => (
                      <td key={i} className="py-1">
                        {r.suitability_class ?? "—"}
                        {r.attainable_yield ? <span className="block">{fmt(r.attainable_yield / 1000, 1)} t/ha {r.yield_units?.includes("DW") ? t.dryMatter : `(${r.yield_units})`}</span> : null}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2">{t.fitNote}</p>
          </details>
        </>
      )}
      <p className="mt-2">
        <Source href={gaezUrl()} title={SOURCE_LABELS[l].gaez}>
          {t.seeGaez}
        </Source>
      </p>
    </section>
  );
}

/* ------------------------------- Actual harvests -------------------------------- */

export function AboutHarvests({ actual }: { actual: Actual | null }) {
  const l = useLang();
  const tx = T[l];
  const fmt = (n: number, d = 0) => fmtNum(l, n, d);
  const crops = actual?.available ? actual.crops.slice(0, 6) : [];
  return (
    <section>
      <h4 className="font-serif text-lg font-semibold">{tx.harvTitle}</h4>
      {!actual && <Loading />}
      {actual && !actual.available && <p className="mt-1 text-ink-soft">{actual.note}</p>}
      {crops.length > 0 && (
        <>
          <p className="mt-1 text-ink-soft">{tx.harvLead(actual!.year)}</p>
          <dl className="mt-2 grid max-w-xl grid-cols-[11rem_1fr] gap-x-4 gap-y-3">
            {crops.map((c) => {
              const t = c.total.yield_t_ha;
              const us = t ? usYield(c.crop, t, l) : null;
              return (
                <div key={c.crop} className="contents">
                  <dt className="text-ink-soft">{cropName(c.crop, l)}</dt>
                  <dd>
                    {fmt(acres(c.area_ha))} acres
                    {t !== undefined && (
                      <>
                        {" "}
                        · {tx.yieldW} {us ?? `${fmt(t, 1)} t/ha`}
                        {us && <span className="text-sm text-ink-soft"> ({fmt(t, 1)} t/ha)</span>}
                      </>
                    )}
                    {c.irrigated_share !== null && c.irrigated_share >= 0.05 && (
                      <span className="block text-sm text-ink-soft">{tx.irrShare(fmt(c.irrigated_share * 100))}</span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
          <p className="mt-2 text-sm text-ink-soft">{tx.harvNote}</p>
        </>
      )}
      <p className="mt-2">
        <Source href={gaezUrl()} title={SOURCE_LABELS[l].gaez}>
          {tx.seeGaez}
        </Source>
      </p>
    </section>
  );
}

/* --------------------------------- Station rain --------------------------------- */

export function AboutRain({ rain }: { rain: Rain | null }) {
  const l = useLang();
  const t = T[l];
  const fmt = (n: number, d = 0) => fmtNum(l, n, d);
  const s = rain?.available ? rain.summary : null;
  const data = (rain?.months ?? []).map((m) => ({
    mes: MONTHS[l][m.month - 1].slice(0, 3),
    near: m.stations_mm === null ? null : +toIn(m.stations_mm).toFixed(2),
    power: m.power_mm === null ? null : +toIn(m.power_mm).toFixed(2),
  }));
  const near = rain?.stations[0];
  const agree = s ? t.agree[s.correlation >= 0.85 ? 0 : s.correlation >= 0.6 ? 1 : 2] : "";
  return (
    <section>
      <h4 className="font-serif text-lg font-semibold">{t.rainTitle}</h4>
      {!rain && <Loading slow />}
      {rain && !rain.available && <p className="mt-1 text-ink-soft">{rain.note}</p>}
      {rain?.available && (
        <>
          <p className="mt-1 text-ink-soft">
            {t.rainLead(rain.year, rain.stations.length, fmt(rain.radius_km / 1.609))}
            {near && t.nearest(fmt(near.distance_km / 1.609, 1))}.
            {s && (
              <>
                {" "}
                {t.rainCmp}
                <strong className="text-ink">{agree}</strong>
                {t.rainCmp2(fmt(toIn(s.stations_total_mm), 1), fmt(toIn(s.power_total_mm), 1))}
              </>
            )}
          </p>
          <div className="mt-3 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--rule)" vertical={false} />
                <XAxis dataKey="mes" stroke="var(--ink-soft)" fontSize={12} />
                <YAxis stroke="var(--ink-soft)" fontSize={12} width={32} unit=" in" />
                <Tooltip contentStyle={{ background: "var(--paper)", border: "1px solid var(--rule)", color: "var(--ink)" }} formatter={(v) => [`${v} in`]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="near" name={t.neighbors} fill="var(--moss)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="power" name="NASA POWER" fill="var(--clay)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            {t.rainNote}
          </p>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {rain.stations
              .filter((st) => st.complete_months > 0)
              .slice(0, 3)
              .map((st) => (
                <Source key={st.id} href={stationUrl(st.id)} title={SOURCE_LABELS[l].cocorahs}>
                  {t.station} {st.id}
                </Source>
              ))}
          </p>
        </>
      )}
    </section>
  );
}
