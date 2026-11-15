"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ClimaExplorer } from "./climate";
import { ChevronIcon, ExternalIcon, ShieldIcon } from "./icons";
import { Lang, useLang } from "./i18n";
import { MONTHS as MONTH_NAMES } from "./shared";
import { SOURCE_LABELS, powerUrl } from "./sources";

export const MONTHS_SHORT: Record<Lang, string[]> = {
  es: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

const T = {
  es: {
    and: "y",
    yourField: "tu terreno",
    example: "ejemplo",
    official: "Ver dato oficial",
    currentRat: (bare: number) => `Es lo que se siembra hoy en la zona. Deja el suelo sin cultivo ${bare} ${bare === 1 ? "mes" : "meses"} al año.`,
    coverRat: "Añade una cobertura para los meses en que hoy el suelo queda sin cultivo.",
    longRat: "Alarga la rotación para cortar ciclos de plagas y malezas. No cambia los meses sin cultivo.",
    hardMonthsHere: "Los meses más difíciles del clima aquí son",
    current: "lo que se siembra hoy",
    pros: "Ventajas",
    careful: "Ten cuidado con",
    whereFrom: "¿De dónde sale esto?",
    notQueried: "(no consultado en este ejemplo)",
    missing: "Falta saber:",
    rulesNote: "Ventajas y riesgos son reglas que escribimos nosotros; todavía no las ha revisado un agrónomo de la zona.",
    climateOf: "Clima de",
    climateLead: "Lluvia, temperatura y humedad del suelo medidas por la NASA en tu punto.",
    clickOther: "Haz clic en otro lugar del mapa para ver otro punto.",
    avgTitle: "Cómo es cada mes, en promedio",
    avgLead: (y0: number, y1: number) => `Promedio de ${y0} a ${y1}. En terracota, los meses más difíciles.`,
    seePower: "Ver en NASA POWER",
    month: "Mes",
    meaning: "Qué significa cada dato",
    nasaName: (tech: string) => `En la página de la NASA se llama ${tech} y viene en unidades métricas.`,
    vars: {
      precip_mm_day: { title: "Lluvia del mes", unit: "pulgadas", what: "Cuánta agua cae en el mes. Si cae fuera de la siembra o del crecimiento, el cultivo no la aprovecha." },
      temp_c: { title: "Temperatura media", unit: "°F", what: "Temperatura media del aire. Con más calor el suelo pierde agua más rápido y el cultivo se estresa." },
      soil_wetness: { title: "Suelo", unit: "seco, medio o húmedo", what: "Agua que hay donde están las raíces. Es la reserva que aguanta las semanas sin lluvia." },
    },
    dry: "seco",
    mid: "medio",
    wet: "húmedo",
    hardIn: "Meses difíciles en",
    hardLead: "Cada mes recibe una nota de 0 a 1 según su calor, lo seco del suelo y la falta de lluvia. Más alta, más difícil para un cultivo sin riego. Los más difíciles aquí son",
    heat: "Calor",
    drySoil: "Suelo seco",
    lowRain: "Poca lluvia",
    bareTitle: "Cuándo queda el suelo sin cultivo",
    bareLead: (crops: string) => `Con la rotación de hoy (${crops}), según un calendario típico. Si un mes difícil cae sin cultivo, ahí ayuda una cobertura.`,
    bare: "sin cultivo",
    cropped: "con cultivo",
    hardMonth: "mes difícil",
    bareLegend: "Verde: con cultivo. Blanco: sin cultivo. Contorno terracota: mes difícil.",
    howScore: "Cómo calculamos la nota",
    scoreText: (h: number, d: number, r: number) =>
      `Sumamos ${h}% del calor del mes, ${d}% de lo seco del suelo y ${r}% de la falta de lluvia, comparando cada mes con los demás del mismo lugar. Los datos de clima son de la NASA; la fórmula y sus pesos los elegimos nosotros. No predice cosechas.`,
    seeClimate: "Ver los datos de clima",
    srcTitle: "De dónde salen los datos",
    srcLead: (live: number, pending: number) =>
      `Todo lo que mostramos viene de fuentes públicas (NASA, USDA, FAO y una red de pluviómetros voluntarios) y lo puedes comprobar en su sitio oficial. Usamos ${live} fuentes${pending > 0 ? `; ${pending} más están pendientes y no las mostramos como si las tuviéramos` : ""}. Las recomendaciones combinan esos datos con reglas que escribimos nosotros: están explicadas en el informe completo.`,
    used: "Las que usamos",
    pending: "Pendientes",
    site: "Sitio oficial",
    disclaimer: "Herramienta de apoyo a la decisión. Valida siempre con un experto local.",
    crops: { wheat: "trigo", corn: "maíz", soybean: "soja", sorghum: "sorgo" } as Record<string, string>,
  },
  en: {
    and: "and",
    yourField: "your field",
    example: "example",
    official: "See official data",
    currentRat: (bare: number) => `It's what is planted in the area today. It leaves the soil bare ${bare} ${bare === 1 ? "month" : "months"} a year.`,
    coverRat: "Adds a cover crop for the months when the soil is bare today.",
    longRat: "Lengthens the rotation to break pest and weed cycles. It doesn't change the bare months.",
    hardMonthsHere: "The hardest months for the weather here are",
    current: "what's planted today",
    pros: "Benefits",
    careful: "Watch out for",
    whereFrom: "Where does this come from?",
    notQueried: "(not queried in this example)",
    missing: "Still unknown:",
    rulesNote: "Benefits and risks are rules we wrote ourselves; a local agronomist hasn't reviewed them yet.",
    climateOf: "Climate of",
    climateLead: "Rain, temperature and soil moisture measured by NASA at your spot.",
    clickOther: "Click elsewhere on the map to see another spot.",
    avgTitle: "What each month is like, on average",
    avgLead: (y0: number, y1: number) => `Average from ${y0} to ${y1}. The hardest months are in terracotta.`,
    seePower: "See on NASA POWER",
    month: "Month",
    meaning: "What each figure means",
    nasaName: (tech: string) => `On the NASA page it's called ${tech} and comes in metric units.`,
    vars: {
      precip_mm_day: { title: "Monthly rain", unit: "inches", what: "How much water falls in the month. If it falls outside planting or growth, the crop can't use it." },
      temp_c: { title: "Average temperature", unit: "°F", what: "Average air temperature. With more heat the soil loses water faster and the crop gets stressed." },
      soil_wetness: { title: "Soil", unit: "dry, medium or wet", what: "Water where the roots are. It's the reserve that carries the crop through weeks without rain." },
    },
    dry: "dry",
    mid: "medium",
    wet: "wet",
    hardIn: "Hard months in",
    hardLead: "Each month gets a score from 0 to 1 based on its heat, how dry the soil is and the lack of rain. Higher means harder for a crop without irrigation. The hardest here are",
    heat: "Heat",
    drySoil: "Dry soil",
    lowRain: "Little rain",
    bareTitle: "When the soil is left without a crop",
    bareLead: (crops: string) => `With today's rotation (${crops}), on a typical calendar. If a hard month falls with no crop, a cover crop helps there.`,
    bare: "no crop",
    cropped: "with crop",
    hardMonth: "hard month",
    bareLegend: "Green: with crop. White: no crop. Terracotta outline: hard month.",
    howScore: "How we calculate the score",
    scoreText: (h: number, d: number, r: number) =>
      `We add ${h}% of the month's heat, ${d}% of how dry the soil is and ${r}% of the lack of rain, comparing each month with the others at the same place. The climate data is from NASA; we chose the formula and its weights. It doesn't predict harvests.`,
    seeClimate: "See the climate data",
    srcTitle: "Where the data comes from",
    srcLead: (live: number, pending: number) =>
      `Everything we show comes from public sources (NASA, USDA, FAO and a volunteer rain-gauge network) and you can check it on their official site. We use ${live} sources${pending > 0 ? `; ${pending} more are pending and we don't show them as if we had them` : ""}. The recommendations combine that data with rules we wrote ourselves: they're explained in the full report.`,
    used: "The ones we use",
    pending: "Pending",
    site: "Official site",
    disclaimer: "Decision-support tool. Always check with a local expert.",
    crops: { wheat: "wheat", corn: "corn", soybean: "soybeans", sorghum: "sorghum" } as Record<string, string>,
  },
};

export type Zone = { id: string; name: string; lat: number; lon: number; focus: string; current_rotation: string[] };
export type Strategy = {
  id: string;
  name: string;
  sequence: string[];
  is_current: boolean;
  benefits: string[];
  risks: string[];
  evidence: string[];
  gaps: string[];
};
export type Month = {
  month: number;
  vulnerability: number;
  precip_mm_day: number;
  temp_c: number;
  soil_wetness: number;
  components: { heat: number; dryness: number; low_rain: number };
};
export type Analysis = {
  zone: Zone;
  months: Month[];
  most_vulnerable_months: number[];
  bare_soil_months: number[];
  strategies: Strategy[];
  method: {
    weights: { heat: number; dryness: number; low_rain: number };
    climate_period: [number, number];
    climate_parameters: string[];
    crop_months: Record<string, number[]>;
  };
  sources: string[];
  disclaimer: string;
};
export type TabId = "terreno" | "precios" | "estrategias" | "clima" | "vulnerabilidad" | "fuentes";

const tooltipStyle = { background: "var(--paper)", border: "1px solid var(--rule)", color: "var(--ink)" };
const monthList = (ms: number[], l: Lang) => {
  const n = [...ms].sort((a, b) => a - b).map((m) => MONTH_NAMES[l][m - 1]);
  return n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")} ${T[l].and} ${n[n.length - 1]}`;
};
const placeName = (d: Analysis, l: Lang) => (d.zone.id === "custom" ? T[l].yourField : `${d.zone.name} (${T[l].example})`);

function OfficialLink({ href, title, children }: { href: string; title?: string; children?: React.ReactNode }) {
  const t = T[useLang()];
  children ??= t.official;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title={title} className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-moss underline">
      {children} <ExternalIcon />
    </a>
  );
}

function Fold({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group border-t border-rule pt-5">
      <summary className="flex cursor-pointer items-center gap-2 font-serif text-lg font-semibold">
        <ChevronIcon className="size-5 text-moss transition-transform group-open:rotate-90" /> {title}
      </summary>
      <div className="mt-4 pl-7 text-base">{children}</div>
    </details>
  );
}

/* ------------------------------- Ejemplos -------------------------------- */

function rationale(s: Strategy, bare: number, l: Lang): string {
  if (s.is_current) return T[l].currentRat(bare);
  const covers = s.sequence.some((c) => ["cover_crop", "cereal_rye", "oats_clover"].includes(c));
  return covers ? T[l].coverRat : T[l].longRat;
}

export function EstrategiasPanel({ data }: { data: Analysis; go?: (t: TabId) => void }) {
  const l = useLang();
  const t = T[l];
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-serif text-2xl font-semibold">{data.zone.name}</h2>
        <p className="mt-1 max-w-prose text-base text-ink-soft">
          {data.zone.focus}. {t.hardMonthsHere} {monthList(data.most_vulnerable_months, l)}.
        </p>
      </div>
      {data.strategies.map((s) => (
        <section key={s.id} className="border-t border-rule pt-6">
          <h3 className="font-serif text-xl font-semibold">
            {s.name.replace(" (actual)", "").replace(" (current)", "")}
            {s.is_current && <span className="ml-3 align-middle font-sans text-sm font-normal text-ink-soft">{t.current}</span>}
          </h3>
          <p className="mt-1 text-base text-ink-soft">{rationale(s, data.bare_soil_months.length, l)}</p>
          <div className="mt-3 grid gap-4 text-base sm:grid-cols-2">
            <div>
              <p className="font-semibold text-ink">{t.pros}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-soft marker:text-moss">
                {s.benefits.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-semibold text-ink">{t.careful}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-soft marker:text-clay">
                {s.risks.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          </div>
          <details className="mt-3">
            <summary className="inline-flex cursor-pointer items-center gap-1.5 text-base text-moss hover:underline">
              <ShieldIcon className="size-5" /> {t.whereFrom}
            </summary>
            <ul className="mt-3 space-y-2 text-sm text-ink-soft">
              {s.evidence.map((e) => (
                <li key={e}>
                  {e}.{" "}
                  {e.includes("NASA POWER") ? (
                    <OfficialLink href={powerUrl(data.zone.lat, data.zone.lon)} title={SOURCE_LABELS[l].power} />
                  ) : (
                    <span className="text-ink-faint">{t.notQueried}</span>
                  )}
                </li>
              ))}
              {s.gaps.map((g) => (
                <li key={g}>
                  {t.missing} {g.toLowerCase()}.
                </li>
              ))}
            </ul>
          </details>
        </section>
      ))}
      <p className="text-sm text-ink-soft">{t.rulesNote}</p>
    </div>
  );
}

/* --------------------------------- Clima --------------------------------- */

const CLIMATE_VARS = [
  { key: "precip_mm_day" as const, max: 5, tech: "PRECTOTCORR" },
  { key: "temp_c" as const, max: 30, tech: "T2M" },
  { key: "soil_wetness" as const, max: 1, tech: "GWETROOT" },
];

function climateCell(key: "precip_mm_day" | "temp_c" | "soil_wetness", v: number, l: Lang) {
  if (key === "precip_mm_day") {
    const mm = v * 30.4;
    return { main: `${(mm / 25.4).toFixed(1)} in`, alt: `${mm.toFixed(0)} mm` };
  }
  if (key === "temp_c") return { main: `${((v * 9) / 5 + 32).toFixed(0)} °F`, alt: `${v.toFixed(0)} °C` };
  return { main: v < 0.35 ? T[l].dry : v < 0.55 ? T[l].mid : T[l].wet, alt: "" };
}

export function ClimaPanel({ data }: { data: Analysis }) {
  const l = useLang();
  const t = T[l];
  const crit = data.most_vulnerable_months;
  const [y0, y1] = data.method.climate_period;
  return (
    <div className="space-y-10">
      <div>
        <h2 className="font-serif text-2xl font-semibold">
          {t.climateOf} {placeName(data, l)}
        </h2>
        <p className="mt-1 max-w-prose text-base text-ink-soft">
          {t.climateLead} {data.zone.id === "custom" && t.clickOther}
        </p>
      </div>

      <ClimaExplorer lat={data.zone.lat} lon={data.zone.lon} />

      <section>
        <h3 className="font-serif text-xl font-semibold">{t.avgTitle}</h3>
        <p className="mt-1 text-base text-ink-soft">
          {t.avgLead(y0, y1)}{" "}
          <OfficialLink href={powerUrl(data.zone.lat, data.zone.lon)} title={SOURCE_LABELS[l].power}>
            {t.seePower}
          </OfficialLink>
        </p>
        <table className="mt-4 w-full text-base">
          <thead>
            <tr className="border-b border-rule text-left text-sm text-ink-soft">
              <th className="py-2 pr-3 font-semibold">{t.month}</th>
              {CLIMATE_VARS.map((v) => (
                <th key={v.key} className="py-2 pr-3 font-semibold">
                  {t.vars[v.key].title} <span className="font-normal">({t.vars[v.key].unit})</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.months.map((m) => (
              <tr key={m.month} className={`border-b border-rule/70 ${crit.includes(m.month) ? "text-clay" : ""}`}>
                <td className="py-2 pr-3 font-semibold capitalize">{MONTH_NAMES[l][m.month - 1]}</td>
                {CLIMATE_VARS.map((v) => (
                  <td key={v.key} className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="w-[4.5rem] tabular-nums">
                        {climateCell(v.key, m[v.key], l).main}
                        {climateCell(v.key, m[v.key], l).alt && <span className="block text-sm text-ink-soft">{climateCell(v.key, m[v.key], l).alt}</span>}
                      </span>
                      <span className="h-1.5 w-14 rounded-full bg-paper-deep">
                        <span className="block h-full rounded-full bg-current opacity-70" style={{ width: `${Math.max(3, Math.min(100, (m[v.key] / v.max) * 100))}%` }} />
                      </span>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <Fold title={t.meaning}>
        <dl className="space-y-4">
          {CLIMATE_VARS.map((v) => (
            <div key={v.key}>
              <dt className="font-semibold text-ink">{t.vars[v.key].title}</dt>
              <dd className="mt-0.5 max-w-prose text-ink-soft">
                {t.vars[v.key].what} <span className="text-sm text-ink-faint">{t.nasaName(v.tech)}</span>
              </dd>
            </div>
          ))}
        </dl>
      </Fold>
    </div>
  );
}

/* ---------------------------- Meses difíciles ---------------------------- */

export function VulnerabilidadPanel({ data }: { data: Analysis }) {
  const l = useLang();
  const t = T[l];
  const w = data.method.weights;
  const crit = data.most_vulnerable_months;
  const rows = data.months.map((m) => ({
    name: MONTHS_SHORT[l][m.month - 1],
    heat: +(m.components.heat * w.heat).toFixed(3),
    dry: +(m.components.dryness * w.dryness).toFixed(3),
    rain: +(m.components.low_rain * w.low_rain).toFixed(3),
  }));
  const crops = Object.keys(data.method.crop_months);
  const showCalendar = data.zone.id !== "custom" && crops.length > 0;

  return (
    <div className="space-y-10">
      <div>
        <h2 className="font-serif text-2xl font-semibold">
          {t.hardIn} {placeName(data, l)}
        </h2>
        <p className="mt-1 max-w-prose text-base text-ink-soft">
          {t.hardLead} <strong className="text-clay">{monthList(crit, l)}</strong>.
        </p>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--rule)" vertical={false} />
            <XAxis dataKey="name" stroke="var(--ink-soft)" fontSize={12} />
            <YAxis domain={[0, 1]} stroke="var(--ink-soft)" fontSize={12} width={32} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 14 }} />
            <Bar dataKey="heat" name={t.heat} stackId="v" fill="var(--clay)" />
            <Bar dataKey="dry" name={t.drySoil} stackId="v" fill="var(--moss)" />
            <Bar dataKey="rain" name={t.lowRain} stackId="v" fill="var(--field)" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {showCalendar && (
        <section>
          <h3 className="font-serif text-xl font-semibold">{t.bareTitle}</h3>
          <p className="mt-1 max-w-prose text-base text-ink-soft">{t.bareLead(crops.map((c) => t.crops[c] ?? c).join(", "))}</p>
          <div className="mt-4 grid grid-cols-12 gap-1.5 text-center text-sm">
            {data.months.map((m) => {
              const bare = data.bare_soil_months.includes(m.month);
              const isCrit = crit.includes(m.month);
              return (
                <div
                  key={m.month}
                  className={`rounded-md py-2.5 ${bare ? "border border-field text-ink" : "bg-moss text-paper"} ${isCrit ? "outline-2 outline-offset-2 outline-clay" : ""}`}
                  title={`${MONTH_NAMES[l][m.month - 1]}: ${bare ? t.bare : t.cropped}${isCrit ? `, ${t.hardMonth}` : ""}`}
                >
                  {MONTHS_SHORT[l][m.month - 1]}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-sm text-ink-soft">{t.bareLegend}</p>
        </section>
      )}

      <Fold title={t.howScore}>
        <p className="max-w-prose text-ink-soft">
          {t.scoreText(w.heat * 100, w.dryness * 100, w.low_rain * 100)}{" "}
          <OfficialLink href={powerUrl(data.zone.lat, data.zone.lon)} title={SOURCE_LABELS[l].power}>
            {t.seeClimate}
          </OfficialLink>
        </p>
      </Fold>
    </div>
  );
}

/* ----------------------------- De dónde salen ----------------------------- */

type Src = { topic: string; name: string; live: boolean; what: string; use: string; site: string };

// Fuente unica de verdad sobre que esta conectado.
const SOURCES_EN: Src[] = [
  { topic: "Climate", name: "NASA POWER", live: true, what: "Rain, temperature and soil moisture for any point, since 1981.", use: "Hard months, climate by date and water risk for each option.", site: "https://power.larc.nasa.gov/data-access-viewer/" },
  { topic: "Field greenness", name: "MODIS · NASA", live: true, what: "How green your field looks from the satellite, every 16 days (NDVI).", use: "Finds the months when your soil was left uncovered.", site: "https://modis.ornl.gov/globalsubset/" },
  { topic: "Soil", name: "SSURGO · USDA", live: true, what: "Soil type, drainage and how much water it holds, in the U.S.", use: "Adjusts drought or waterlogging risk and when a cover crop pays off.", site: "https://websoilsurvey.nrcs.usda.gov/" },
  { topic: "Crops in the area", name: "CDL · USDA", live: true, what: "What was planted on every U.S. field each year.", use: "Favors crops that already have markets and machinery near you.", site: "https://croplandcros.scinet.usda.gov/" },
  { topic: "Prices", name: "QuickStats · USDA", live: true, what: "Average price paid to farmers in each state.", use: "In My prices, with your own free key. Without it, we only use the prices you enter.", site: "https://quickstats.nass.usda.gov/" },
  { topic: "Satellite soil moisture", name: "SMAP · NASA", live: true, what: "Moisture in the top few centimeters of soil, measured from space every 2 or 3 days.", use: "How much water the surface of your soil holds today.", site: "https://nsidc.org/data/spl3smp_e/versions/6" },
  { topic: "Satellite rainfall", name: "GPM IMERG · NASA", live: true, what: "Daily rainfall estimated by a constellation of satellites.", use: "How much it rained on your field in the last 30 days.", site: "https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGDL_07/summary" },
  { topic: "Water in the soil", name: "NLDAS-2 · NASA", live: true, what: "Monthly model of the water the soil holds, evaporates and runs off, in the U.S.", use: "Whether your soil has more or less water than normal; flags thirsty crops.", site: "https://disc.gsfc.nasa.gov/datasets/NLDAS_NOAH0125_M_2.0/summary" },
  { topic: "What grows well here", name: "GAEZ · FAO", live: true, what: "Suitability and attainable yield for each crop, and the growing season, based on 1981–2010 climate.", use: "In the report: which crops do well in your area and how much they yielded.", site: "https://gaez.fao.org/pages/data-viewer" },
  { topic: "Your neighbors' rain", name: "CoCoRaHS · NOAA", live: true, what: "Rain measured every morning by volunteers with rain gauges.", use: "Compares rain measured in your area with NASA's estimate.", site: "https://www.cocorahs.org/" },
  { topic: "Terrain", name: "SRTM · NASA", live: true, what: "Ground elevation every 30 m, measured by radar from the Space Shuttle.", use: "Your field's slope and erosion risk; favors cover crops on sloping ground.", site: "https://lpdaac.usgs.gov/products/srtmgl1v003/" },
];

const SOURCES_ES: Src[] = [
  { topic: "Clima", name: "NASA POWER", live: true, what: "Lluvia, temperatura y humedad del suelo para cualquier punto, desde 1981.", use: "Meses difíciles, clima por fecha y riesgo de agua de cada opción.", site: "https://power.larc.nasa.gov/data-access-viewer/" },
  { topic: "Verdor del campo", name: "MODIS · NASA", live: true, what: "Qué tan verde se ve tu campo desde el satélite, cada 16 días (NDVI).", use: "Detecta los meses en que tu suelo quedó sin cubrir.", site: "https://modis.ornl.gov/globalsubset/" },
  { topic: "Suelo", name: "SSURGO · USDA", live: true, what: "Tipo de suelo, drenaje y cuánta agua guarda, en EE. UU.", use: "Ajusta el riesgo de sequía o encharcamiento y cuándo conviene una cobertura.", site: "https://websoilsurvey.nrcs.usda.gov/" },
  { topic: "Cultivos de la zona", name: "CDL · USDA", live: true, what: "Qué se sembró en cada parcela de EE. UU. cada año.", use: "Favorece los cultivos que ya tienen mercado y maquinaria cerca de ti.", site: "https://croplandcros.scinet.usda.gov/" },
  { topic: "Precios", name: "QuickStats · USDA", live: true, what: "Precio promedio pagado a los agricultores de cada estado.", use: "En Mis precios, con tu propia clave gratuita. Sin ella, solo usamos los precios que escribas.", site: "https://quickstats.nass.usda.gov/" },
  { topic: "Humedad medida por satélite", name: "SMAP · NASA", live: true, what: "Humedad de los primeros centímetros del suelo, medida desde el espacio cada 2 o 3 días.", use: "Cuánta agua tiene hoy la superficie de tu suelo.", site: "https://nsidc.org/data/spl3smp_e/versions/6" },
  { topic: "Lluvia por satélite", name: "GPM IMERG · NASA", live: true, what: "Lluvia diaria estimada por una constelación de satélites.", use: "Cuánto llovió en tu terreno en los últimos 30 días.", site: "https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGDL_07/summary" },
  { topic: "Agua en el suelo", name: "NLDAS-2 · NASA", live: true, what: "Modelo mensual del agua que guarda el suelo, la que se evapora y la que escurre, en EE. UU.", use: "Si tu suelo tiene más o menos agua que lo normal; avisa a los cultivos que piden mucha agua.", site: "https://disc.gsfc.nasa.gov/datasets/NLDAS_NOAH0125_M_2.0/summary" },
  { topic: "Qué se da bien aquí", name: "GAEZ · FAO", live: true, what: "Idoneidad y rendimiento posible de cada cultivo, y la temporada de crecimiento, según el clima de 1981 a 2010.", use: "En el informe: qué cultivos se dan bien en tu zona y cuánto se cosechaba.", site: "https://gaez.fao.org/pages/data-viewer" },
  { topic: "Lluvia de tus vecinos", name: "CoCoRaHS · NOAA", live: true, what: "Lluvia medida cada mañana por voluntarios con pluviómetros.", use: "Compara la lluvia medida en tu zona con la que estima la NASA.", site: "https://www.cocorahs.org/" },
  { topic: "Relieve", name: "SRTM · NASA", live: true, what: "Altura del terreno cada 30 m, medida por radar desde el transbordador espacial.", use: "La pendiente de tu terreno y su riesgo de erosión; favorece las coberturas en terrenos inclinados.", site: "https://lpdaac.usgs.gov/products/srtmgl1v003/" },
];

export const SOURCES: Record<Lang, Src[]> = { es: SOURCES_ES, en: SOURCES_EN };

export function FuentesPanel({ data }: { data: Analysis | null }) {
  const l = useLang();
  const t = T[l];
  const live = SOURCES[l].filter((s) => s.live);
  const pending = SOURCES[l].filter((s) => !s.live);
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-serif text-2xl font-semibold">{t.srcTitle}</h2>
        <p className="mt-1 max-w-prose text-base text-ink-soft">{t.srcLead(live.length, pending.length)}</p>
      </div>
      {[
        [t.used, live],
        [t.pending, pending],
      ].map(([title, list]) => (
        <section key={title as string}>
          <h3 className="font-serif text-xl font-semibold">{title as string}</h3>
          <ul className="mt-2 border-t border-rule">
            {(list as Src[]).map((s) => (
              <li key={s.name} className="grid grid-cols-[11rem_1fr] gap-4 border-b border-rule py-4">
                <div>
                  <p className="font-semibold text-ink">{s.topic}</p>
                  <p className="text-sm text-ink-soft">{s.name}</p>
                </div>
                <div className="text-base text-ink-soft">
                  <p>{s.what}</p>
                  <p className="mt-1 text-ink">{s.use}</p>
                  <p className="mt-1 text-sm">
                    <OfficialLink href={s.site}>{t.site}</OfficialLink>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-sm text-ink-soft">{data?.disclaimer ?? t.disclaimer}</p>
    </div>
  );
}
