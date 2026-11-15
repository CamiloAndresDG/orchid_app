"use client";

// Fuentes del ETL (backend/app/etl): FAO GAEZ v4 (temporada, idoneidad y cosechas reales) y
// estaciones de lluvia CoCoRaHS (NOAA) comparadas con NASA POWER.

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ExternalIcon } from "./icons";
import { HA_PER_ACRE, MONTH_NAMES, US_UNITS } from "./shared";
import { SOURCE_LABEL, gaezUrl, stationUrl } from "./sources";

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

// Nombres de GAEZ -> español. Los que no estan se muestran tal cual.
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
// Cultivos que maneja Field Shift, en el orden en que se muestran.
const MAIN = ["Maize", "Soybean", "Wheat", "Sorghum", "Sunflower", "Oat", "Rye", "Barley", "Alfalfa"];
// Cultivo de GAEZ -> clave de unidades de EE. UU. (shared.ts)
const US_KEY: Record<string, string> = { Maize: "corn", Soybean: "soybean", Wheat: "wheat", Sorghum: "sorghum", Sunflower: "sunflower", Oat: "oats" };

const toIn = (mm: number) => mm / 25.4;
const acres = (ha: number) => ha / HA_PER_ACRE;
const fmt = (n: number, d = 0) => n.toLocaleString("es-US", { maximumFractionDigits: d, minimumFractionDigits: d });

/** Rendimiento en t/ha -> unidad del campo de EE. UU. si el cultivo la tiene. */
function usYield(crop: string, tHa: number): string | null {
  const u = US_UNITS[US_KEY[crop]];
  if (!u) return null;
  return `${fmt((tHa * 1000 * HA_PER_ACRE) / u.kgPerYield)} ${u.yieldUnit}`;
}

function dayOfYear(doy: number): string {
  const d = new Date(Date.UTC(2001, 0, Math.round(doy)));
  const part = d.getUTCDate() <= 10 ? "principios" : d.getUTCDate() <= 20 ? "mediados" : "finales";
  return `${part} de ${MONTH_NAMES[d.getUTCMonth()]}`;
}

export function useAgro(point: Point | null): Agro {
  const [suit, setSuit] = useState<Suitability | null>(null);
  const [grow, setGrow] = useState<Growing | null>(null);
  const [actual, setActual] = useState<Actual | null>(null);
  const [rain, setRain] = useState<Rain | null>(null);

  useEffect(() => {
    if (!point) return;
    const ctl = new AbortController();
    const post = (path: string) =>
      fetch(`${API}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(point), signal: ctl.signal }).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
      );
    const fail = (note: string) => ({ available: false, note });
    /* eslint-disable react-hooks/set-state-in-effect */
    setSuit(null);
    setGrow(null);
    setActual(null);
    setRain(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    const off = "No pudimos consultar esta fuente ahora. Vuelve a marcar el terreno para intentarlo otra vez.";
    post("/point/gaez/suitability").then(setSuit).catch((e) => e.name !== "AbortError" && setSuit({ ...fail(off), crops: [], source: "" }));
    post("/point/gaez/growing").then(setGrow).catch((e) => e.name !== "AbortError" && setGrow({ ...fail(off), highlights: {}, source: "" }));
    post("/point/gaez/actual").then(setActual).catch((e) => e.name !== "AbortError" && setActual({ ...fail(off), year: 2010, crops: [], source: "" }));
    post("/point/stations")
      .then(setRain)
      .catch((e) => e.name !== "AbortError" && setRain({ ...fail(off), year: 0, radius_km: 0, stations: [], months: [], summary: null }));
    return () => ctl.abort();
  }, [point]);

  return { suit, grow, actual, rain };
}

/** Lineas para el resumen que recibe el asistente de IA. */
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

const Loading = ({ slow }: { slow?: boolean }) => <p className="mt-1 text-ink-soft">Consultando…{slow && " la primera vez tarda hasta un minuto."}</p>;

/* ---------------------------------- Temporada ---------------------------------- */

export function AboutSeason({ grow }: { grow: Growing | null }) {
  const h = grow?.available ? grow.highlights : null;
  const pPet = h?.p_pet_pct;
  return (
    <section>
      <h4 className="font-serif text-lg font-semibold">Tu temporada de cultivo</h4>
      {!grow && <Loading />}
      {grow && !h && <p className="mt-1 text-ink-soft">{grow.note}</p>}
      {h && (
        <>
          <p className="mt-1 text-ink-soft">Promedio de 30 años (1981 a 2010) para tu zona.</p>
          <dl className="mt-2 grid max-w-xl grid-cols-[11rem_1fr] gap-x-4 gap-y-3">
            {h.growing_period_days !== undefined && (
              <>
                <dt className="text-ink-soft">Días para crecer</dt>
                <dd>
                  {fmt(h.growing_period_days)} días al año
                  {h.growing_period_start_doy !== undefined && h.growing_period_start_doy > 0 && h.growing_period_days < 365 && (
                    <>, desde {dayOfYear(h.growing_period_start_doy)}</>
                  )}
                  <span className="block text-sm text-ink-soft">Días con temperatura y humedad suficientes para que un cultivo crezca.</span>
                </dd>
              </>
            )}
            {h.frost_days !== undefined && (
              <>
                <dt className="text-ink-soft">Días con helada</dt>
                <dd>{fmt(h.frost_days)} al año <span className="text-sm text-ink-soft">(mínima bajo 32 °F)</span></dd>
              </>
            )}
            {h.heat_days_35 !== undefined && (
              <>
                <dt className="text-ink-soft">Días de calor fuerte</dt>
                <dd>{fmt(h.heat_days_35)} al año <span className="text-sm text-ink-soft">(máxima sobre 95 °F)</span></dd>
              </>
            )}
            {h.annual_precip_mm !== undefined && (
              <>
                <dt className="text-ink-soft">Lluvia al año</dt>
                <dd>
                  {fmt(toIn(h.annual_precip_mm), 1)} in <span className="text-sm text-ink-soft">({fmt(h.annual_precip_mm)} mm)</span>
                </dd>
              </>
            )}
            {pPet !== undefined && (
              <>
                <dt className="text-ink-soft">¿Alcanza la lluvia?</dt>
                <dd>
                  {pPet >= 100 ? "Sí, sobra" : pPet >= 75 ? "Casi alcanza" : pPet >= 50 ? "Se queda corta" : "Falta mucha agua"}
                  <span className="block text-sm text-ink-soft">
                    La lluvia cubre el {fmt(pPet)}% del agua que el calor y el viento sacarían del campo en el año.
                  </span>
                </dd>
              </>
            )}
            {h.degree_days_5 !== undefined && (
              <>
                <dt className="text-ink-soft">Calor acumulado</dt>
                <dd>
                  {fmt(h.degree_days_5 * 1.8)} grados-día °F <span className="text-sm text-ink-soft">(base 41 °F; {fmt(h.degree_days_5)} en °C)</span>
                </dd>
              </>
            )}
          </dl>
        </>
      )}
      <p className="mt-2">
        <Source href={gaezUrl()} title={SOURCE_LABEL.gaez}>Ver en el visor de la FAO (GAEZ)</Source>
      </p>
    </section>
  );
}

/* ---------------------------------- Idoneidad ---------------------------------- */

const CLASS_TONE: Record<string, string> = { "muy alta": "bg-moss", alta: "bg-moss", buena: "bg-moss/60", media: "bg-clay/50", moderada: "bg-clay/50", marginal: "bg-clay", "muy marginal": "bg-clay", "no apta": "bg-clay" };

function FitBar({ r, label }: { r: Regime; label: string }) {
  const v = r.suitability ?? 0;
  return (
    <span className="grid grid-cols-[1fr_6.5rem] items-center gap-2" title={`${label}: índice ${fmt(v)} de 10.000`}>
      <span className="h-2.5 rounded-full bg-paper-deep">
        <span className={`block h-full rounded-full ${CLASS_TONE[r.suitability_class ?? ""] ?? "bg-rule"}`} style={{ width: `${Math.max(2, v / 100)}%` }} />
      </span>
      <span className="text-sm text-ink-soft">{r.suitability_class ?? "sin dato"}</span>
    </span>
  );
}

export function AboutFit({ suit, irrigated }: { suit: Suitability | null; irrigated: boolean }) {
  const crops = suit?.available ? suit.crops : [];
  const main = MAIN.map((c) => crops.find((x) => x.crop === c)).filter((x): x is Suitability["crops"][number] => !!x);
  const others = crops
    .filter((c) => !MAIN.includes(c.crop) && (c.secano.suitability ?? 0) >= 7000)
    .slice(0, 6)
    .map((c) => es(c.crop).toLowerCase());
  return (
    <section>
      <h4 className="font-serif text-lg font-semibold">Qué cultivos se dan bien aquí, según la FAO</h4>
      {!suit && <Loading />}
      {suit && !suit.available && <p className="mt-1 text-ink-soft">{suit.note}</p>}
      {main.length > 0 && (
        <>
          <p className="mt-1 text-ink-soft">
            Junta el clima de 30 años, el suelo y el relieve de tu zona, con buen manejo y fertilización.{" "}
            {irrigated ? "Como tienes riego, mira las dos columnas." : "Sin riego, la columna que te importa es «Solo lluvia»."}
          </p>
          <div className="mt-3 max-w-xl">
            <div className="grid grid-cols-[8rem_1fr_1fr] gap-x-4 pb-1 text-sm text-ink-soft">
              <span />
              <span>Solo lluvia</span>
              <span>Con riego</span>
            </div>
            <ul className="space-y-2">
              {main.map((c) => (
                <li key={c.crop} className="grid grid-cols-[8rem_1fr_1fr] items-center gap-x-4">
                  <span>{es(c.crop)}</span>
                  <FitBar r={c.secano} label="Solo lluvia" />
                  <FitBar r={c.riego} label="Con riego" />
                </li>
              ))}
            </ul>
          </div>
          {others.length > 0 && <p className="mt-3 text-ink-soft">Otros cultivos que se darían bien sin riego: {others.join(", ")}.</p>}
          <details className="mt-2 text-sm text-ink-soft">
            <summary className="cursor-pointer text-moss underline">Ver los {crops.length} cultivos con su rendimiento posible</summary>
            <table className="mt-2 w-full max-w-xl text-left">
              <thead>
                <tr className="border-b border-rule">
                  <th className="py-1 font-normal">Cultivo</th>
                  <th className="py-1 font-normal">Solo lluvia</th>
                  <th className="py-1 font-normal">Con riego</th>
                </tr>
              </thead>
              <tbody>
                {crops.map((c) => (
                  <tr key={c.crop} className="border-b border-rule/60">
                    <td className="py-1 text-ink">{es(c.crop)}</td>
                    {[c.secano, c.riego].map((r, i) => (
                      <td key={i} className="py-1">
                        {r.suitability_class ?? "—"}
                        {r.attainable_yield ? <span className="block">{fmt(r.attainable_yield / 1000, 1)} t/ha {r.yield_units?.includes("DW") ? "(materia seca)" : `(${r.yield_units})`}</span> : null}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2">Índice de idoneidad de 0 a 10.000 agrupado en las clases de la FAO. Con riego se muestra el mejor sistema (goteo, aspersión o gravedad).</p>
          </details>
        </>
      )}
      <p className="mt-2">
        <Source href={gaezUrl()} title={SOURCE_LABEL.gaez}>Ver en el visor de la FAO (GAEZ)</Source>
      </p>
    </section>
  );
}

/* ------------------------------- Cosechas reales -------------------------------- */

export function AboutHarvests({ actual }: { actual: Actual | null }) {
  const crops = actual?.available ? actual.crops.slice(0, 6) : [];
  return (
    <section>
      <h4 className="font-serif text-lg font-semibold">Cuánto se cosechaba en tu zona</h4>
      {!actual && <Loading />}
      {actual && !actual.available && <p className="mt-1 text-ink-soft">{actual.note}</p>}
      {crops.length > 0 && (
        <>
          <p className="mt-1 text-ink-soft">Área cosechada y rendimiento real en {actual!.year}, en un cuadro de unos 6 por 6 millas alrededor de tu terreno.</p>
          <dl className="mt-2 grid max-w-xl grid-cols-[11rem_1fr] gap-x-4 gap-y-3">
            {crops.map((c) => {
              const t = c.total.yield_t_ha;
              const us = t ? usYield(c.crop, t) : null;
              return (
                <div key={c.crop} className="contents">
                  <dt className="text-ink-soft">{es(c.crop)}</dt>
                  <dd>
                    {fmt(acres(c.area_ha))} acres
                    {t !== undefined && (
                      <>
                        {" "}· rinde {us ?? `${fmt(t, 1)} t/ha`}
                        {us && <span className="text-sm text-ink-soft"> ({fmt(t, 1)} t/ha)</span>}
                      </>
                    )}
                    {c.irrigated_share !== null && c.irrigated_share >= 0.05 && (
                      <span className="block text-sm text-ink-soft">{fmt(c.irrigated_share * 100)}% con riego</span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
          <p className="mt-2 text-sm text-ink-soft">Sirve para comparar tu rinde con el de la zona. Son datos de 2010: el rinde actual suele ser algo mayor.</p>
        </>
      )}
      <p className="mt-2">
        <Source href={gaezUrl()} title={SOURCE_LABEL.gaez}>Ver en el visor de la FAO (GAEZ)</Source>
      </p>
    </section>
  );
}

/* ----------------------------- Lluvia de estaciones ----------------------------- */

export function AboutRain({ rain }: { rain: Rain | null }) {
  const s = rain?.available ? rain.summary : null;
  const data = (rain?.months ?? []).map((m) => ({
    mes: MONTH_NAMES[m.month - 1].slice(0, 3),
    Vecinos: m.stations_mm === null ? null : +toIn(m.stations_mm).toFixed(2),
    "NASA POWER": m.power_mm === null ? null : +toIn(m.power_mm).toFixed(2),
  }));
  const near = rain?.stations[0];
  const agree = s ? (s.correlation >= 0.85 ? "coincide bien" : s.correlation >= 0.6 ? "coincide más o menos" : "coincide poco") : "";
  return (
    <section>
      <h4 className="font-serif text-lg font-semibold">Lluvia medida por tus vecinos</h4>
      {!rain && <Loading slow />}
      {rain && !rain.available && <p className="mt-1 text-ink-soft">{rain.note}</p>}
      {rain?.available && (
        <>
          <p className="mt-1 text-ink-soft">
            Voluntarios de la red CoCoRaHS miden la lluvia con un pluviómetro cada mañana. En {rain.year} hubo {rain.stations.length} a menos de{" "}
            {fmt(rain.radius_km / 1.609)} millas{near && <> (la más cercana a {fmt(near.distance_km / 1.609, 1)} millas)</>}.
            {s && (
              <>
                {" "}
                La lluvia que estima la NASA para tu terreno <strong className="text-ink">{agree}</strong> con lo que midieron: {fmt(toIn(s.stations_total_mm), 1)} in en el año
                según ellos y {fmt(toIn(s.power_total_mm), 1)} in según la NASA.
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
                <Bar dataKey="Vecinos" fill="var(--moss)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="NASA POWER" fill="var(--clay)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            Lluvia de cada mes, promedio de las estaciones que reportaron al menos 8 de cada 10 días. Si la NASA y tus vecinos coinciden, puedes confiar más en
            el clima que usamos para las sugerencias.
          </p>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {rain.stations
              .filter((st) => st.complete_months > 0)
              .slice(0, 3)
              .map((st) => (
                <Source key={st.id} href={stationUrl(st.id)} title={SOURCE_LABEL.cocorahs}>
                  Estación {st.id}
                </Source>
              ))}
          </p>
        </>
      )}
    </section>
  );
}
