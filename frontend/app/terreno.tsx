"use client";

import { useEffect, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CheckIcon, ChevronIcon, DownloadIcon, ExternalIcon, PlusIcon, ShieldIcon, Spinner, TrashIcon } from "./icons";
import { Analysis, TabId } from "./panels";
import { CROPS, ECON_CROPS, EconUS, HA_PER_ACRE, HistoryRow, MONTH_NAMES, hasEcon, toMetric } from "./shared";
import { PLOT_KEY as STORAGE_KEY } from "./auth";
import { factMoisture, factRain, factSlope, useNasa } from "./nasa";
import { notebookChanged } from "./notebook";
import { SOURCE_LABEL, SourceKey, cdlUrl, ndviUrl, powerUrl, sourceUrl, ssurgoMapUrl } from "./sources";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Point = { lat: number; lon: number };
export type Rotation = { sell: Option; cover: Option | null; label: string; note: string | null };
export type Note = { text: string; kind: "real" | "calc"; source?: SourceKey };
export type Option = {
  crop: string;
  name: string;
  kind: "cash" | "cover";
  is_current: boolean;
  plant_month: number;
  score: number;
  why: string[];
  risks: string[];
  evidence: { text: string; kind: "real" | "calc"; source?: SourceKey }[];
  gaps: string[];
  economics: { margin_per_ha: number; margin_total: number; loss: boolean; investment?: boolean } | null;
};
export type Result = {
  last_crop: string | null;
  bare_soil_months: number[];
  bare_source: "ndvi" | "history" | null;
  critical_months: number[];
  baseline: (Option & { label: string; note: string | null }) | null;
  field_notes: Note[];
  options: Option[];
  rotations: Rotation[];
  covers: Option[];
  disclaimer: string;
};
export type SoilComp = {
  map_unit: string; name: string; pct: number | null; drainage: string | null; hydgrp: string | null; slope: number | null;
  topsoil_depth_cm: number | null; sand: number | null; silt: number | null; clay: number | null;
  om: number | null; ph: number | null; ksat: number | null; awc: number | null;
};
export type Ndvi = { available: boolean; series: { date: string; ndvi: number }[]; threshold: number; low_months?: number[]; product: string; note: string };
export type Soil = { available: boolean; components: SoilComp[]; sql: string; query_page: string; note: string };
export type LocalCrops = { available: boolean; years: Record<string, Record<string, number>>; note: string; radius_km: number };

const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 7 }, (_, i) => THIS_YEAR - i);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const monthList = (ms: number[]) => {
  const n = [...ms].sort((a, b) => a - b).map((m) => MONTH_NAMES[m - 1]);
  return n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}`;
};

export const DRAINAGE: Record<string, string> = {
  "Excessively drained": "drena en exceso (se seca rápido)",
  "Somewhat excessively drained": "drena algo en exceso",
  "Well drained": "bien drenado",
  "Moderately well drained": "drena bastante bien",
  "Somewhat poorly drained": "drena algo mal",
  "Poorly drained": "drena mal (se encharca)",
  "Very poorly drained": "drena muy mal (se encharca)",
};
export function textureWord(c: SoilComp) {
  if (c.sand !== null && c.sand >= 70) return "arenoso";
  if (c.clay !== null && c.clay >= 40) return "arcilloso";
  if (c.silt !== null && c.silt >= 50) return "limoso";
  return "franco";
}

const field = "w-full rounded-md border border-field bg-paper px-3 py-2.5 text-base text-ink";

export const REPORT_KEY = "orchid.report.v1";

export function TerrenoPanel({
  point,
  data,
  local,
  loadingPoint,
  econ,
  history,
  setHistory,
  hydrated,
  go: goTab,
}: {
  point: Point | null;
  data: Analysis | null;
  local: LocalCrops | null;
  loadingPoint: boolean;
  econ: Record<string, EconUS>;
  history: HistoryRow[];
  setHistory: (h: HistoryRow[]) => void;
  hydrated: boolean;
  go: (t: TabId) => void;
}) {
  const [name, setName] = useState("");
  const [acres, setAcres] = useState("");
  const [irrigated, setIrrigated] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [soil, setSoil] = useState<Soil | null>(null);
  const [ndvi, setNdvi] = useState<Ndvi | null>(null);
  const [editing, setEditing] = useState(false);
  const [loaded, setLoaded] = useState(false); // ya se leyó lo guardado: recién entonces se puede escribir
  const [calcKey, setCalcKey] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const nasa = useNasa(point);

  useEffect(() => {
    if (!point) return;
    const ctl = new AbortController();
    const post = (path: string) =>
      fetch(`${API}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(point), signal: ctl.signal }).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
      );
    /* eslint-disable react-hooks/set-state-in-effect */
    setSoil(null);
    setNdvi(null);
    setResult(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    post("/point/soil")
      .then(setSoil)
      .catch((e) => e.name !== "AbortError" && setSoil({ available: false, components: [], sql: "", query_page: "", note: "No pudimos consultar el suelo ahora." }));
    post("/point/ndvi")
      .then(setNdvi)
      .catch((e) => e.name !== "AbortError" && setNdvi({ available: false, series: [], threshold: 0.3, product: "", note: "No pudimos consultar la imagen de satélite ahora." }));
    return () => ctl.abort();
  }, [point]);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (s) {
        /* eslint-disable react-hooks/set-state-in-effect */
        setName(s.name ?? "");
        setAcres(s.acres ?? "");
        setIrrigated(!!s.irrigated);
        /* eslint-enable react-hooks/set-state-in-effect */
      }
    } catch {}
    setLoaded(true);
  }, []);

  // No escribir hasta haber leído lo guardado (evita borrar el terreno al recargar o al volver a montar el panel).
  useEffect(() => {
    if (!hydrated || !loaded) return;
    try {
      const prev = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ name, acres, irrigated, history, point: point ?? prev?.point ?? null }));
    } catch {}
    notebookChanged();
  }, [hydrated, loaded, name, acres, irrigated, history, point]);

  function addRow() {
    const y = history.length ? history[history.length - 1].harvest_year : THIS_YEAR - 1;
    setHistory([...history, { crop: "corn", plant_year: y, plant_month: 5, harvest_year: y, harvest_month: 10 }]);
  }
  function setRow(i: number, patch: Partial<HistoryRow>) {
    setHistory(history.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  }

  const acresNum = parseFloat(acres);
  const areaOk = acresNum > 0 && acresNum <= 250000;
  const badDates = history.some((h) => h.harvest_year * 12 + h.harvest_month < h.plant_year * 12 + h.plant_month);
  const canGo = !!point && areaOk && !badDates && !busy;
  const econCount = ECON_CROPS.filter((c) => hasEcon(econ[c])).length;
  const inputsKey = JSON.stringify([acres, irrigated, history, econ]);
  const stale = !!result && calcKey !== inputsKey;
  const showForm = editing || !areaOk;

  async function go() {
    if (!point) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    const prices = Object.fromEntries(Object.entries(econ).map(([k, e]) => [k, toMetric(k, e)]));
    try {
      const r = await fetch(`${API}/recommend`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...point, area_ha: acresNum * HA_PER_ACRE, irrigated, history, prices }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setResult(await r.json());
      setCalcKey(inputsKey);
      setEditing(false);
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch {
      setErr("No pudimos calcular las opciones. Revisa tu conexión y pulsa el botón otra vez; tus datos siguen aquí.");
    } finally {
      setBusy(false);
    }
  }

  // El informe completo se arma en /informe con lo que el agricultor ve aquí; se pasa por localStorage.
  function openReport() {
    try {
      localStorage.setItem(
        REPORT_KEY,
        JSON.stringify({ createdAt: new Date().toISOString(), result: stale ? null : result, plot: { name, acres, irrigated, history, point }, econCount }),
      );
    } catch {}
    window.open("/informe", "_blank");
  }

  const soilMain = soil?.available ? soil.components[0] : null;
  const missing = !point ? "Marca tu terreno en el mapa." : !areaOk ? "Escribe el tamaño de tu terreno en acres." : badDates ? "Revisa las fechas: alguna cosecha es antes de la siembra." : null;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const facts = [areaOk ? `${acres} acres` : null, irrigated ? "con riego" : "solo lluvia", history.length ? `${plural(history.length, "cultivo")} anotado${history.length === 1 ? "" : "s"}` : "sin historial"]
    .filter(Boolean)
    .join(" · ");

  if (!point) {
    return (
      <div className="space-y-6">
        <h2 className="font-serif text-3xl font-semibold leading-tight">Marca tu campo en el mapa</h2>
        <p className="max-w-prose text-lg text-ink-soft">
          Busca tu pueblo o código postal en el mapa, acércate y haz clic sobre tu campo. Te diremos qué te conviene sembrar después.
        </p>
        <p className="text-base text-ink-soft">
          ¿Primero quieres ver cómo funciona?{" "}
          <button onClick={() => goTab("estrategias")} className="font-semibold text-moss hover:underline">
            Mira un ejemplo real
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <section aria-labelledby="plot-title">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="plot-title" className="font-serif text-3xl font-semibold leading-tight">
            {name.trim() || "Tu terreno"}
          </h2>
          {!showForm && (
            <button onClick={() => setEditing(true)} className="shrink-0 text-base font-semibold text-moss hover:underline">
              Editar datos
            </button>
          )}
        </div>
        {!showForm && <p className="mt-1 text-base text-ink-soft">{facts}</p>}

        <dl className="mt-5 space-y-2 text-base">
          <div className="flex gap-3">
            <dt className="w-32 shrink-0 text-ink-soft">Suelo</dt>
            <dd className="text-ink">
              {soilMain ? `${cap(textureWord(soilMain))}, ${DRAINAGE[soilMain.drainage ?? ""] ?? "sin dato de drenaje"}` : soil === null ? "Consultando…" : "Sin dato en este punto"}
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-32 shrink-0 text-ink-soft">Meses difíciles</dt>
            <dd className="text-ink">
              {data?.zone.id === "custom" ? cap(monthList(data.most_vulnerable_months)) : loadingPoint ? "Consultando el clima…" : "Sin dato todavía"}
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-32 shrink-0 text-ink-soft">Pendiente</dt>
            <dd className="text-ink">{factSlope(nasa.srtm)}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-32 shrink-0 text-ink-soft">Humedad</dt>
            <dd className="text-ink">{factMoisture(nasa.smap)}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-32 shrink-0 text-ink-soft">Lluvia reciente</dt>
            <dd className="text-ink">{factRain(nasa.imerg)}</dd>
          </div>
        </dl>

        {showForm && (
          <div className="mt-6 space-y-6 border-t border-rule pt-6">
            <div className="grid grid-cols-2 gap-4">
              <label className="block text-base text-ink">
                Tamaño en acres
                <input className={`${field} mt-1`} type="number" inputMode="decimal" min="0" step="any" value={acres} onChange={(e) => setAcres(e.target.value)} placeholder="Ej.: 60" />
              </label>
              <label className="block text-base text-ink">
                Nombre <span className="text-ink-soft">(opcional)</span>
                <input className={`${field} mt-1`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Lote norte" />
              </label>
            </div>
            {acres !== "" && !areaOk && <p className="text-base text-clay">Escribe un número de acres mayor que cero.</p>}

            <fieldset>
              <legend className="text-base text-ink">¿Riegas este terreno?</legend>
              <div className="mt-2 flex gap-2">
                {[false, true].map((v) => (
                  <button
                    key={String(v)}
                    onClick={() => setIrrigated(v)}
                    aria-pressed={irrigated === v}
                    className={`rounded-md border px-5 py-2.5 text-base ${irrigated === v ? "border-moss bg-moss text-paper" : "border-field text-ink hover:border-moss"}`}
                  >
                    {v ? "Sí, tengo riego" : "No, solo lluvia"}
                  </button>
                ))}
              </div>
            </fieldset>

            <div>
              <h3 className="font-serif text-lg font-semibold">Qué sembraste</h3>
              <p className="text-base text-ink-soft">Con uno o dos años basta.</p>
              <div className="mt-3 space-y-3">
                {history.map((h, i) => (
                  <div key={i} className="rounded-lg border border-rule p-4">
                    <div className="flex items-end gap-3">
                      <label className="flex-1 text-base text-ink">
                        Cultivo
                        <select className={`${field} mt-1`} value={h.crop} onChange={(e) => setRow(i, { crop: e.target.value })}>
                          {Object.entries(CROPS).map(([k, n]) => (
                            <option key={k} value={k}>{n}</option>
                          ))}
                        </select>
                      </label>
                      <button
                        onClick={() => setHistory(history.filter((_, j) => j !== i))}
                        aria-label={`Quitar ${CROPS[h.crop] ?? "cultivo"}`}
                        className="grid size-11 place-items-center rounded-md border border-field text-ink-soft hover:border-clay hover:text-clay"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-4">
                      {(
                        [
                          ["Sembré", "plant_month", "plant_year"],
                          ["Coseché", "harvest_month", "harvest_year"],
                        ] as const
                      ).map(([label, mk, yk]) => (
                        <fieldset key={label}>
                          <legend className="text-base text-ink">{label}</legend>
                          <div className="mt-1 grid grid-cols-[1fr_5.5rem] gap-2">
                            <select aria-label={`Mes: ${label.toLowerCase()}`} className={field} value={h[mk]} onChange={(e) => setRow(i, { [mk]: +e.target.value })}>
                              {MONTH_NAMES.map((m, j) => (
                                <option key={m} value={j + 1}>{cap(m)}</option>
                              ))}
                            </select>
                            <select aria-label={`Año: ${label.toLowerCase()}`} className={field} value={h[yk]} onChange={(e) => setRow(i, { [yk]: +e.target.value })}>
                              {YEARS.map((y) => (
                                <option key={y}>{y}</option>
                              ))}
                            </select>
                          </div>
                        </fieldset>
                      ))}
                    </div>
                  </div>
                ))}
                {badDates && <p className="text-base text-clay">En algún cultivo la cosecha quedó antes de la siembra. Revisa esas fechas.</p>}
                <button onClick={addRow} className="inline-flex items-center gap-2 rounded-md border border-moss px-4 py-2.5 text-base text-moss hover:bg-moss hover:text-paper">
                  <PlusIcon className="size-5" /> Agregar un cultivo
                </button>
              </div>
            </div>

            <p className="text-base text-ink-soft">
              {econCount > 0 ? `Tienes precios para ${plural(econCount, "cultivo")}.` : "Con tus precios te avisamos si algo te daría pérdida."}{" "}
              <button onClick={() => goTab("precios")} className="font-semibold text-moss hover:underline">
                {econCount > 0 ? "Cambiar mis precios" : "Poner mis precios"}
              </button>
            </p>

            {editing && areaOk && !badDates && (
              <button onClick={() => setEditing(false)} className="rounded-md border border-moss px-5 py-2.5 text-base text-moss hover:bg-moss hover:text-paper">
                Listo
              </button>
            )}
          </div>
        )}
      </section>

      {(!result || stale || busy) && (
        <div className="sticky bottom-0 -mx-8 border-t border-rule bg-paper px-8 py-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              className="rounded-md bg-moss px-7 py-3.5 text-lg font-semibold text-paper hover:bg-moss-deep disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!canGo}
              onClick={go}
            >
              {busy ? "Buscando opciones…" : result ? "Volver a calcular" : "Ver qué me conviene sembrar"}
            </button>
            {!busy && (missing ? <span className="text-base text-ink-soft">{missing}</span> : stale && <span className="text-base text-ink-soft">Cambiaste tus datos.</span>)}
          </div>
          <div aria-live="polite">{busy && <Progress data={!!data} local={!!local} soil={soil !== null} ndvi={ndvi !== null} comparing={false} />}</div>
        </div>
      )}

      {err && (
        <p role="alert" className="rounded-lg border border-clay/40 bg-paper-deep p-4 text-base text-clay">
          {err}
        </p>
      )}

      <div ref={resultsRef} className="scroll-mt-4" aria-live="polite">
        {result && !stale && <Summary r={result} onReport={openReport} />}
      </div>

      {(!result || stale) && (
        <p className="text-base text-ink-soft">
          ¿Quieres todo lo que sabemos de tu terreno?{" "}
          <button onClick={openReport} className="font-semibold text-moss hover:underline">
            Descargar el informe del terreno
          </button>
        </p>
      )}
    </div>
  );
}

const TONE: Record<string, string> = { "Mejor opción": "text-moss", "Casi tan buena": "text-ink", "Más arriesgada": "text-clay" };

/** La recomendación en limpio: qué sembrar, por qué, de qué cuidarse y el informe para ver el detalle. */
function Summary({ r, onReport }: { r: Result; onReport: () => void }) {
  const [best, ...rest] = r.rotations;
  if (!best) return null;
  const sell = best.sell;
  const others = [
    ...rest.map((rot) => ({
      key: rot.sell.crop,
      name: `${rot.sell.name} en ${MONTH_NAMES[rot.sell.plant_month - 1]}${rot.cover ? ` + ${rot.cover.name.toLowerCase()}` : ""}`,
      label: rot.label,
    })),
    ...(r.baseline ? [{ key: "baseline", name: `Seguir igual: ${r.baseline.name.toLowerCase()} otra vez`, label: r.baseline.label }] : []),
  ];
  return (
    <section aria-labelledby="best-title" className="space-y-8">
      <article className="rounded-xl bg-moss-wash p-6">
        <h2 id="best-title" className="font-serif text-3xl font-semibold leading-tight">
          Te conviene <span className="text-moss">{sell.name.toLowerCase()} en {MONTH_NAMES[sell.plant_month - 1]}</span>
        </h2>
        {best.cover && (
          <p className="mt-2 text-lg text-ink">
            Y después de cosechar, {best.cover.name.toLowerCase()} para cubrir el suelo en invierno.
          </p>
        )}
        <Money o={sell} />
        {sell.why.length > 0 && (
          <ul className="mt-4 list-disc space-y-1.5 pl-5 text-base text-ink marker:text-moss">
            {sell.why.slice(0, 3).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        {sell.risks[0] && (
          <p className="mt-4 text-base text-ink">
            <span className="font-semibold text-clay">Ten cuidado:</span> {sell.risks[0]}
          </p>
        )}
      </article>

      <div className="space-y-2">
        <button onClick={onReport} className="inline-flex items-center gap-2 rounded-md bg-moss px-6 py-3 text-base font-semibold text-paper hover:bg-moss-deep">
          <DownloadIcon /> Descargar informe completo
        </button>
        <p className="text-sm text-ink-soft">Con la evidencia de cada dato, los riesgos, lo que aún no sabemos y las demás opciones.</p>
      </div>

      {others.length > 0 && (
        <div>
          <h3 className="font-serif text-xl font-semibold">Otras opciones</h3>
          <ul className="mt-2 border-t border-rule">
            {others.map((o) => (
              <li key={o.key} className="flex items-baseline justify-between gap-4 border-b border-rule py-3 text-base">
                <span className="text-ink">{o.name}</span>
                <span className={`shrink-0 text-sm font-semibold ${TONE[o.label] ?? "text-ink-soft"}`}>{o.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-sm text-ink-soft">{r.disclaimer}</p>
    </section>
  );
}

function Progress({ data, local, soil, ndvi, comparing }: { data: boolean; local: boolean; soil: boolean; ndvi: boolean; comparing: boolean }) {
  const steps: [string, boolean][] = [
    ["Clima de tu zona", data],
    ["Cultivos de la zona", local],
    ["Suelo de tu terreno", soil],
    ["Imagen de satélite", ndvi],
    ["Comparando rotaciones para tu terreno", comparing],
  ];
  return (
    <div className="mt-3 space-y-1.5 text-base">
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
        {steps.map(([label, ok]) => (
          <li key={label} className={`flex items-center gap-1.5 ${ok ? "text-ink" : "text-ink-soft"}`}>
            {ok ? <CheckIcon className="size-4 text-moss" /> : <Spinner className="size-4 text-moss" />}
            {label}
          </li>
        ))}
      </ul>
      {!ndvi && <p className="text-sm text-ink-soft">La imagen de satélite tarda 1 o 2 minutos la primera vez. Después es inmediata.</p>}
    </div>
  );
}

/* ------------------------------ Resultados ------------------------------ */

function Money({ o }: { o: Option }) {
  if (!o.economics) return null;
  const perAcre = Math.round(o.economics.margin_per_ha * HA_PER_ACRE);
  const total = Math.round(o.economics.margin_total);
  const fmt = (n: number) => n.toLocaleString("es-US");
  return (
    <p className={`mt-3 text-base ${o.economics.loss ? "text-clay" : "text-ink"}`}>
      <strong>{o.economics.investment ? "Costo estimado" : o.economics.loss ? "Pérdida estimada" : "Ganancia estimada"}:</strong>{" "}
      {fmt(perAcre)} $ por acre · {fmt(total)} $ en total, con tus números.
    </p>
  );
}

function Evidence({ o, point }: { o: Option; point: Point }) {
  return (
    <details className="group mt-3">
      <summary className="inline-flex cursor-pointer items-center gap-1.5 text-base text-moss hover:underline">
        <ShieldIcon className="size-5" /> ¿De dónde sale esto?
      </summary>
      <div className="mt-3 space-y-3 text-sm">
        <ul className="space-y-2">
          {o.evidence.map((e) => (
            <li key={e.text} className="text-ink-soft">
              {e.text}.{" "}
              {e.kind === "real" && e.source ? (
                <a href={sourceUrl(e.source, point.lat, point.lon)} target="_blank" rel="noopener noreferrer" title={SOURCE_LABEL[e.source]} className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-moss underline">
                  Ver dato oficial <ExternalIcon />
                </a>
              ) : (
                <span className="whitespace-nowrap text-ink-faint">(cálculo de Orchid)</span>
              )}
            </li>
          ))}
        </ul>
        {o.gaps.length > 0 && (
          <div>
            <p className="font-semibold text-ink">Lo que aún no sabemos</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-soft marker:text-field">
              {o.gaps.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

function Reasons({ o, limit }: { o: Option; limit?: number }) {
  const why = limit ? o.why.slice(0, limit) : o.why;
  const risks = limit ? o.risks.slice(0, limit) : o.risks;
  return (
    <div className="mt-3 grid gap-4 text-base sm:grid-cols-2">
      {why.length > 0 && (
        <div>
          <p className="font-semibold text-ink">Por qué sí</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-soft marker:text-moss">
            {why.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {risks.length > 0 && (
        <div>
          <p className="font-semibold text-ink">Ten cuidado con</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-soft marker:text-clay">
            {risks.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const coverLine = (o: Option) => `${o.name} después de la cosecha`;

function RotationBody({ rot, point }: { rot: Rotation; point: Point }) {
  const sell = rot.sell;
  const cover = rot.cover;
  return (
    <>
      <p className="text-base text-ink-soft">
        <span className="text-ink">Cultivo de venta:</span> {sell.name.toLowerCase()} en {MONTH_NAMES[sell.plant_month - 1]}.
        {cover && (
          <>
            {" "}
            <span className="text-ink">Cobertura opcional:</span> {coverLine(cover).toLowerCase()}, para cubrir el suelo en invierno.
          </>
        )}
      </p>
      <Money o={sell} />
      <Reasons o={sell} limit={3} />
      <Evidence o={sell} point={point} />
      {cover && <CoverNote o={cover} point={point} />}
    </>
  );
}

function CoverNote({ o, point }: { o: Option; point: Point }) {
  return (
    <div className="mt-4 border-t border-rule pt-4">
      <p className="font-semibold text-ink">Sobre la cobertura: {o.name.toLowerCase()}</p>
      <Money o={o} />
      <Reasons o={o} limit={2} />
      <Evidence o={o} point={point} />
    </div>
  );
}

const labelTone = (label: string) => (label === "Mejor opción" ? "text-moss" : label === "Casi tan buena" ? "text-ink" : "text-clay");

function FieldNotes({ notes, point }: { notes: Note[]; point: Point }) {
  if (!notes.length) return null;
  return (
    <div>
      <h3 className="font-serif text-xl font-semibold">Tu terreno, en pocas palabras</h3>
      <ul className="mt-2 space-y-1.5 text-base text-ink-soft">
        {notes.map((n) => (
          <li key={n.text}>
            {n.text}.{" "}
            {n.kind === "real" && n.source ? (
              <a href={sourceUrl(n.source, point.lat, point.lon)} target="_blank" rel="noopener noreferrer" title={SOURCE_LABEL[n.source]} className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-moss underline">
                Ver dato oficial <ExternalIcon />
              </a>
            ) : (
              <span className="text-sm text-ink-faint">(consejo de Orchid)</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Resultados con todo el detalle (evidencia, vacíos, riesgos, otras rotaciones). Se usa en el informe. */
export function ReportResults({ r, name, point }: { r: Result; name: string; point: Point }) {
  const [best, ...rest] = r.rotations;
  return (
    <section className="space-y-8 border-t border-rule pt-8">
      <div>
        <h2 className="font-serif text-3xl font-semibold">Lo que te sugerimos{name ? ` para ${name}` : ""}</h2>
        <p className="mt-2 max-w-prose text-base text-ink-soft">
          {r.last_crop ? `Tu último cultivo fue ${(CROPS[r.last_crop] ?? r.last_crop).toLowerCase()}. ` : ""}
          Los meses más difíciles del clima aquí son {monthList(r.critical_months)}.
        </p>
      </div>

      {best && (
        <article className="rounded-xl bg-moss-wash p-6">
          <h3 className="font-serif text-3xl font-semibold leading-tight">
            <span className="text-moss">{best.label}:</span> {best.sell.name.toLowerCase()} en {MONTH_NAMES[best.sell.plant_month - 1]}
            {best.cover ? <span className="text-ink-soft">, y {best.cover.name.toLowerCase()} después de cosechar</span> : null}
          </h3>
          <div className="mt-4">
            <RotationBody rot={best} point={point} />
          </div>
        </article>
      )}

      <FieldNotes notes={r.field_notes} point={point} />

      {(rest.length > 0 || r.baseline) && (
        <div>
          <h3 className="font-serif text-xl font-semibold">Otras rotaciones</h3>
          <div className="mt-2 border-t border-rule">
            {rest.map((rot) => (
              <details key={rot.sell.crop} className="group border-b border-rule py-4">
                <summary className="flex cursor-pointer items-center gap-3">
                  <ChevronIcon className="size-5 shrink-0 text-moss transition-transform group-open:rotate-90" />
                  <span className="flex-1">
                    <span className="block font-serif text-lg font-semibold">
                      {rot.sell.name} en {MONTH_NAMES[rot.sell.plant_month - 1]}
                      {rot.cover ? ` + ${rot.cover.name.toLowerCase()}` : ""}
                    </span>
                    <span className={`text-base font-semibold ${labelTone(rot.label)}`}>{rot.label}</span>
                    {rot.note && <span className="block text-base text-ink-soft">{rot.note}</span>}
                  </span>
                </summary>
                <div className="pl-8 pt-3">
                  <RotationBody rot={rot} point={point} />
                </div>
              </details>
            ))}
            {r.baseline && (
              <details className="group border-b border-rule py-4">
                <summary className="flex cursor-pointer items-center gap-3">
                  <ChevronIcon className="size-5 shrink-0 text-moss transition-transform group-open:rotate-90" />
                  <span className="flex-1">
                    <span className="block font-serif text-lg font-semibold">Seguir igual: {r.baseline.name.toLowerCase()} otra vez</span>
                    <span className={`text-base font-semibold ${labelTone(r.baseline.label)}`}>{r.baseline.label}</span>
                    {r.baseline.note && <span className="block text-base text-ink-soft">{r.baseline.note}</span>}
                  </span>
                </summary>
                <div className="pl-8 pt-3">
                  <Money o={r.baseline} />
                  <Reasons o={r.baseline} limit={3} />
                  <Evidence o={r.baseline} point={point} />
                </div>
              </details>
            )}
          </div>
        </div>
      )}

      <p className="text-sm text-ink-soft">{r.disclaimer}</p>
    </section>
  );
}

/* ----------------------- Lo que sabemos del terreno ----------------------- */

function SourceLink({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title={title} className="inline-flex items-center gap-1 text-sm font-semibold text-moss underline">
      {children} <ExternalIcon />
    </a>
  );
}

export function AboutClimate({ point, data, loading }: { point: Point; data: Analysis | null; loading: boolean }) {
  return (
    <section>
      <h4 className="font-serif text-lg font-semibold">Clima</h4>
      {loading && !data && <p className="text-ink-soft">Consultando…</p>}
      {data && data.zone.id === "custom" && (
        <p className="mt-1 text-ink-soft">
          Los meses con más calor, menos lluvia y suelo más seco son <strong className="text-ink">{monthList(data.most_vulnerable_months)}</strong>. Promedio de
          2015 a 2024. En «Más datos → Clima» puedes ver día por día.
        </p>
      )}
      <p className="mt-1">
        <SourceLink href={powerUrl(point.lat, point.lon)} title={SOURCE_LABEL.power}>Ver en NASA POWER</SourceLink>
      </p>
    </section>
  );
}

export function AboutCrops({ point, local }: { point: Point; local: LocalCrops | null }) {
  const avg: Record<string, number> = {};
  if (local?.available) {
    const ys = Object.values(local.years);
    ys.forEach((y) => Object.entries(y).forEach(([k, v]) => (avg[k] = (avg[k] ?? 0) + v / ys.length)));
  }
  const nearby = Object.entries(avg)
    .filter(([k]) => k !== "otros usos")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  return (
    <section>
      <h4 className="font-serif text-lg font-semibold">Qué se siembra a tu alrededor</h4>
      <p className="mt-1 text-ink-soft">En unas 0.7 millas a tu alrededor, promedio de 2021 a 2025.</p>
      {!local && <p className="text-ink-soft">Consultando…</p>}
      {local && !local.available && <p className="mt-1 text-ink-soft">{local.note}</p>}
      {local?.available && (
        <ul className="mt-3 max-w-md space-y-2">
          {nearby.map(([k, v]) => (
            <li key={k} className="grid grid-cols-[9rem_1fr_3rem] items-center gap-3">
              <span>{cap(CROPS[k] ?? k)}</span>
              <span className="h-2.5 rounded-full bg-paper-deep">
                <span className="block h-full rounded-full bg-moss" style={{ width: `${Math.max(2, v * 100)}%` }} />
              </span>
              <span className="text-right tabular-nums text-ink-soft">{Math.round(v * 100)}%</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2">
        <SourceLink href={cdlUrl(point.lat, point.lon)} title={SOURCE_LABEL.cdl}>Ver mapa oficial de cultivos (USDA)</SourceLink>
      </p>
    </section>
  );
}

export function AboutSoil({ point, soil }: { point: Point; soil: Soil | null }) {
  const c = soil?.available ? soil.components[0] : null;
  const fmt = (v: number | null, d = 0, u = "") => (v === null ? "sin dato" : `${v.toFixed(d)}${u}`);
  return (
    <section>
      <h4 className="font-serif text-lg font-semibold">Suelo</h4>
      {!soil && <p className="text-ink-soft">Consultando…</p>}
      {soil && !c && <p className="mt-1 text-ink-soft">{soil.note}</p>}
      {c && (
        <dl className="mt-2 grid max-w-xl grid-cols-[11rem_1fr] gap-x-4 gap-y-3">
          <dt className="text-ink-soft">Tipo</dt>
          <dd>
            Suelo {textureWord(c)}{" "}
            <span className="text-sm text-ink-soft">(en el mapa de suelos del USDA se llama «{c.name}»)</span>
            <span className="block text-sm text-ink-soft">
              {fmt(c.sand)}% arena, {fmt(c.silt)}% limo, {fmt(c.clay)}% arcilla. Más arena se seca rápido; más arcilla guarda agua pero la absorbe lento.
            </span>
          </dd>
          <dt className="text-ink-soft">Drenaje</dt>
          <dd>{cap(DRAINAGE[c.drainage ?? ""] ?? "sin dato")}</dd>
          <dt className="text-ink-soft">Agua que guarda</dt>
          <dd>
            {c.awc === null ? "sin dato" : c.awc < 0.12 ? "Poca" : c.awc >= 0.18 ? "Buena" : "Media"}
            <span className="block text-sm text-ink-soft">Cuánta agua queda disponible para las raíces después de llover.</span>
          </dd>
          <dt className="text-ink-soft">Materia orgánica</dt>
          <dd>{fmt(c.om, 1, " %")}</dd>
          <dt className="text-ink-soft">Acidez (pH)</dt>
          <dd>
            {fmt(c.ph, 1)} <span className="text-sm text-ink-soft">(7 es neutro)</span>
          </dd>
          <dt className="text-ink-soft">Pendiente</dt>
          <dd>
            {fmt(c.slope, 0, " %")} <span className="text-sm text-ink-soft">(más pendiente, más riesgo de erosión)</span>
          </dd>
        </dl>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <SourceLink href={ssurgoMapUrl(point.lat, point.lon)} title={SOURCE_LABEL.ssurgo}>Ver mapa oficial de suelos (USDA)</SourceLink>
        {c && (
          <details className="text-sm text-ink-soft">
            <summary className="cursor-pointer text-moss underline">Consulta técnica</summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md border border-rule bg-paper-deep p-3 text-xs">{soil!.sql}</pre>
            <p className="mt-1">
              Pégala en{" "}
              <a className="text-moss underline" href={soil!.query_page} target="_blank" rel="noopener noreferrer">
                Soil Data Access
              </a>{" "}
              para obtener los mismos números.
            </p>
          </details>
        )}
      </div>
    </section>
  );
}

export function AboutGreen({ point, ndvi }: { point: Point; ndvi: Ndvi | null }) {
  const low = ndvi?.low_months ?? [];
  return (
    <section>
      <h4 className="font-serif text-lg font-semibold">Qué tan verde se ve tu campo desde el satélite</h4>
      {!ndvi && <p className="mt-1 text-ink-soft">Consultando… la primera vez tarda 1 o 2 minutos.</p>}
      {ndvi && !ndvi.available && <p className="mt-1 text-ink-soft">{ndvi.note}</p>}
      {ndvi?.available && (
        <>
          <p className="mt-1 text-ink-soft">
            Más alto es más vegetación verde; cerca de 0 es tierra sin cubrir.{" "}
            {low.length > 0 ? (
              <>
                El último año tu campo estuvo con poca vegetación en <strong className="text-ink">{monthList(low)}</strong>.
              </>
            ) : (
              "El último año tu campo no quedó sin cubrir."
            )}
          </p>
          <div className="mt-3 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ndvi.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--rule)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--ink-soft)" fontSize={12} minTickGap={36} tickFormatter={(d: string) => `${MONTH_NAMES[+d.slice(5, 7) - 1].slice(0, 3)} ${d.slice(0, 4)}`} />
                <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} stroke="var(--ink-soft)" fontSize={12} width={32} />
                <Tooltip
                  contentStyle={{ background: "var(--paper)", border: "1px solid var(--rule)", color: "var(--ink)" }}
                  labelFormatter={(d) => String(d)}
                  formatter={(v) => [String(v), "Verdor"]}
                />
                <ReferenceLine y={ndvi.threshold} stroke="var(--clay)" strokeDasharray="4 3" />
                <Line dataKey="ndvi" stroke="var(--moss)" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            Índice de verdor (NDVI) del satélite MODIS, cada 16 días. La línea punteada ({ndvi.threshold}) es el límite que usamos para decir «poca
            vegetación»; lo elegimos nosotros, no la NASA.
          </p>
        </>
      )}
      <p className="mt-2">
        <SourceLink href={ndviUrl(point.lat, point.lon)} title={SOURCE_LABEL.ndvi}>Ver datos oficiales del satélite (NASA)</SourceLink>
      </p>
    </section>
  );
}

