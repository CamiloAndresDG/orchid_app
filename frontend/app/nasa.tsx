"use client";

// Fuentes de NASA Earthdata por punto: SMAP (humedad del suelo), IMERG (lluvia por satélite),
// NLDAS (agua guardada en el suelo) y SRTM (relieve). El backend usa el token de Earthdata del servidor.

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ExternalIcon } from "./icons";
import { API, MONTH_NAMES } from "./shared";
import { SOURCE_LABEL, sourceUrl } from "./sources";
import type { Point } from "./terreno";

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
  const [smap, setSmap] = useState<Smap | null>(null);
  const [imerg, setImerg] = useState<Imerg | null>(null);
  const [nldas, setNldas] = useState<Nldas | null>(null);
  const [srtm, setSrtm] = useState<Srtm | null>(null);

  useEffect(() => {
    if (!point) return;
    const ctl = new AbortController();
    const post = (path: string) =>
      fetch(`${API}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(point), signal: ctl.signal }).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
      );
    const off = { available: false, note: "No pudimos consultar esta fuente de la NASA ahora. Vuelve a marcar el terreno para intentarlo otra vez." };
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
  }, [point]);

  return { smap, imerg, nldas, srtm };
}

/* ------------------------------- Textos cortos ------------------------------- */

const fmt = (n: number, d = 0) => n.toLocaleString("es-US", { maximumFractionDigits: d, minimumFractionDigits: d });
const toIn = (mm: number) => mm / 25.4;
const day = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} de ${MONTH_NAMES[m - 1]}`;
};
const monthName = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} de ${y}`;
};

/** Una línea para el resumen de "Tu terreno". */
export const factSlope = (s: Srtm | null) =>
  !s ? "Consultando…" : s.available && s.slope_pct !== undefined ? `${fmt(s.slope_pct, 1)}%, ${s.slope_word}` : "Sin dato en este punto";
export const factMoisture = (s: Smap | null) =>
  !s ? "Consultando…" : s.available && s.latest ? `${s.latest.percent}% de agua en la superficie (${day(s.latest.date)})` : "Sin medida reciente";
export const factRain = (i: Imerg | null) =>
  !i ? "Consultando…" : i.available && i.total_mm !== undefined ? `${fmt(i.total_in ?? 0, 1)} in (${fmt(i.total_mm, 0)} mm) en ${i.days} días` : "Sin dato en este punto";

/* ------------------------------ Para el informe ------------------------------ */

function Source({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title={title} className="inline-flex items-center gap-1 text-sm font-semibold text-moss underline">
      {children} <ExternalIcon />
    </a>
  );
}
const Loading = () => <p className="mt-1 text-ink-soft">Consultando a la NASA…</p>;
const tooltip = { background: "var(--paper)", border: "1px solid var(--rule)", color: "var(--ink)" };

export function AboutSrtm({ point, srtm }: { point: Point; srtm: Srtm | null }) {
  return (
    <section>
      <h4 className="font-serif text-lg font-semibold">Relieve de tu terreno</h4>
      {!srtm && <Loading />}
      {srtm && !srtm.available && <p className="mt-1 text-ink-soft">{srtm.note}</p>}
      {srtm?.available && (
        <>
          <dl className="mt-2 grid grid-cols-[11rem_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-ink-soft">Altura</dt>
            <dd>
              {fmt(srtm.elevation_ft ?? 0)} pies <span className="text-ink-soft">({fmt(srtm.elevation_m ?? 0)} m)</span>
            </dd>
            <dt className="text-ink-soft">Pendiente</dt>
            <dd>
              {fmt(srtm.slope_pct ?? 0, 1)}% en promedio, {srtm.slope_word} <span className="text-ink-soft">(hasta {fmt(srtm.slope_max_pct ?? 0, 1)}% en algún tramo)</span>
            </dd>
            <dt className="text-ink-soft">Desnivel en 1 km</dt>
            <dd>
              {fmt((srtm.relief_1km_m ?? 0) * 3.28084)} pies <span className="text-ink-soft">({fmt(srtm.relief_1km_m ?? 0)} m)</span>
            </dd>
          </dl>
          <p className="mt-2 max-w-prose text-sm text-ink-soft">
            {(srtm.slope_pct ?? 0) >= 5
              ? "Con esta pendiente, el agua de lluvia arrastra suelo si queda desnudo: ayudan las coberturas, el rastrojo y sembrar siguiendo las curvas de nivel."
              : "Con poca pendiente el riesgo de erosión por lluvia es bajo; en zonas bajas puede acumularse agua."}{" "}
            {srtm.note}
          </p>
          <p className="mt-2">
            <Source href={sourceUrl("srtm", point.lat, point.lon)} title={SOURCE_LABEL.srtm}>
              SRTM (NASA)
            </Source>
          </p>
        </>
      )}
    </section>
  );
}

export function AboutSmap({ point, smap }: { point: Point; smap: Smap | null }) {
  const data = (smap?.series ?? []).map((r) => ({ dia: day(r.date).replace(" de ", " "), Humedad: r.value === null ? null : Math.round(r.value * 100) }));
  return (
    <section>
      <h4 className="font-serif text-lg font-semibold">Humedad del suelo medida por satélite</h4>
      {!smap && <Loading />}
      {smap && !smap.available && <p className="mt-1 text-ink-soft">{smap.note}</p>}
      {smap?.available && smap.latest && (
        <>
          <p className="mt-1 max-w-prose text-ink-soft">
            El satélite SMAP midió la superficie de tu suelo <strong className="text-ink">{smap.latest.word}</strong> el {day(smap.latest.date)}:{" "}
            {smap.latest.percent}% del volumen era agua. En las últimas dos semanas tuvo medida {smap.days_with_data} de {smap.days_checked} días, con un
            promedio de {Math.round((smap.mean ?? 0) * 100)}%.
          </p>
          <div className="mt-3 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--rule)" vertical={false} />
                <XAxis dataKey="dia" stroke="var(--ink-soft)" fontSize={11} interval="preserveStartEnd" />
                <YAxis stroke="var(--ink-soft)" fontSize={12} width={36} unit="%" domain={[0, "auto"]} />
                <Tooltip contentStyle={tooltip} formatter={(v) => [`${v}% de agua`]} />
                <Line type="monotone" dataKey="Humedad" stroke="var(--moss)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 max-w-prose text-sm text-ink-soft">{smap.note}</p>
          <p className="mt-2">
            <Source href={sourceUrl("smap", point.lat, point.lon)} title={SOURCE_LABEL.smap}>
              SMAP (NASA)
            </Source>
          </p>
        </>
      )}
    </section>
  );
}

export function AboutImerg({ point, imerg }: { point: Point; imerg: Imerg | null }) {
  const data = (imerg?.series ?? []).map((r) => ({ dia: day(r.date).replace(" de ", " "), Lluvia: r.mm === null ? null : +toIn(r.mm).toFixed(2) }));
  return (
    <section>
      <h4 className="font-serif text-lg font-semibold">Lluvia reciente por satélite</h4>
      {!imerg && <Loading />}
      {imerg && !imerg.available && <p className="mt-1 text-ink-soft">{imerg.note}</p>}
      {imerg?.available && imerg.total_mm !== undefined && (
        <>
          <p className="mt-1 max-w-prose text-ink-soft">
            Del {day(imerg.first_date ?? "")} al {day(imerg.last_date ?? "")} cayeron{" "}
            <strong className="text-ink">
              {fmt(imerg.total_in ?? 0, 2)} pulgadas ({fmt(imerg.total_mm, 0)} mm)
            </strong>{" "}
            en {imerg.rain_days} días con lluvia; en los últimos 7 días, {fmt(toIn(imerg.last7_mm ?? 0), 2)} in.
          </p>
          <div className="mt-3 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--rule)" vertical={false} />
                <XAxis dataKey="dia" stroke="var(--ink-soft)" fontSize={11} interval={6} />
                <YAxis stroke="var(--ink-soft)" fontSize={12} width={40} unit=" in" />
                <Tooltip contentStyle={tooltip} formatter={(v) => [`${v} in`]} />
                <Bar dataKey="Lluvia" fill="var(--moss)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 max-w-prose text-sm text-ink-soft">{imerg.note}</p>
          <p className="mt-2">
            <Source href={sourceUrl("imerg", point.lat, point.lon)} title={SOURCE_LABEL.imerg}>
              GPM IMERG (NASA)
            </Source>
          </p>
        </>
      )}
    </section>
  );
}

export function AboutNldas({ point, nldas }: { point: Point; nldas: Nldas | null }) {
  const data = (nldas?.months ?? []).map((m) => ({
    mes: `${MONTH_NAMES[Number(m.month.slice(5)) - 1].slice(0, 3)} ${m.month.slice(2, 4)}`,
    "Agua en el suelo": m.soil_0_100_mm === null ? null : +toIn(m.soil_0_100_mm).toFixed(1),
  }));
  const a = nldas?.soil_anomaly_pct;
  const normalIn = nldas?.normal_soil_0_100_mm ? +toIn(nldas.normal_soil_0_100_mm).toFixed(1) : null;
  const last = nldas?.months.at(-1);
  return (
    <section>
      <h4 className="font-serif text-lg font-semibold">Agua guardada en tu suelo</h4>
      {!nldas && <Loading />}
      {nldas && !nldas.available && <p className="mt-1 text-ink-soft">{nldas.note}</p>}
      {nldas?.available && last && (
        <>
          <p className="mt-1 max-w-prose text-ink-soft">
            Al cierre de {monthName(last.month)}, el primer metro de tu suelo guardaba {fmt(toIn(last.soil_0_100_mm ?? 0), 1)} pulgadas de agua
            {a !== null && a !== undefined && (
              <>
                {": "}
                <strong className={a <= -10 ? "text-clay" : "text-ink"}>
                  {Math.abs(a) < 10 ? "lo normal" : `${Math.abs(a)}% ${a > 0 ? "más" : "menos"} que lo normal`}
                </strong>{" "}
                para ese mes (promedio {nldas.normal_years})
              </>
            )}
            . Ese mes llovieron {fmt(toIn(last.rain_mm ?? 0), 1)} in, se evaporaron o usaron las plantas {fmt(toIn(last.et_mm ?? 0), 1)} in y escurrieron{" "}
            {fmt(toIn(last.runoff_mm ?? 0), 1)} in.
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
                <Tooltip contentStyle={tooltip} formatter={(v) => [`${v} in de agua`]} />
                {normalIn !== null && <ReferenceLine y={normalIn} stroke="var(--field)" strokeDasharray="4 4" />}
                <Line type="monotone" dataKey="Agua en el suelo" stroke="var(--moss)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 max-w-prose text-sm text-ink-soft">
            Agua en el primer metro de suelo al final de cada mes. La línea punteada es lo normal para {monthName(last.month).split(" de ")[0]} ({nldas.normal_years}).{" "}
            {nldas.note}
          </p>
          <p className="mt-2">
            <Source href={sourceUrl("nldas", point.lat, point.lon)} title={SOURCE_LABEL.nldas}>
              NLDAS-2 (NASA)
            </Source>
          </p>
        </>
      )}
    </section>
  );
}
