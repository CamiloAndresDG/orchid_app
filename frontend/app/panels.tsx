"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ClimaExplorer } from "./climate";
import { ChevronIcon, ExternalIcon, ShieldIcon } from "./icons";
import { MONTH_NAMES } from "./shared";
import { SOURCE_LABEL, powerUrl } from "./sources";

export const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

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

const CROP_NAMES: Record<string, string> = { wheat: "trigo", corn: "maíz", soybean: "soja", sorghum: "sorgo" };
const tooltipStyle = { background: "var(--paper)", border: "1px solid var(--rule)", color: "var(--ink)" };
const monthList = (ms: number[]) => {
  const n = [...ms].sort((a, b) => a - b).map((m) => MONTH_NAMES[m - 1]);
  return n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}`;
};
const placeName = (d: Analysis) => (d.zone.id === "custom" ? "tu terreno" : `${d.zone.name} (ejemplo)`);

function OfficialLink({ href, title, children = "Ver dato oficial" }: { href: string; title?: string; children?: React.ReactNode }) {
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

function rationale(s: Strategy, bare: number): string {
  if (s.is_current) return `Es lo que se siembra hoy en la zona. Deja el suelo sin cultivo ${bare} ${bare === 1 ? "mes" : "meses"} al año.`;
  const covers = s.sequence.some((c) => ["cover_crop", "cereal_rye", "oats_clover"].includes(c));
  return covers
    ? "Añade una cobertura para los meses en que hoy el suelo queda sin cultivo."
    : "Alarga la rotación para cortar ciclos de plagas y malezas. No cambia los meses sin cultivo.";
}

export function EstrategiasPanel({ data }: { data: Analysis; go?: (t: TabId) => void }) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-serif text-2xl font-semibold">{data.zone.name}</h2>
        <p className="mt-1 max-w-prose text-base text-ink-soft">
          {data.zone.focus}. Los meses más difíciles del clima aquí son {monthList(data.most_vulnerable_months)}.
        </p>
      </div>
      {data.strategies.map((s) => (
        <section key={s.id} className="border-t border-rule pt-6">
          <h3 className="font-serif text-xl font-semibold">
            {s.name.replace(" (actual)", "")}
            {s.is_current && <span className="ml-3 align-middle font-sans text-sm font-normal text-ink-soft">lo que se siembra hoy</span>}
          </h3>
          <p className="mt-1 text-base text-ink-soft">{rationale(s, data.bare_soil_months.length)}</p>
          <div className="mt-3 grid gap-4 text-base sm:grid-cols-2">
            <div>
              <p className="font-semibold text-ink">Ventajas</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-soft marker:text-moss">
                {s.benefits.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-semibold text-ink">Ten cuidado con</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-soft marker:text-clay">
                {s.risks.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          </div>
          <details className="mt-3">
            <summary className="inline-flex cursor-pointer items-center gap-1.5 text-base text-moss hover:underline">
              <ShieldIcon className="size-5" /> ¿De dónde sale esto?
            </summary>
            <ul className="mt-3 space-y-2 text-sm text-ink-soft">
              {s.evidence.map((e) => (
                <li key={e}>
                  {e}.{" "}
                  {e.includes("NASA POWER") ? (
                    <OfficialLink href={powerUrl(data.zone.lat, data.zone.lon)} title={SOURCE_LABEL.power} />
                  ) : (
                    <span className="text-ink-faint">(no consultado en este ejemplo)</span>
                  )}
                </li>
              ))}
              {s.gaps.map((g) => (
                <li key={g}>Falta saber: {g.toLowerCase()}.</li>
              ))}
            </ul>
          </details>
        </section>
      ))}
      <p className="text-sm text-ink-soft">Ventajas y riesgos son reglas que escribimos nosotros; todavía no las ha revisado un agrónomo de la zona.</p>
    </div>
  );
}

/* --------------------------------- Clima --------------------------------- */

const CLIMATE_VARS = [
  { key: "precip_mm_day" as const, title: "Lluvia del mes", unit: "pulgadas", max: 5, tech: "PRECTOTCORR", what: "Cuánta agua cae en el mes. Si cae fuera de la siembra o del crecimiento, el cultivo no la aprovecha." },
  { key: "temp_c" as const, title: "Temperatura media", unit: "°F", max: 30, tech: "T2M", what: "Temperatura media del aire. Con más calor el suelo pierde agua más rápido y el cultivo se estresa." },
  { key: "soil_wetness" as const, title: "Suelo", unit: "seco, medio o húmedo", max: 1, tech: "GWETROOT", what: "Agua que hay donde están las raíces. Es la reserva que aguanta las semanas sin lluvia." },
];

function climateCell(key: "precip_mm_day" | "temp_c" | "soil_wetness", v: number) {
  if (key === "precip_mm_day") {
    const mm = v * 30.4;
    return { main: `${(mm / 25.4).toFixed(1)} in`, alt: `${mm.toFixed(0)} mm` };
  }
  if (key === "temp_c") return { main: `${((v * 9) / 5 + 32).toFixed(0)} °F`, alt: `${v.toFixed(0)} °C` };
  return { main: v < 0.35 ? "seco" : v < 0.55 ? "medio" : "húmedo", alt: "" };
}

export function ClimaPanel({ data }: { data: Analysis }) {
  const crit = data.most_vulnerable_months;
  const [y0, y1] = data.method.climate_period;
  return (
    <div className="space-y-10">
      <div>
        <h2 className="font-serif text-2xl font-semibold">Clima de {placeName(data)}</h2>
        <p className="mt-1 max-w-prose text-base text-ink-soft">
          Lluvia, temperatura y humedad del suelo medidas por la NASA en tu punto. {data.zone.id === "custom" && "Haz clic en otro lugar del mapa para ver otro punto."}
        </p>
      </div>

      <ClimaExplorer lat={data.zone.lat} lon={data.zone.lon} />

      <section>
        <h3 className="font-serif text-xl font-semibold">Cómo es cada mes, en promedio</h3>
        <p className="mt-1 text-base text-ink-soft">
          Promedio de {y0} a {y1}. En terracota, los meses más difíciles.{" "}
          <OfficialLink href={powerUrl(data.zone.lat, data.zone.lon)} title={SOURCE_LABEL.power}>
            Ver en NASA POWER
          </OfficialLink>
        </p>
        <table className="mt-4 w-full text-base">
          <thead>
            <tr className="border-b border-rule text-left text-sm text-ink-soft">
              <th className="py-2 pr-3 font-semibold">Mes</th>
              {CLIMATE_VARS.map((v) => (
                <th key={v.key} className="py-2 pr-3 font-semibold">
                  {v.title} <span className="font-normal">({v.unit})</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.months.map((m) => (
              <tr key={m.month} className={`border-b border-rule/70 ${crit.includes(m.month) ? "text-clay" : ""}`}>
                <td className="py-2 pr-3 font-semibold capitalize">{MONTH_NAMES[m.month - 1]}</td>
                {CLIMATE_VARS.map((v) => (
                  <td key={v.key} className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="w-[4.5rem] tabular-nums">
                        {climateCell(v.key, m[v.key]).main}
                        {climateCell(v.key, m[v.key]).alt && <span className="block text-sm text-ink-soft">{climateCell(v.key, m[v.key]).alt}</span>}
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

      <Fold title="Qué significa cada dato">
        <dl className="space-y-4">
          {CLIMATE_VARS.map((v) => (
            <div key={v.key}>
              <dt className="font-semibold text-ink">{v.title}</dt>
              <dd className="mt-0.5 max-w-prose text-ink-soft">
                {v.what} <span className="text-sm text-ink-faint">En la página de la NASA se llama {v.tech} y viene en unidades métricas.</span>
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
  const w = data.method.weights;
  const crit = data.most_vulnerable_months;
  const rows = data.months.map((m) => ({
    name: MONTHS[m.month - 1],
    Calor: +(m.components.heat * w.heat).toFixed(3),
    "Suelo seco": +(m.components.dryness * w.dryness).toFixed(3),
    "Poca lluvia": +(m.components.low_rain * w.low_rain).toFixed(3),
  }));
  const crops = Object.keys(data.method.crop_months);
  const showCalendar = data.zone.id !== "custom" && crops.length > 0;

  return (
    <div className="space-y-10">
      <div>
        <h2 className="font-serif text-2xl font-semibold">Meses difíciles en {placeName(data)}</h2>
        <p className="mt-1 max-w-prose text-base text-ink-soft">
          Cada mes recibe una nota de 0 a 1 según su calor, lo seco del suelo y la falta de lluvia. Más alta, más difícil para un cultivo sin riego. Los
          más difíciles aquí son <strong className="text-clay">{monthList(crit)}</strong>.
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
            <Bar dataKey="Calor" stackId="v" fill="var(--clay)" />
            <Bar dataKey="Suelo seco" stackId="v" fill="var(--moss)" />
            <Bar dataKey="Poca lluvia" stackId="v" fill="var(--field)" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {showCalendar && (
        <section>
          <h3 className="font-serif text-xl font-semibold">Cuándo queda el suelo sin cultivo</h3>
          <p className="mt-1 max-w-prose text-base text-ink-soft">
            Con la rotación de hoy ({crops.map((c) => CROP_NAMES[c] ?? c).join(", ")}), según un calendario típico. Si un mes difícil cae sin cultivo, ahí
            ayuda una cobertura.
          </p>
          <div className="mt-4 grid grid-cols-12 gap-1.5 text-center text-sm">
            {data.months.map((m) => {
              const bare = data.bare_soil_months.includes(m.month);
              const isCrit = crit.includes(m.month);
              return (
                <div
                  key={m.month}
                  className={`rounded-md py-2.5 ${bare ? "border border-field text-ink" : "bg-moss text-paper"} ${isCrit ? "outline-2 outline-offset-2 outline-clay" : ""}`}
                  title={`${MONTH_NAMES[m.month - 1]}: ${bare ? "sin cultivo" : "con cultivo"}${isCrit ? ", mes difícil" : ""}`}
                >
                  {MONTHS[m.month - 1]}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-sm text-ink-soft">Verde: con cultivo. Blanco: sin cultivo. Contorno terracota: mes difícil.</p>
        </section>
      )}

      <Fold title="Cómo calculamos la nota">
        <p className="max-w-prose text-ink-soft">
          Sumamos {w.heat * 100}% del calor del mes, {w.dryness * 100}% de lo seco del suelo y {w.low_rain * 100}% de la falta de lluvia, comparando
          cada mes con los demás del mismo lugar. Los datos de clima son de la NASA; la fórmula y sus pesos los elegimos nosotros. No predice cosechas.{" "}
          <OfficialLink href={powerUrl(data.zone.lat, data.zone.lon)} title={SOURCE_LABEL.power}>
            Ver los datos de clima
          </OfficialLink>
        </p>
      </Fold>
    </div>
  );
}

/* ----------------------------- De dónde salen ----------------------------- */

type Src = { topic: string; name: string; live: boolean; what: string; use: string; site: string };

// Fuente unica de verdad sobre que esta conectado.
export const SOURCES: Src[] = [
  { topic: "Clima", name: "NASA POWER", live: true, what: "Lluvia, temperatura y humedad del suelo para cualquier punto, desde 1981.", use: "Meses difíciles, clima por fecha y riesgo de agua de cada opción.", site: "https://power.larc.nasa.gov/data-access-viewer/" },
  { topic: "Verdor del campo", name: "MODIS · NASA", live: true, what: "Qué tan verde se ve tu campo desde el satélite, cada 16 días (NDVI).", use: "Detecta los meses en que tu suelo quedó sin cubrir.", site: "https://modis.ornl.gov/globalsubset/" },
  { topic: "Suelo", name: "SSURGO · USDA", live: true, what: "Tipo de suelo, drenaje y cuánta agua guarda, en EE. UU.", use: "Ajusta el riesgo de sequía o encharcamiento y cuándo conviene una cobertura.", site: "https://websoilsurvey.nrcs.usda.gov/" },
  { topic: "Cultivos de la zona", name: "CDL · USDA", live: true, what: "Qué se sembró en cada parcela de EE. UU. cada año.", use: "Favorece los cultivos que ya tienen mercado y maquinaria cerca de ti.", site: "https://croplandcros.scinet.usda.gov/" },
  { topic: "Precios", name: "QuickStats · USDA", live: true, what: "Precio promedio pagado a los agricultores de cada estado.", use: "En Mis precios, con tu propia clave gratuita. Sin ella, solo usamos los precios que escribas.", site: "https://quickstats.nass.usda.gov/" },
  { topic: "Humedad medida por satélite", name: "SMAP · NASA", live: true, what: "Humedad de los primeros centímetros del suelo, medida desde el espacio cada 2 o 3 días.", use: "Cuánta agua tiene hoy la superficie de tu suelo.", site: "https://nsidc.org/data/spl3smp_e/versions/6" },
  { topic: "Lluvia por satélite", name: "GPM IMERG · NASA", live: true, what: "Lluvia diaria estimada por una constelación de satélites.", use: "Cuánto llovió en tu terreno en los últimos 30 días.", site: "https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGDL_07/summary" },
  { topic: "Agua en el suelo", name: "NLDAS-2 · NASA", live: true, what: "Modelo mensual del agua que guarda el suelo, la que se evapora y la que escurre, en EE. UU.", use: "Si tu suelo tiene más o menos agua que lo normal; avisa a los cultivos que piden mucha agua.", site: "https://disc.gsfc.nasa.gov/datasets/NLDAS_NOAH0125_M_2.0/summary" },
  { topic: "Relieve", name: "SRTM · NASA", live: true, what: "Altura del terreno cada 30 m, medida por radar desde el transbordador espacial.", use: "La pendiente de tu terreno y su riesgo de erosión; favorece las coberturas en terrenos inclinados.", site: "https://lpdaac.usgs.gov/products/srtmgl1v003/" },
];

export function FuentesPanel({ data }: { data: Analysis | null }) {
  const live = SOURCES.filter((s) => s.live);
  const pending = SOURCES.filter((s) => !s.live);
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-serif text-2xl font-semibold">De dónde salen los datos</h2>
        <p className="mt-1 max-w-prose text-base text-ink-soft">
          Todo lo que mostramos viene de fuentes públicas del gobierno de EE. UU. y lo puedes comprobar en su sitio oficial. Usamos {live.length} fuentes;{" "}
          {pending.length} más están pendientes y no las mostramos como si las tuviéramos.
        </p>
      </div>
      {[
        ["Las que usamos", live],
        ["Pendientes", pending],
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
                    <OfficialLink href={s.site}>Sitio oficial</OfficialLink>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-sm text-ink-soft">{data?.disclaimer ?? "Herramienta de apoyo a la decisión. Valida siempre con un experto local."}</p>
    </div>
  );
}
