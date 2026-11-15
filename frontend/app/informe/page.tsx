"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AboutFit, AboutHarvests, AboutRain, AboutSeason, useAgro } from "../agro";
import { DownloadIcon } from "../icons";
import { AboutImerg, AboutNldas, AboutSmap, AboutSrtm, useNasa } from "../nasa";
import { CREDIT, OrchidMark } from "../logo";
import type { Analysis } from "../panels";
import { API, CROPS, HA_PER_ACRE, HistoryRow, MONTH_NAMES } from "../shared";
import {
  AboutClimate,
  AboutCrops,
  AboutGreen,
  AboutSoil,
  REPORT_KEY,
  ReportResults,
  type LocalCrops,
  type Ndvi,
  type Point,
  type Result,
  type Soil,
} from "../terreno";

// Informe completo para guardar o imprimir: todo el detalle que el cuaderno resume.

type Snapshot = {
  createdAt: string;
  result: Result | null;
  plot: { name: string; acres: string; irrigated: boolean; history: HistoryRow[]; point: Point | null };
  econCount: number;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function InformePage() {
  const [snap, setSnap] = useState<Snapshot | null | undefined>(undefined);
  const [data, setData] = useState<Analysis | null>(null);
  const [local, setLocal] = useState<LocalCrops | null>(null);
  const [soil, setSoil] = useState<Soil | null>(null);
  const [ndvi, setNdvi] = useState<Ndvi | null>(null);
  const [loadingClimate, setLoadingClimate] = useState(true);
  const printed = useRef(false);
  const point = snap?.plot.point ?? null;
  const agro = useAgro(point);
  const nasa = useNasa(point);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSnap(JSON.parse(localStorage.getItem(REPORT_KEY) ?? "null"));
    } catch {
      setSnap(null);
    }
  }, []);

  useEffect(() => {
    if (!point) return;
    const post = (path: string) =>
      fetch(`${API}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(point) }).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
      );
    post("/point/analysis").then(setData).catch(() => null).finally(() => setLoadingClimate(false));
    post("/point/local-crops").then(setLocal).catch(() => setLocal({ available: false, years: {}, radius_km: 1.1, note: "No pudimos consultar los cultivos cercanos." }));
    post("/point/soil").then(setSoil).catch(() => setSoil({ available: false, components: [], sql: "", query_page: "", note: "No pudimos consultar el suelo ahora." }));
    post("/point/ndvi").then(setNdvi).catch(() => setNdvi({ available: false, series: [], threshold: 0.3, product: "", note: "No pudimos consultar la imagen de satélite ahora." }));
  }, [point]);

  const ready =
    !!snap && !loadingClimate && local !== null && soil !== null && ndvi !== null && !!nasa.smap && !!nasa.imerg && !!nasa.nldas && !!nasa.srtm;

  // Cuando todo cargó: abre los desplegables (para que se impriman) y ofrece guardar en PDF una sola vez.
  useEffect(() => {
    if (!ready || printed.current) return;
    printed.current = true;
    document.querySelectorAll("details").forEach((d) => (d.open = true));
    if (new URLSearchParams(window.location.search).has("vista")) return; // ?vista=1: solo mirar, sin imprimir
    const t = setTimeout(() => window.print(), 700);
    return () => clearTimeout(t);
  }, [ready]);

  function save() {
    document.querySelectorAll("details").forEach((d) => (d.open = true));
    window.print();
  }

  if (snap === undefined) return <p className="p-10 text-ink-soft">Preparando tu informe…</p>;
  if (!snap || !point) {
    return (
      <main className="mx-auto max-w-2xl px-8 py-16">
        <h1 className="font-serif text-3xl font-semibold">No hay un informe para mostrar</h1>
        <p className="mt-3 text-lg text-ink-soft">Marca tu terreno en el mapa y pulsa «Descargar informe completo».</p>
        <Link href="/mapa" className="mt-6 inline-block rounded-md bg-moss px-6 py-3 font-semibold text-paper hover:bg-moss-deep">
          Ir al mapa
        </Link>
      </main>
    );
  }

  const { plot, result } = snap;
  const acres = parseFloat(plot.acres);
  const created = new Date(snap.createdAt).toLocaleDateString("es-US", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="no-print sticky top-0 z-10 border-b border-rule bg-paper">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-8 py-3">
          <Link href="/mapa" className="text-base text-ink-soft hover:text-ink">
            ← Volver al mapa
          </Link>
          <div className="flex items-center gap-3">
            {!ready && <span className="text-sm text-ink-soft">Reuniendo los datos…</span>}
            <button onClick={save} className="inline-flex items-center gap-2 rounded-md bg-moss px-5 py-2.5 font-semibold text-paper hover:bg-moss-deep">
              <DownloadIcon /> Guardar como PDF
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-3xl space-y-12 px-8 pb-20 pt-10">
        <header className="report-section space-y-3 border-b border-rule pb-8">
          <OrchidMark size={44} title="Orchid" />
          <h1 className="font-serif text-4xl font-semibold leading-tight">
            Informe de {plot.name.trim() ? `«${plot.name.trim()}»` : "tu terreno"}
          </h1>
          <p className="text-base text-ink-soft">
            Orchid · {created} · {acres > 0 ? `${plot.acres} acres (${(acres * HA_PER_ACRE).toFixed(1)} ha)` : "tamaño sin anotar"} ·{" "}
            {plot.irrigated ? "con riego" : "solo lluvia"} · {point.lat.toFixed(4)}, {point.lon.toFixed(4)}
          </p>
          <p className="max-w-prose text-base text-ink-soft">
            Preparado por Orchid con datos públicos de la NASA, el USDA y la FAO. Es un apoyo para tu decisión: revísalo con tu asesor o la oficina de
            extensión de tu condado.
          </p>
        </header>

        <section className="report-section">
          <h2 className="font-serif text-2xl font-semibold">Lo que sembraste</h2>
          {plot.history.length ? (
            <table className="mt-4 w-full border-collapse text-left text-base">
              <thead>
                <tr className="border-b border-rule text-ink-soft">
                  <th className="py-2 font-normal">Cultivo</th>
                  <th className="py-2 font-normal">Siembra</th>
                  <th className="py-2 font-normal">Cosecha</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {plot.history.map((h, i) => (
                  <tr key={i} className="border-b border-rule">
                    <td className="py-2">{CROPS[h.crop] ?? h.crop}</td>
                    <td className="py-2">{cap(MONTH_NAMES[h.plant_month - 1])} {h.plant_year}</td>
                    <td className="py-2">{cap(MONTH_NAMES[h.harvest_month - 1])} {h.harvest_year}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-2 text-base text-ink-soft">No anotaste cultivos anteriores; las opciones son menos precisas sin historial.</p>
          )}
          <p className="mt-3 text-sm text-ink-soft">
            {snap.econCount > 0 ? `Se usaron tus precios y costos de ${snap.econCount} cultivo${snap.econCount === 1 ? "" : "s"}.` : "Sin precios propios: no se calculó la ganancia."}
          </p>
        </section>

        {result ? (
          <ReportResults r={result} name={plot.name.trim()} point={point} />
        ) : (
          <section className="report-section border-t border-rule pt-8">
            <h2 className="font-serif text-2xl font-semibold">Qué te conviene sembrar</h2>
            <p className="mt-2 text-base text-ink-soft">
              Todavía no calculaste las opciones con tus datos actuales. En el mapa, pulsa «Ver qué me conviene sembrar» y vuelve a descargar el informe.
            </p>
          </section>
        )}

        <section className="space-y-8 border-t border-rule pt-8">
          <h2 className="font-serif text-2xl font-semibold">Lo que sabemos de tu terreno</h2>
          <div className="space-y-8 text-base">
            <AboutClimate point={point} data={data} loading={loadingClimate} />
            <AboutSeason grow={agro.grow} />
            <AboutRain rain={agro.rain} />
            <AboutCrops point={point} local={local} />
            <AboutHarvests actual={agro.actual} />
            <AboutFit suit={agro.suit} irrigated={plot.irrigated} />
            <AboutSoil point={point} soil={soil} />
            <AboutSrtm point={point} srtm={nasa.srtm} />
            <AboutSmap point={point} smap={nasa.smap} />
            <AboutImerg point={point} imerg={nasa.imerg} />
            <AboutNldas point={point} nldas={nasa.nldas} />
            <AboutGreen point={point} ndvi={ndvi} />
          </div>
        </section>

        <footer className="report-section flex items-center gap-3 border-t border-rule pt-6 text-sm text-ink-soft">
          <OrchidMark size={28} />
          <span>
            <span className="font-semibold text-ink">Orchid</span> · {CREDIT}.
          </span>
        </footer>
      </main>
    </div>
  );
}
