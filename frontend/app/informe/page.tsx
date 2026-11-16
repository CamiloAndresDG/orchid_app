"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AboutFit, AboutHarvests, AboutRain, AboutSeason, useAgro } from "../agro";
import { DownloadIcon } from "../icons";
import { AboutImerg, AboutNldas, AboutSmap, AboutSrtm, useNasa } from "../nasa";
import { CREDIT, FULL_NAME, OrchidMark } from "../logo";
import type { Analysis } from "../panels";
import { API, CROP_NAMES, HA_PER_ACRE, HistoryRow, MONTHS } from "../shared";
import { currentLang, langHeaders, locale, useLang } from "../i18n";
import { LangToggle } from "../lang-toggle";
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
} from "../field";

// Full report to save or print: all the detail the notebook summarizes.

type Snapshot = {
  createdAt: string;
  lang?: "es" | "en";
  result: Result | null;
  plot: { name: string; acres: string; irrigated: boolean; history: HistoryRow[]; point: Point | null };
  econCount: number;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const T = {
  es: {
    cropsFail: "No pudimos consultar los cultivos cercanos.",
    soilFail: "No pudimos consultar el suelo ahora.",
    ndviFail: "No pudimos consultar la imagen de satélite ahora.",
    preparing: "Preparando tu informe…",
    none: "No hay un informe para mostrar",
    noneLead: "Marca tu terreno en el mapa y pulsa «Descargar informe completo».",
    goMap: "Ir al mapa",
    back: "← Volver al mapa",
    gathering: "Reuniendo los datos…",
    savePdf: "Guardar como PDF",
    reportOf: (n: string) => `Informe de ${n ? `«${n}»` : "tu terreno"}`,
    noSize: "tamaño sin anotar",
    irrigated: "con riego",
    rainOnly: "solo lluvia",
    prepared:
      "Preparado por ORCHID con datos públicos de la NASA, el USDA y la FAO. Es un apoyo para tu decisión: revísalo con tu asesor o la oficina de extensión de tu condado.",
    planted: "Lo que sembraste",
    crop: "Cultivo",
    sow: "Siembra",
    harvest: "Cosecha",
    noHistory: "No anotaste cultivos anteriores; las opciones son menos precisas sin historial.",
    usedPrices: (n: number) => `Se usaron tus precios y costos de ${n} ${n === 1 ? "cultivo" : "cultivos"}.`,
    noPrices: "Sin precios propios: no se calculó la ganancia.",
    whatTitle: "Qué te conviene sembrar",
    whatLead: "Todavía no calculaste las opciones con tus datos actuales. En el mapa, pulsa «Ver qué me conviene sembrar» y vuelve a descargar el informe.",
    know: "Lo que sabemos de tu terreno",
    otherLang: "Las recomendaciones de este informe se calcularon en español. Para verlas en inglés, vuelve a calcularlas en el mapa y descarga el informe otra vez.",
  },
  en: {
    cropsFail: "We couldn't look up nearby crops.",
    soilFail: "We couldn't look up the soil right now.",
    ndviFail: "We couldn't get the satellite image right now.",
    preparing: "Preparing your report…",
    none: "There's no report to show",
    noneLead: "Mark your field on the map and press “Download full report”.",
    goMap: "Go to the map",
    back: "← Back to the map",
    gathering: "Gathering the data…",
    savePdf: "Save as PDF",
    reportOf: (n: string) => `Report for ${n ? `“${n}”` : "your field"}`,
    noSize: "size not entered",
    irrigated: "irrigated",
    rainOnly: "rain only",
    prepared:
      "Prepared by ORCHID with public data from NASA, USDA and FAO. It's support for your decision: review it with your advisor or your county extension office.",
    planted: "What you planted",
    crop: "Crop",
    sow: "Planting",
    harvest: "Harvest",
    noHistory: "You didn't record past crops; the options are less precise without history.",
    usedPrices: (n: number) => `Your prices and costs for ${n} ${n === 1 ? "crop were" : "crops were"} used.`,
    noPrices: "No prices of your own: profit wasn't calculated.",
    whatTitle: "What you should plant",
    whatLead: "You haven't calculated the options with your current details yet. On the map, press “See what I should plant” and download the report again.",
    know: "What we know about your field",
    otherLang: "The recommendations in this report were calculated in English. To see them in Spanish, recalculate them on the map and download the report again.",
  },
};

export default function ReportPage() {
  const lang = useLang();
  const t = T[lang];
  const CROPS = CROP_NAMES[lang];
  const MONTH_NAMES = MONTHS[lang];
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
      fetch(`${API}${path}`, { method: "POST", headers: langHeaders({ "content-type": "application/json" }), body: JSON.stringify(point) }).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
      );
    const f = T[currentLang()];
    post("/point/analysis").then(setData).catch(() => null).finally(() => setLoadingClimate(false));
    post("/point/local-crops").then(setLocal).catch(() => setLocal({ available: false, years: {}, radius_km: 1.1, note: f.cropsFail }));
    post("/point/soil").then(setSoil).catch(() => setSoil({ available: false, components: [], sql: "", query_page: "", note: f.soilFail }));
    post("/point/ndvi").then(setNdvi).catch(() => setNdvi({ available: false, series: [], threshold: 0.3, product: "", note: f.ndviFail }));
  }, [point, lang]);

  const ready =
    !!snap && !loadingClimate && local !== null && soil !== null && ndvi !== null && !!nasa.smap && !!nasa.imerg && !!nasa.nldas && !!nasa.srtm;

  // Once everything has loaded: opens the collapsibles (so they print) and offers to save as PDF once.
  useEffect(() => {
    if (!ready || printed.current) return;
    printed.current = true;
    document.querySelectorAll("details").forEach((d) => (d.open = true));
    if (new URLSearchParams(window.location.search).has("vista")) return; // ?vista=1: view only, no printing
    const t = setTimeout(() => window.print(), 700);
    return () => clearTimeout(t);
  }, [ready]);

  function save() {
    document.querySelectorAll("details").forEach((d) => (d.open = true));
    window.print();
  }

  if (snap === undefined) return <p className="p-10 text-ink-soft">{t.preparing}</p>;
  if (!snap || !point) {
    return (
      <main className="mx-auto max-w-2xl px-8 py-16">
        <h1 className="font-serif text-3xl font-semibold">{t.none}</h1>
        <p className="mt-3 text-lg text-ink-soft">{t.noneLead}</p>
        <Link href="/mapa" className="mt-6 inline-block rounded-md bg-moss px-6 py-3 font-semibold text-paper hover:bg-moss-deep">
          {t.goMap}
        </Link>
      </main>
    );
  }

  const { plot, result } = snap;
  const acres = parseFloat(plot.acres);
  const created = new Date(snap.createdAt).toLocaleDateString(locale(lang), { day: "numeric", month: "long", year: "numeric" });
  const otherLang = !!result && (snap.lang ?? "es") !== lang;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="no-print sticky top-0 z-10 border-b border-rule bg-paper">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-8 py-3">
          <Link href="/mapa" className="text-base text-ink-soft hover:text-ink">
            {t.back}
          </Link>
          <div className="flex items-center gap-3">
            {!ready && <span className="text-sm text-ink-soft">{t.gathering}</span>}
            <LangToggle />
            <button onClick={save} className="inline-flex items-center gap-2 rounded-md bg-moss px-5 py-2.5 font-semibold text-paper hover:bg-moss-deep">
              <DownloadIcon /> {t.savePdf}
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-3xl space-y-12 px-8 pb-20 pt-10">
        <header className="report-section space-y-3 border-b border-rule pb-8">
          <OrchidMark size={44} title="ORCHID" />
          <h1 className="font-serif text-4xl font-semibold leading-tight">
            {t.reportOf(plot.name.trim())}
          </h1>
          <p className="text-base text-ink-soft">
            ORCHID · {created} · {acres > 0 ? `${plot.acres} acres (${(acres * HA_PER_ACRE).toFixed(1)} ha)` : t.noSize} ·{" "}
            {plot.irrigated ? t.irrigated : t.rainOnly} · {point.lat.toFixed(4)}, {point.lon.toFixed(4)}
          </p>
          <p className="max-w-prose text-base text-ink-soft">{t.prepared}</p>
          {otherLang && <p className="no-print max-w-prose rounded-md bg-paper-deep px-4 py-2 text-sm text-ink-soft">{t.otherLang}</p>}
        </header>

        <section className="report-section">
          <h2 className="font-serif text-2xl font-semibold">{t.planted}</h2>
          {plot.history.length ? (
            <table className="mt-4 w-full border-collapse text-left text-base">
              <thead>
                <tr className="border-b border-rule text-ink-soft">
                  <th className="py-2 font-normal">{t.crop}</th>
                  <th className="py-2 font-normal">{t.sow}</th>
                  <th className="py-2 font-normal">{t.harvest}</th>
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
            <p className="mt-2 text-base text-ink-soft">{t.noHistory}</p>
          )}
          <p className="mt-3 text-sm text-ink-soft">
            {snap.econCount > 0 ? t.usedPrices(snap.econCount) : t.noPrices}
          </p>
        </section>

        {result ? (
          <ReportResults r={result} name={plot.name.trim()} point={point} />
        ) : (
          <section className="report-section border-t border-rule pt-8">
            <h2 className="font-serif text-2xl font-semibold">{t.whatTitle}</h2>
            <p className="mt-2 text-base text-ink-soft">{t.whatLead}</p>
          </section>
        )}

        <section className="space-y-8 border-t border-rule pt-8">
          <h2 className="font-serif text-2xl font-semibold">{t.know}</h2>
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
            <span className="font-semibold text-ink">ORCHID</span> ({FULL_NAME}) · {CREDIT[lang]}.
          </span>
        </footer>
      </main>
    </div>
  );
}
