"use client";

// NASA Earthdata sources per point: SMAP (soil moisture), IMERG (satellite rain),
// NLDAS (water stored in the soil) and SRTM (terrain). The backend uses the server's Earthdata token.

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ExternalIcon } from "./icons";
import { API, MONTHS } from "./shared";
import { SOURCE_LABELS, sourceUrl } from "./sources";
import type { Point } from "./field";
import { Lang, fmtNum, langHeaders, useLang } from "./i18n";

const T = {
  es: {
    off: "No pudimos consultar esta fuente de la NASA ahora. Vuelve a marcar el terreno para intentarlo otra vez.",
    day: (d: number, m: string) => `${d} de ${m}`,
    month: (m: string, y: number) => `${m} de ${y}`,
    checking: "Consultando…",
    noData: "Sin dato en este punto",
    noRecent: "Sin medida reciente",
    surface: (p: number, d: string) => `${p}% de agua en la superficie (${d})`,
    rainIn: (i: string, mm: string, days?: number) => `${i} in (${mm} mm) en ${days} días`,
    askingNasa: "Consultando a la NASA…",
    reliefTitle: "Relieve de tu terreno",
    elevation: "Altura",
    feet: "pies",
    slope: "Pendiente",
    slopeAvg: (p: string, w?: string) => `${p}% en promedio, ${w}`,
    slopeMax: (p: string) => `(hasta ${p}% en algún tramo)`,
    relief: "Desnivel en 1 km",
    steep: "Con esta pendiente, el agua de lluvia arrastra suelo si queda desnudo: ayudan las coberturas, el rastrojo y sembrar siguiendo las curvas de nivel.",
    flat: "Con poca pendiente el riesgo de erosión por lluvia es bajo; en zonas bajas puede acumularse agua.",
    smapTitle: "Humedad del suelo medida por satélite",
    smapText: (word: string, date: string, pct: number, withData?: number, checked?: number, mean?: number) =>
      [`El satélite SMAP midió la superficie de tu suelo `, word, ` el ${date}: ${pct}% del volumen era agua. En las últimas dos semanas tuvo medida ${withData} de ${checked} días, con un promedio de ${mean}%.`],
    pctWater: (v: unknown) => `${v}% de agua`,
    moisture: "Humedad",
    imergTitle: "Lluvia reciente por satélite",
    imergText: (a: string, b: string) => `Del ${a} al ${b} cayeron `,
    inches: (i: string, mm: string) => `${i} pulgadas (${mm} mm)`,
    imergTail: (days?: number, last7?: string) => ` en ${days} días con lluvia; en los últimos 7 días, ${last7} in.`,
    rain: "Lluvia",
    nldasTitle: "Agua guardada en tu suelo",
    nldasText: (m: string, i: string) => `Al cierre de ${m}, el primer metro de tu suelo guardaba ${i} pulgadas de agua`,
    normal: "lo normal",
    vsNormal: (a: number, more: boolean) => `${a}% ${more ? "más" : "menos"} que lo normal`,
    forMonth: (y?: string) => ` para ese mes (promedio ${y})`,
    nldasTail: (r: string, et: string, ro: string) => `. Ese mes llovieron ${r} in, se evaporaron o usaron las plantas ${et} in y escurrieron ${ro} in.`,
    waterIn: (v: unknown) => `${v} in de agua`,
    soilWater: "Agua en el suelo",
    nldasNote: (m: string, y?: string) => `Agua en el primer metro de suelo al final de cada mes. La línea punteada es lo normal para ${m} (${y}).`,
  },
  en: {
    off: "We couldn't query this NASA source right now. Mark your field again to retry.",
    day: (d: number, m: string) => `${m} ${d}`,
    month: (m: string, y: number) => `${m} ${y}`,
    checking: "Checking…",
    noData: "No data at this point",
    noRecent: "No recent reading",
    surface: (p: number, d: string) => `${p}% water at the surface (${d})`,
    rainIn: (i: string, mm: string, days?: number) => `${i} in (${mm} mm) over ${days} days`,
    askingNasa: "Asking NASA…",
    reliefTitle: "Your field's terrain",
    elevation: "Elevation",
    feet: "feet",
    slope: "Slope",
    slopeAvg: (p: string, w?: string) => `${p}% on average, ${w}`,
    slopeMax: (p: string) => `(up to ${p}% in places)`,
    relief: "Elevation change within 1 km",
    steep: "On this slope, rain washes soil away if it's left bare: cover crops, crop residue and planting along the contour help.",
    flat: "With little slope, the risk of rain erosion is low; water can pond in low spots.",
    smapTitle: "Soil moisture measured by satellite",
    smapText: (word: string, date: string, pct: number, withData?: number, checked?: number, mean?: number) =>
      [`The SMAP satellite measured your soil surface as `, word, ` on ${date}: ${pct}% of the volume was water. Over the last two weeks it had a reading on ${withData} of ${checked} days, averaging ${mean}%.`],
    pctWater: (v: unknown) => `${v}% water`,
    moisture: "Moisture",
    imergTitle: "Recent satellite rainfall",
    imergText: (a: string, b: string) => `From ${a} to ${b}, `,
    inches: (i: string, mm: string) => `${i} inches (${mm} mm)`,
    imergTail: (days?: number, last7?: string) => ` fell over ${days} rainy days; in the last 7 days, ${last7} in.`,
    rain: "Rain",
    nldasTitle: "Water stored in your soil",
    nldasText: (m: string, i: string) => `At the end of ${m}, the top meter of your soil held ${i} inches of water`,
    normal: "normal",
    vsNormal: (a: number, more: boolean) => `${a}% ${more ? "more" : "less"} than normal`,
    forMonth: (y?: string) => ` for that month (${y} average)`,
    nldasTail: (r: string, et: string, ro: string) => `. That month ${r} in of rain fell, ${et} in evaporated or was used by plants and ${ro} in ran off.`,
    waterIn: (v: unknown) => `${v} in of water`,
    soilWater: "Soil water",
    nldasNote: (m: string, y?: string) => `Water in the top meter of soil at the end of each month. The dashed line is normal for ${m} (${y}).`,
  },
};

type Base = { available: boolean; note?: string; source?: string; official_url?: string };
export type Smap = Base & {
  series: { date: string; value: number | null }[];
  latest?: { date: string; value: number; percent: number; word: string };
  mean?: number;
  days_with_data?: number;
  days_checked?: number;
};
export type Imerg = Base & {
  series: { date: string; mm: number | null }[];
  total_mm?: number;
  total_in?: number;
  last7_mm?: number;
  rain_days?: number;
  first_date?: string;
  last_date?: string;
  days?: number;
};
export type Nldas = Base & {
  months: { month: string; soil_0_100_mm: number | null; soil_0_10_mm: number | null; et_mm: number | null; runoff_mm: number | null; rain_mm: number | null }[];
  latest_month?: string;
  normal_soil_0_100_mm?: number | null;
  normal_years?: string;
  soil_anomaly_pct?: number | null;
};
export type Srtm = Base & {
  elevation_m?: number;
  elevation_ft?: number;
  slope_pct?: number;
  slope_max_pct?: number;
  slope_word?: string;
  relief_1km_m?: number;
};
export type Nasa = { smap: Smap | null; imerg: Imerg | null; nldas: Nldas | null; srtm: Srtm | null };

export function useNasa(point: Point | null): Nasa {
  const lang = useLang();
  const [smap, setSmap] = useState<Smap | null>(null);
  const [imerg, setImerg] = useState<Imerg | null>(null);
  const [nldas, setNldas] = useState<Nldas | null>(null);
  const [srtm, setSrtm] = useState<Srtm | null>(null);

  useEffect(() => {
    if (!point) return;
    const ctl = new AbortController();
    const post = (path: string) =>
      fetch(`${API}${path}`, { method: "POST", headers: langHeaders({ "content-type": "application/json" }), body: JSON.stringify(point), signal: ctl.signal }).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
      );
    const off = { available: false, note: T[lang].off };
    /* eslint-disable react-hooks/set-state-in-effect */
    setSmap(null);
    setImerg(null);
    setNldas(null);
    setSrtm(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    const skip = (e: Error) => e.name === "AbortError";
    post("/point/smap").then(setSmap).catch((e) => !skip(e) && setSmap({ ...off, series: [] }));
    post("/point/imerg").then(setImerg).catch((e) => !skip(e) && setImerg({ ...off, series: [] }));
    post("/point/nldas").then(setNldas).catch((e) => !skip(e) && setNldas({ ...off, months: [] }));
    post("/point/srtm").then(setSrtm).catch((e) => !skip(e) && setSrtm(off));
    return () => ctl.abort();
  }, [point, lang]);

  return { smap, imerg, nldas, srtm };
}

/* -------------------------------- Short texts -------------------------------- */

const toIn = (mm: number) => mm / 25.4;
const day = (iso: string, l: Lang) => {
  const [, m, d] = iso.split("-").map(Number);
  return T[l].day(d, MONTHS[l][m - 1]);
};
const dayShort = (iso: string, l: Lang) => {
  const [, m, d] = iso.split("-").map(Number);
  return l === "en" ? `${MONTHS.en[m - 1].slice(0, 3)} ${d}` : `${d} ${MONTHS.es[m - 1]}`;
};
const monthName = (ym: string, l: Lang) => {
  const [y, m] = ym.split("-").map(Number);
  return T[l].month(MONTHS[l][m - 1], y);
};

/** One line for the "Your field" summary. */
export const factSlope = (s: Srtm | null, l: Lang) =>
  !s ? T[l].checking : s.available && s.slope_pct !== undefined ? `${fmtNum(l, s.slope_pct, 1)}%, ${s.slope_word}` : T[l].noData;
export const factMoisture = (s: Smap | null, l: Lang) =>
  !s ? T[l].checking : s.available && s.latest ? T[l].surface(s.latest.percent, day(s.latest.date, l)) : T[l].noRecent;
export const factRain = (i: Imerg | null, l: Lang) =>
  !i
    ? T[l].checking
    : i.available && i.total_mm !== undefined
      ? T[l].rainIn(fmtNum(l, i.total_in ?? 0, 1), fmtNum(l, i.total_mm, 0), i.days)
      : T[l].noData;

/* -------------------------------- For the report ------------------------------ */

function Source({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title={title} className="inline-flex items-center gap-1 text-sm font-semibold text-moss underline">
      {children} <ExternalIcon />
    </a>
  );
}
const Loading = () => <p className="mt-1 text-ink-soft">{T[useLang()].askingNasa}</p>;
const tooltip = { background: "var(--paper)", border: "1px solid var(--rule)", color: "var(--ink)" };

export function AboutSrtm({ point, srtm }: { point: Point; srtm: Srtm | null }) {
  const l = useLang();
  const t = T[l];
  const fmt = (n: number, d = 0) => fmtNum(l, n, d);
  return (
    <section>
      <h4 className="font-serif text-lg font-semibold">{t.reliefTitle}</h4>
      {!srtm && <Loading />}
      {srtm && !srtm.available && <p className="mt-1 text-ink-soft">{srtm.note}</p>}
      {srtm?.available && (
        <>
          <dl className="mt-2 grid grid-cols-[11rem_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-ink-soft">{t.elevation}</dt>
            <dd>
              {fmt(srtm.elevation_ft ?? 0)} {t.feet} <span className="text-ink-soft">({fmt(srtm.elevation_m ?? 0)} m)</span>
            </dd>
            <dt className="text-ink-soft">{t.slope}</dt>
            <dd>
              {t.slopeAvg(fmt(srtm.slope_pct ?? 0, 1), srtm.slope_word)} <span className="text-ink-soft">{t.slopeMax(fmt(srtm.slope_max_pct ?? 0, 1))}</span>
            </dd>
            <dt className="text-ink-soft">{t.relief}</dt>
            <dd>
              {fmt((srtm.relief_1km_m ?? 0) * 3.28084)} {t.feet} <span className="text-ink-soft">({fmt(srtm.relief_1km_m ?? 0)} m)</span>
            </dd>
          </dl>
          <p className="mt-2 max-w-prose text-sm text-ink-soft">
            {(srtm.slope_pct ?? 0) >= 5
              ? t.steep
              : t.flat}{" "}
            {srtm.note}
          </p>
          <p className="mt-2">
            <Source href={sourceUrl("srtm", point.lat, point.lon)} title={SOURCE_LABELS[l].srtm}>
              SRTM (NASA)
            </Source>
          </p>
        </>
      )}
    </section>
  );
}

export function AboutSmap({ point, smap }: { point: Point; smap: Smap | null }) {
  const l = useLang();
  const t = T[l];
  const data = (smap?.series ?? []).map((r) => ({ dia: dayShort(r.date, l), v: r.value === null ? null : Math.round(r.value * 100) }));
  const txt = smap?.latest
    ? t.smapText(smap.latest.word, day(smap.latest.date, l), smap.latest.percent, smap.days_with_data, smap.days_checked, Math.round((smap.mean ?? 0) * 100))
    : null;
  return (
    <section>
      <h4 className="font-serif text-lg font-semibold">{t.smapTitle}</h4>
      {!smap && <Loading />}
      {smap && !smap.available && <p className="mt-1 text-ink-soft">{smap.note}</p>}
      {smap?.available && smap.latest && txt && (
        <>
          <p className="mt-1 max-w-prose text-ink-soft">
            {txt[0]}
            <strong className="text-ink">{txt[1]}</strong>
            {txt[2]}
          </p>
          <div className="mt-3 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--rule)" vertical={false} />
                <XAxis dataKey="dia" stroke="var(--ink-soft)" fontSize={11} interval="preserveStartEnd" />
                <YAxis stroke="var(--ink-soft)" fontSize={12} width={36} unit="%" domain={[0, "auto"]} />
                <Tooltip contentStyle={tooltip} formatter={(v) => [t.pctWater(v)]} />
                <Line type="monotone" dataKey="v" name={t.moisture} stroke="var(--moss)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 max-w-prose text-sm text-ink-soft">{smap.note}</p>
          <p className="mt-2">
            <Source href={sourceUrl("smap", point.lat, point.lon)} title={SOURCE_LABELS[l].smap}>
              SMAP (NASA)
            </Source>
          </p>
        </>
      )}
    </section>
  );
}

export function AboutImerg({ point, imerg }: { point: Point; imerg: Imerg | null }) {
  const l = useLang();
  const t = T[l];
  const fmt = (n: number, d = 0) => fmtNum(l, n, d);
  const data = (imerg?.series ?? []).map((r) => ({ dia: dayShort(r.date, l), v: r.mm === null ? null : +toIn(r.mm).toFixed(2) }));
  return (
    <section>
      <h4 className="font-serif text-lg font-semibold">{t.imergTitle}</h4>
      {!imerg && <Loading />}
      {imerg && !imerg.available && <p className="mt-1 text-ink-soft">{imerg.note}</p>}
      {imerg?.available && imerg.total_mm !== undefined && (
        <>
          <p className="mt-1 max-w-prose text-ink-soft">
            {t.imergText(day(imerg.first_date ?? "", l), day(imerg.last_date ?? "", l))}
            <strong className="text-ink">{t.inches(fmt(imerg.total_in ?? 0, 2), fmt(imerg.total_mm, 0))}</strong>
            {t.imergTail(imerg.rain_days, fmt(toIn(imerg.last7_mm ?? 0), 2))}
          </p>
          <div className="mt-3 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--rule)" vertical={false} />
                <XAxis dataKey="dia" stroke="var(--ink-soft)" fontSize={11} interval={6} />
                <YAxis stroke="var(--ink-soft)" fontSize={12} width={40} unit=" in" />
                <Tooltip contentStyle={tooltip} formatter={(v) => [`${v} in`]} />
                <Bar dataKey="v" name={t.rain} fill="var(--moss)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 max-w-prose text-sm text-ink-soft">{imerg.note}</p>
          <p className="mt-2">
            <Source href={sourceUrl("imerg", point.lat, point.lon)} title={SOURCE_LABELS[l].imerg}>
              GPM IMERG (NASA)
            </Source>
          </p>
        </>
      )}
    </section>
  );
}

export function AboutNldas({ point, nldas }: { point: Point; nldas: Nldas | null }) {
  const l = useLang();
  const t = T[l];
  const fmt = (n: number, d = 0) => fmtNum(l, n, d);
  const data = (nldas?.months ?? []).map((m) => ({
    mes: `${MONTHS[l][Number(m.month.slice(5)) - 1].slice(0, 3)} ${m.month.slice(2, 4)}`,
    v: m.soil_0_100_mm === null ? null : +toIn(m.soil_0_100_mm).toFixed(1),
  }));
  const a = nldas?.soil_anomaly_pct;
  const normalIn = nldas?.normal_soil_0_100_mm ? +toIn(nldas.normal_soil_0_100_mm).toFixed(1) : null;
  const last = nldas?.months.at(-1);
  return (
    <section>
      <h4 className="font-serif text-lg font-semibold">{t.nldasTitle}</h4>
      {!nldas && <Loading />}
      {nldas && !nldas.available && <p className="mt-1 text-ink-soft">{nldas.note}</p>}
      {nldas?.available && last && (
        <>
          <p className="mt-1 max-w-prose text-ink-soft">
            {t.nldasText(monthName(last.month, l), fmt(toIn(last.soil_0_100_mm ?? 0), 1))}
            {a !== null && a !== undefined && (
              <>
                {": "}
                <strong className={a <= -10 ? "text-clay" : "text-ink"}>
                  {Math.abs(a) < 10 ? t.normal : t.vsNormal(Math.abs(a), a > 0)}
                </strong>
                {t.forMonth(nldas.normal_years)}
              </>
            )}
            {t.nldasTail(fmt(toIn(last.rain_mm ?? 0), 1), fmt(toIn(last.et_mm ?? 0), 1), fmt(toIn(last.runoff_mm ?? 0), 1))}
          </p>
          <div className="mt-3 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--rule)" vertical={false} />
                <XAxis dataKey="mes" stroke="var(--ink-soft)" fontSize={11} />
                <YAxis
                  stroke="var(--ink-soft)"
                  fontSize={12}
                  width={40}
                  unit=" in"
                  domain={[(min: number) => Math.floor(Math.min(min, normalIn ?? min) - 0.5), (max: number) => Math.ceil(Math.max(max, normalIn ?? max) + 0.5)]}
                />
                <Tooltip contentStyle={tooltip} formatter={(v) => [t.waterIn(v)]} />
                {normalIn !== null && <ReferenceLine y={normalIn} stroke="var(--field)" strokeDasharray="4 4" />}
                <Line type="monotone" dataKey="v" name={t.soilWater} stroke="var(--moss)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 max-w-prose text-sm text-ink-soft">
            {t.nldasNote(MONTHS[l][Number(last.month.slice(5)) - 1], nldas.normal_years)}{" "}
            {nldas.note}
          </p>
          <p className="mt-2">
            <Source href={sourceUrl("nldas", point.lat, point.lon)} title={SOURCE_LABELS[l].nldas}>
              NLDAS-2 (NASA)
            </Source>
          </p>
        </>
      )}
    </section>
  );
}
