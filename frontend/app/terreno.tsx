"use client";

import { useEffect, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CheckIcon, ChevronIcon, ExternalIcon, PlusIcon, ShieldIcon, Spinner, TrashIcon } from "./icons";
import { AboutFit, AboutHarvests, AboutRain, AboutSeason, useAgro } from "./agro";
import { Analysis, TabId } from "./panels";
import { CROPS, ECON_CROPS, EconUS, HA_PER_ACRE, HistoryRow, MONTH_NAMES, hasEcon, toMetric } from "./shared";
import { SOURCE_LABEL, SourceKey, cdlUrl, ndviUrl, powerUrl, sourceUrl, ssurgoMapUrl } from "./sources";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const STORAGE_KEY = "fieldshift.plot.v1";

export type Point = { lat: number; lon: number };
type Rotation = { sell: Option; cover: Option | null; label: string; note: string | null };
type Note = { text: string; kind: "real" | "calc"; source?: SourceKey };
type Option = {
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
type Result = {
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
type SoilComp = {
  map_unit: string; name: string; pct: number | null; drainage: string | null; hydgrp: string | null; slope: number | null;
  topsoil_depth_cm: number | null; sand: number | null; silt: number | null; clay: number | null;
  om: number | null; ph: number | null; ksat: number | null; awc: number | null;
};
type Ndvi = { available: boolean; series: { date: string; ndvi: number }[]; threshold: number; low_months?: number[]; product: string; note: string };
type Soil = { available: boolean; components: SoilComp[]; sql: string; query_page: string; note: string };
export type LocalCrops = { available: boolean; years: Record<string, Record<string, number>>; note: string; radius_km: number };

const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 7 }, (_, i) => THIS_YEAR - i);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const monthList = (ms: number[]) => {
  const n = [...ms].sort((a, b) => a - b).map((m) => MONTH_NAMES[m - 1]);
  return n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}`;
};

const DRAINAGE: Record<string, string> = {
  "Excessively drained": "drena en exceso (se seca rápido)",
  "Somewhat excessively drained": "drena algo en exceso",
  "Well drained": "bien drenado",
  "Moderately well drained": "drena bastante bien",
  "Somewhat poorly drained": "drena algo mal",
  "Poorly drained": "drena mal (se encharca)",
  "Very poorly drained": "drena muy mal (se encharca)",
};
function textureWord(c: SoilComp) {
  if (c.sand !== null && c.sand >= 70) return "arenoso";
  if (c.clay !== null && c.clay >= 40) return "arcilloso";
  if (c.silt !== null && c.silt >= 50) return "limoso";
  return "franco";
}

const field = "w-full rounded-md border border-field bg-paper px-3 py-2.5 text-base text-ink";

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <section className="border-t border-rule pt-6">
      <h3 className="flex items-center gap-3 font-serif text-xl font-semibold">
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-full font-sans text-base ${done ? "bg-moss text-paper" : "border-2 border-moss text-moss"}`}
          aria-hidden
        >
          {done ? <CheckIcon className="size-4" /> : n}
        </span>
        {title}
        {done && <span className="sr-only">(listo)</span>}
      </h3>
      <div className="mt-4 pl-11">{children}</div>
    </section>
  );
}

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
  const [aboutOpen, setAboutOpen] = useState(false);
  const agro = useAgro(point);
  const resultsRef = useRef<HTMLDivElement>(null);
  const aboutRef = useRef<HTMLDetailsElement>(null);

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
  }, []);

  // No escribir hasta que la pagina haya leido lo guardado (evita borrar el terreno al recargar).
  useEffect(() => {
    if (!hydrated) return;
    try {
      const prev = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ name, acres, irrigated, history, point: point ?? prev?.point ?? null }));
    } catch {}
  }, [hydrated, name, acres, irrigated, history, point]);

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
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch {
      setErr("No pudimos calcular las opciones. Revisa tu conexión y pulsa el botón otra vez; tus datos siguen aquí.");
    } finally {
      setBusy(false);
    }
  }

  function openAbout() {
    setAboutOpen(true);
    requestAnimationFrame(() => aboutRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  const soilMain = soil?.available ? soil.components[0] : null;
  const missing = !point ? "Marca tu terreno en el mapa." : !areaOk ? "Escribe el tamaño de tu terreno en acres." : badDates ? "Revisa las fechas: alguna cosecha es antes de la siembra." : null;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-serif text-3xl font-semibold">Mi terreno</h2>
        <p className="mt-2 max-w-prose text-base text-ink-soft">Tres pasos y te sugerimos qué sembrar después. Tú decides: esto es una ayuda, no una orden.</p>
      </div>

      <Step n={1} title="Marca tu terreno" done={!!point}>
        {!point ? (
          <p className="text-base text-ink-soft">Haz clic sobre tu campo en el mapa de la izquierda.</p>
        ) : (
          <div className="space-y-2 text-base">
            <p className="text-ink">Listo, ya tenemos tu terreno.</p>
            <p className="text-ink-soft">
              {soilMain ? (
                <>
                  Suelo {textureWord(soilMain)} que {DRAINAGE[soilMain.drainage ?? ""] ?? "sin dato de drenaje"}
                  {data?.zone.id === "custom" ? " · " : "."}
                </>
              ) : (
                soil === null && "Consultando el suelo… "
              )}
              {data?.zone.id === "custom" && <>meses más secos y calurosos: {monthList(data.most_vulnerable_months)}.</>}
              {loadingPoint && !data && " Consultando el clima…"}
            </p>
            <button onClick={openAbout} className="inline-flex items-center gap-1 text-base font-semibold text-moss hover:underline">
              Ver todo lo que sabemos de tu terreno <ChevronIcon className="size-4" />
            </button>
          </div>
        )}
      </Step>

      <Step n={2} title="Tamaño y riego" done={areaOk}>
        <div className="grid max-w-lg grid-cols-2 gap-4">
          <label className="block text-base text-ink">
            Tamaño en acres
            <input className={`${field} mt-1`} type="number" inputMode="decimal" min="0" step="any" value={acres} onChange={(e) => setAcres(e.target.value)} placeholder="Ej.: 60" />
          </label>
          <label className="block text-base text-ink">
            Nombre <span className="text-ink-soft">(opcional)</span>
            <input className={`${field} mt-1`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Lote norte" />
          </label>
        </div>
        {acres !== "" && !areaOk && <p className="mt-2 text-base text-clay">Escribe un número de acres mayor que cero.</p>}
        <fieldset className="mt-5">
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
      </Step>

      <Step n={3} title="Qué sembraste" done={history.length > 0}>
        <p className="text-base text-ink-soft">Agrega cada cultivo con su mes de siembra y de cosecha. Con uno o dos años basta.</p>
        <div className="mt-4 space-y-3">
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
                    <div className="mt-1 grid grid-cols-[1fr_6rem] gap-2">
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
          {history.length === 0 && <p className="text-base text-ink-soft">Si no lo recuerdas, puedes seguir sin historial; las opciones serán menos precisas.</p>}
        </div>
        <p className="mt-6 text-base text-ink-soft">
          <span className="text-ink">¿Quieres evitar opciones que te den pérdida?</span>{" "}
          {econCount > 0 ? `Tienes precios para ${econCount} cultivo${econCount === 1 ? "" : "s"}.` : "Pon tus precios y costos (opcional)."}{" "}
          <button onClick={() => goTab("precios")} className="font-semibold text-moss hover:underline">
            {econCount > 0 ? "Cambiar mis precios" : "Poner mis precios"}
          </button>
        </p>
      </Step>

      <div className="sticky bottom-0 -mx-10 border-t border-rule bg-paper px-10 py-4 shadow-[0_-6px_12px_-8px_rgb(0_0_0/0.25)]">
        <div className="flex flex-wrap items-center gap-4">
          <button
            className="rounded-md bg-moss px-7 py-3.5 text-lg font-semibold text-paper shadow-[0_2px_6px_rgb(0_0_0/0.18)] hover:bg-moss-deep disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!canGo}
            onClick={go}
          >
            {busy ? "Buscando opciones…" : result ? "Volver a calcular" : "Ver qué me conviene sembrar"}
          </button>
          {missing && !busy && <span className="text-base text-ink-soft">{missing}</span>}
        </div>
        <div aria-live="polite">{busy && <Progress data={!!data} local={!!local} soil={soil !== null} ndvi={ndvi !== null} comparing={false} />}</div>
      </div>

      {err && (
        <p role="alert" className="rounded-lg border border-clay/40 bg-paper-deep p-4 text-base text-clay">
          {err}
        </p>
      )}

      <div ref={resultsRef} className="scroll-mt-4">
        {result && point && (
        <>
          <Results r={result} name={name} point={point} />
          <div className="flex justify-end">
            <button onClick={go} className="rounded-md border border-moss px-5 py-2.5 text-base text-moss hover:bg-moss hover:text-paper">
              Volver a calcular con mis datos
            </button>
          </div>
        </>
      )}
      </div>

      {point && (
        <details
          ref={aboutRef}
          open={aboutOpen}
          onToggle={(e) => setAboutOpen((e.target as HTMLDetailsElement).open)}
          className="group scroll-mt-4 border-t border-rule pt-6"
        >
          <summary className="flex cursor-pointer items-center gap-2 font-serif text-xl font-semibold">
            <ChevronIcon className="size-5 text-moss transition-transform group-open:rotate-90" />
            Lo que sabemos de tu terreno
          </summary>
          <div className="mt-5 space-y-8 pl-7 text-base">
            <AboutClimate point={point} data={data} loading={loadingPoint} />
            <AboutSeason grow={agro.grow} />
            <AboutRain rain={agro.rain} />
            <AboutCrops point={point} local={local} />
            <AboutHarvests actual={agro.actual} />
            <AboutFit suit={agro.suit} irrigated={irrigated} />
            <AboutSoil point={point} soil={soil} />
            <AboutGreen point={point} ndvi={ndvi} />
          </div>
        </details>
      )}
    </div>
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
    <p className={`text-base ${o.economics.loss ? "text-clay" : "text-ink"}`}>
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
                <span className="whitespace-nowrap text-ink-faint">(cálculo de Field Shift)</span>
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
              <span className="text-sm text-ink-faint">(consejo de Field Shift)</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Results({ r, name, point }: { r: Result; name: string; point: Point }) {
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

function AboutClimate({ point, data, loading }: { point: Point; data: Analysis | null; loading: boolean }) {
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

function AboutCrops({ point, local }: { point: Point; local: LocalCrops | null }) {
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

function AboutSoil({ point, soil }: { point: Point; soil: Soil | null }) {
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

function AboutGreen({ point, ndvi }: { point: Point; ndvi: Ndvi | null }) {
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

