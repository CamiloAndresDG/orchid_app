"use client";

import { useEffect, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CheckIcon, ChevronIcon, DownloadIcon, ExternalIcon, PlusIcon, ShieldIcon, Spinner, TrashIcon } from "./icons";
import { Analysis, TabId } from "./panels";
import { CROP_NAMES, ECON_CROPS, LAND_NAMES, EconUS, HA_PER_ACRE, HistoryRow, MONTHS, hasEcon, toMetric } from "./shared";
import { Lang, currentLang, fmtNum, langHeaders, useLang } from "./i18n";
import { PLOT_KEY as STORAGE_KEY } from "./auth";
import { factMoisture, factRain, factSlope, useNasa } from "./nasa";
import { notebookChanged } from "./notebook";
import { SOURCE_LABELS, SourceKey, cdlUrl, ndviUrl, powerUrl, sourceUrl, ssurgoMapUrl } from "./sources";

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
  method?: string[];
};
export type SoilComp = {
  map_unit: string; name: string; pct: number | null; drainage: string | null; hydgrp: string | null; slope: number | null;
  topsoil_depth_cm: number | null; sand: number | null; silt: number | null; clay: number | null;
  om: number | null; ph: number | null; ksat: number | null; awc: number | null;
};
export type Ndvi = { available: boolean; series: { date: string; ndvi: number }[]; threshold: number; low_months?: number[]; product: string; note: string };
export type Soil = { available: boolean; components: SoilComp[]; sql: string; query_page: string; note: string };
export type LocalCrops = { available: boolean; years: Record<string, Record<string, number>>; note: string; radius_km: number; unverified?: string[] };

const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 7 }, (_, i) => THIS_YEAR - i);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const monthList = (ms: number[], l: Lang) => {
  const n = [...ms].sort((a, b) => a - b).map((m) => MONTHS[l][m - 1]);
  return n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")} ${l === "en" ? "and" : "y"} ${n[n.length - 1]}`;
};

export const DRAINAGE: Record<Lang, Record<string, string>> = {
  es: {
    "Excessively drained": "drena en exceso (se seca rápido)",
    "Somewhat excessively drained": "drena algo en exceso",
    "Well drained": "bien drenado",
    "Moderately well drained": "drena bastante bien",
    "Somewhat poorly drained": "drena algo mal",
    "Poorly drained": "drena mal (se encharca)",
    "Very poorly drained": "drena muy mal (se encharca)",
  },
  en: {
    "Excessively drained": "excessively drained (dries out fast)",
    "Somewhat excessively drained": "somewhat excessively drained",
    "Well drained": "well drained",
    "Moderately well drained": "moderately well drained",
    "Somewhat poorly drained": "somewhat poorly drained",
    "Poorly drained": "poorly drained (waterlogs)",
    "Very poorly drained": "very poorly drained (waterlogs)",
  },
};
export function textureWord(c: SoilComp, l: Lang = "es") {
  const w = l === "en" ? ["sandy", "clayey", "silty", "loam"] : ["arenoso", "arcilloso", "limoso", "franco"];
  if (c.sand !== null && c.sand >= 70) return w[0];
  if (c.clay !== null && c.clay >= 40) return w[1];
  if (c.silt !== null && c.silt >= 50) return w[2];
  return w[3];
}

const T = {
  es: {
    soilFail: "No pudimos consultar el suelo ahora.",
    ndviFail: "No pudimos consultar la imagen de satélite ahora.",
    calcFail: "No pudimos calcular las opciones. Revisa tu conexión y pulsa el botón otra vez; tus datos siguen aquí.",
    markField: "Marca tu terreno en el mapa.",
    writeAcres: "Escribe el tamaño de tu terreno en acres.",
    checkDates: "Revisa las fechas: alguna cosecha es antes de la siembra.",
    acres: (a: string) => `${a} acres`,
    irrigated: "con riego",
    rainOnly: "solo lluvia",
    crops: (n: number) => `${n} ${n === 1 ? "cultivo anotado" : "cultivos anotados"}`,
    noHistory: "sin historial",
    markTitle: "Marca tu campo en el mapa",
    markLead: "Busca tu pueblo o código postal en el mapa, acércate y haz clic sobre tu campo. Te diremos qué te conviene sembrar después.",
    firstSee: "¿Primero quieres ver cómo funciona?",
    seeExample: "Mira un ejemplo real",
    yourField: "Tu terreno",
    edit: "Editar datos",
    soil: "Suelo",
    noDrainage: "sin dato de drenaje",
    checking: "Consultando…",
    noData: "Sin dato en este punto",
    hardMonths: "Meses difíciles",
    checkingClimate: "Consultando el clima…",
    noDataYet: "Sin dato todavía",
    slope: "Pendiente",
    moisture: "Humedad",
    recentRain: "Lluvia reciente",
    size: "Tamaño en acres",
    sizePh: "Ej.: 60",
    name: "Nombre",
    optional: "(opcional)",
    namePh: "Ej.: Lote norte",
    badAcres: "Escribe un número de acres mayor que cero.",
    irrigate: "¿Riegas este terreno?",
    yesIrr: "Sí, tengo riego",
    noIrr: "No, solo lluvia",
    planted: "Qué sembraste",
    plantedLead: "Con uno o dos años basta.",
    crop: "Cultivo",
    remove: (c: string) => `Quitar ${c}`,
    cropWord: "cultivo",
    sowed: "Sembré",
    harvested: "Coseché",
    month: (l: string) => `Mes: ${l}`,
    year: (l: string) => `Año: ${l}`,
    badRow: "En algún cultivo la cosecha quedó antes de la siembra. Revisa esas fechas.",
    addCrop: "Agregar un cultivo",
    havePrices: (n: number) => `Tienes precios para ${n} ${n === 1 ? "cultivo" : "cultivos"}.`,
    pricesHint: "Con tus precios te avisamos si algo te daría pérdida.",
    changePrices: "Cambiar mis precios",
    setPrices: "Poner mis precios",
    done: "Listo",
    searching: "Buscando opciones…",
    recalc: "Volver a calcular",
    whatToPlant: "Ver qué me conviene sembrar",
    changed: "Cambiaste tus datos.",
    wantAll: "¿Quieres todo lo que sabemos de tu terreno?",
    download: "Descargar el informe del terreno",
    inMonth: (c: string, m: string) => `${c} en ${m}`,
    keepSame: (c: string) => `Seguir igual: ${c} otra vez`,
    suits: "Te conviene",
    afterHarvest: (c: string) => `Y después de cosechar, ${c} para cubrir el suelo en invierno.`,
    careful: "Ten cuidado:",
    downloadFull: "Descargar informe completo",
    downloadNote: "Con la evidencia de cada dato, los riesgos, lo que aún no sabemos y las demás opciones.",
    otherOptions: "Otras opciones",
    steps: ["Clima de tu zona", "Cultivos de la zona", "Suelo de tu terreno", "Imagen de satélite", "Comparando rotaciones para tu terreno"],
    ndviSlow: "La imagen de satélite tarda 1 o 2 minutos la primera vez. Después es inmediata.",
    estCost: "Costo estimado",
    estLoss: "Pérdida estimada",
    estGain: "Ganancia estimada",
    money: (a: string, b: string) => `${a} $ por acre · ${b} $ en total, con tus números.`,
    whereFrom: "¿De dónde sale esto?",
    official: "Ver dato oficial",
    calc: "(cálculo de ORCHID)",
    unknown: "Lo que aún no sabemos",
    whyYes: "Por qué sí",
    watch: "Ten cuidado con",
    coverLine: (c: string) => `${c} después de la cosecha`,
    cashCrop: "Cultivo de venta:",
    optCover: "Cobertura opcional:",
    coverWinter: ", para cubrir el suelo en invierno.",
    aboutCover: (c: string) => `Sobre la cobertura: ${c}`,
    nutshell: "Tu terreno, en pocas palabras",
    tip: "(consejo de ORCHID)",
    suggest: (n: string) => `Lo que te sugerimos${n ? ` para ${n}` : ""}`,
    lastCrop: (c: string) => `Tu último cultivo fue ${c}. `,
    hardHere: (m: string) => `Los meses más difíciles del clima aquí son ${m}.`,
    andAfter: (c: string) => `, y ${c} después de cosechar`,
    otherRot: "Otras rotaciones",
    howChose: "Cómo elegimos las opciones",
    howLead:
      "Los datos son reales; la forma de puntuarlos es una regla que escribimos nosotros y que todavía no revisó un agrónomo de tu zona. Estos son los números exactos que usamos:",
    climate: "Clima",
    climateTxt1: "Los meses con más calor, menos lluvia y suelo más seco son ",
    climateTxt2: ". Promedio de 2015 a 2024. En «Más datos → Clima» puedes ver día por día.",
    seePower: "Ver en NASA POWER",
    around: "Qué se siembra a tu alrededor",
    aroundLead: "En unas 0.7 millas a tu alrededor, promedio de 2021 a 2025.",
    unverified: "* Lo reconocemos por el color de la leyenda del mapa, todavía sin verificar con un punto real: tómalo con cuidado.",
    seeCdl: "Ver mapa oficial de cultivos (USDA)",
    noDataW: "sin dato",
    type: "Tipo",
    soilType: (w: string) => `Suelo ${w}`,
    usdaName: (n: string) => `(en el mapa de suelos del USDA se llama «${n}»)`,
    texture: (s: string, si: string, c: string) =>
      `${s}% arena, ${si}% limo, ${c}% arcilla. Más arena se seca rápido; más arcilla guarda agua pero la absorbe lento.`,
    drainage: "Drenaje",
    awc: "Agua que guarda",
    awcW: ["Poca", "Buena", "Media"],
    awcNote: "Cuánta agua queda disponible para las raíces después de llover.",
    om: "Materia orgánica",
    ph: "Acidez (pH)",
    neutral: "(7 es neutro)",
    slopeNote: "(más pendiente, más riesgo de erosión)",
    seeSsurgo: "Ver mapa oficial de suelos (USDA)",
    techQuery: "Consulta técnica",
    pasteIn: "Pégala en ",
    sameNums: " para obtener los mismos números.",
    greenTitle: "Qué tan verde se ve tu campo desde el satélite",
    greenSlow: "Consultando… la primera vez tarda 1 o 2 minutos.",
    greenLead: "Más alto es más vegetación verde; cerca de 0 es tierra sin cubrir.",
    lowIn1: "El último año tu campo estuvo con poca vegetación en ",
    notBare: "El último año tu campo no quedó sin cubrir.",
    greenness: "Verdor",
    greenNote: (th: number) =>
      `Índice de verdor (NDVI) del satélite MODIS, cada 16 días. La línea punteada (${th}) es el límite que usamos para decir «poca vegetación»; lo elegimos nosotros, no la NASA.`,
    seeNdvi: "Ver datos oficiales del satélite (NASA)",
  },
  en: {
    soilFail: "We couldn't look up the soil right now.",
    ndviFail: "We couldn't get the satellite image right now.",
    calcFail: "We couldn't calculate the options. Check your connection and press the button again; your data is still here.",
    markField: "Mark your field on the map.",
    writeAcres: "Enter your field's size in acres.",
    checkDates: "Check the dates: one harvest is before planting.",
    acres: (a: string) => `${a} acres`,
    irrigated: "irrigated",
    rainOnly: "rain only",
    crops: (n: number) => `${n} ${n === 1 ? "crop recorded" : "crops recorded"}`,
    noHistory: "no history",
    markTitle: "Mark your field on the map",
    markLead: "Search for your town or ZIP code on the map, zoom in and click on your field. We'll tell you what makes sense to plant next.",
    firstSee: "Want to see how it works first?",
    seeExample: "See a real example",
    yourField: "Your field",
    edit: "Edit details",
    soil: "Soil",
    noDrainage: "no drainage data",
    checking: "Checking…",
    noData: "No data at this point",
    hardMonths: "Hard months",
    checkingClimate: "Getting the climate…",
    noDataYet: "No data yet",
    slope: "Slope",
    moisture: "Moisture",
    recentRain: "Recent rain",
    size: "Size in acres",
    sizePh: "E.g. 60",
    name: "Name",
    optional: "(optional)",
    namePh: "E.g. North field",
    badAcres: "Enter a number of acres greater than zero.",
    irrigate: "Do you irrigate this field?",
    yesIrr: "Yes, I irrigate",
    noIrr: "No, rain only",
    planted: "What you planted",
    plantedLead: "One or two years is enough.",
    crop: "Crop",
    remove: (c: string) => `Remove ${c}`,
    cropWord: "crop",
    sowed: "Planted",
    harvested: "Harvested",
    month: (l: string) => `Month: ${l}`,
    year: (l: string) => `Year: ${l}`,
    badRow: "In one crop the harvest is before planting. Check those dates.",
    addCrop: "Add a crop",
    havePrices: (n: number) => `You have prices for ${n} ${n === 1 ? "crop" : "crops"}.`,
    pricesHint: "With your prices we'll warn you if something would lose money.",
    changePrices: "Change my prices",
    setPrices: "Add my prices",
    done: "Done",
    searching: "Finding options…",
    recalc: "Recalculate",
    whatToPlant: "See what I should plant",
    changed: "You changed your details.",
    wantAll: "Want everything we know about your field?",
    download: "Download the field report",
    inMonth: (c: string, m: string) => `${c} in ${m}`,
    keepSame: (c: string) => `Keep the same: ${c} again`,
    suits: "Your best bet:",
    afterHarvest: (c: string) => `And after harvest, ${c} to cover the soil over winter.`,
    careful: "Watch out:",
    downloadFull: "Download full report",
    downloadNote: "With the evidence for each figure, the risks, what we don't know yet and the other options.",
    otherOptions: "Other options",
    steps: ["Your area's climate", "Crops in the area", "Your field's soil", "Satellite image", "Comparing rotations for your field"],
    ndviSlow: "The satellite image takes 1 or 2 minutes the first time. After that it's instant.",
    estCost: "Estimated cost",
    estLoss: "Estimated loss",
    estGain: "Estimated profit",
    money: (a: string, b: string) => `$${a} per acre · $${b} total, with your numbers.`,
    whereFrom: "Where does this come from?",
    official: "See official data",
    calc: "(ORCHID's calculation)",
    unknown: "What we don't know yet",
    whyYes: "Why it works",
    watch: "Watch out for",
    coverLine: (c: string) => `${c} after harvest`,
    cashCrop: "Cash crop:",
    optCover: "Optional cover crop:",
    coverWinter: ", to cover the soil over winter.",
    aboutCover: (c: string) => `About the cover crop: ${c}`,
    nutshell: "Your field, in a nutshell",
    tip: "(ORCHID's tip)",
    suggest: (n: string) => `What we suggest${n ? ` for ${n}` : ""}`,
    lastCrop: (c: string) => `Your last crop was ${c}. `,
    hardHere: (m: string) => `The hardest months for the weather here are ${m}.`,
    andAfter: (c: string) => `, then ${c} after harvest`,
    otherRot: "Other rotations",
    howChose: "How we chose the options",
    howLead:
      "The data is real; the way we score it is a rule we wrote ourselves, and a local agronomist hasn't reviewed it yet. These are the exact numbers we use:",
    climate: "Climate",
    climateTxt1: "The months with the most heat, least rain and driest soil are ",
    climateTxt2: ". Average from 2015 to 2024. In “More data → Climate” you can see it day by day.",
    seePower: "See on NASA POWER",
    around: "What's planted around you",
    aroundLead: "Within about 0.7 miles of you, average from 2021 to 2025.",
    unverified: "* We identify it by the map legend color, not yet checked against a real point: take it with care.",
    seeCdl: "See the official crop map (USDA)",
    noDataW: "no data",
    type: "Type",
    soilType: (w: string) => `${w.charAt(0).toUpperCase() + w.slice(1)} soil`,
    usdaName: (n: string) => `(on the USDA soil map it's called “${n}”)`,
    texture: (s: string, si: string, c: string) =>
      `${s}% sand, ${si}% silt, ${c}% clay. More sand dries out fast; more clay holds water but absorbs it slowly.`,
    drainage: "Drainage",
    awc: "Water it holds",
    awcW: ["Low", "Good", "Medium"],
    awcNote: "How much water stays available to the roots after rain.",
    om: "Organic matter",
    ph: "Acidity (pH)",
    neutral: "(7 is neutral)",
    slopeNote: "(more slope, more erosion risk)",
    seeSsurgo: "See the official soil map (USDA)",
    techQuery: "Technical query",
    pasteIn: "Paste it into ",
    sameNums: " to get the same numbers.",
    greenTitle: "How green your field looks from the satellite",
    greenSlow: "Checking… the first time it takes 1 or 2 minutes.",
    greenLead: "Higher means more green vegetation; near 0 is bare ground.",
    lowIn1: "Over the last year your field had little vegetation in ",
    notBare: "Over the last year your field was never left bare.",
    greenness: "Greenness",
    greenNote: (th: number) =>
      `Greenness index (NDVI) from the MODIS satellite, every 16 days. The dashed line (${th}) is the cutoff we use to say “little vegetation”; we chose it, not NASA.`,
    seeNdvi: "See official satellite data (NASA)",
  },
};

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
  const lang = useLang();
  const t = T[lang];
  const CROPS = CROP_NAMES[lang];
  const MONTH_NAMES = MONTHS[lang];

  useEffect(() => {
    if (!point) return;
    const ctl = new AbortController();
    const post = (path: string) =>
      fetch(`${API}${path}`, { method: "POST", headers: langHeaders({ "content-type": "application/json" }), body: JSON.stringify(point), signal: ctl.signal }).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
      );
    /* eslint-disable react-hooks/set-state-in-effect */
    setSoil(null);
    setNdvi(null);
    setResult(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    post("/point/soil")
      .then(setSoil)
      .catch((e) => e.name !== "AbortError" && setSoil({ available: false, components: [], sql: "", query_page: "", note: T[currentLang()].soilFail }));
    post("/point/ndvi")
      .then(setNdvi)
      .catch((e) => e.name !== "AbortError" && setNdvi({ available: false, series: [], threshold: 0.3, product: "", note: T[currentLang()].ndviFail }));
    return () => ctl.abort();
  }, [point, lang]);

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
  const inputsKey = JSON.stringify([acres, irrigated, history, econ, lang]);
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
        headers: langHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ ...point, area_ha: acresNum * HA_PER_ACRE, irrigated, history, prices }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setResult(await r.json());
      setCalcKey(inputsKey);
      setEditing(false);
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch {
      setErr(t.calcFail);
    } finally {
      setBusy(false);
    }
  }

  // Al cambiar de idioma, si ya había opciones calculadas con los mismos datos, se piden otra vez en el idioma nuevo.
  const langRef = useRef(lang);
  useEffect(() => {
    if (langRef.current === lang) return;
    const prevKey = JSON.stringify([acres, irrigated, history, econ, langRef.current]);
    langRef.current = lang;
    if (result && calcKey === prevKey && !busy) go();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // El informe completo se arma en /informe con lo que el agricultor ve aquí; se pasa por localStorage.
  function openReport() {
    try {
      localStorage.setItem(
        REPORT_KEY,
        JSON.stringify({ createdAt: new Date().toISOString(), lang, result: stale ? null : result, plot: { name, acres, irrigated, history, point }, econCount }),
      );
    } catch {}
    window.open("/informe", "_blank");
  }

  const soilMain = soil?.available ? soil.components[0] : null;
  const missing = !point ? t.markField : !areaOk ? t.writeAcres : badDates ? t.checkDates : null;
  const facts = [areaOk ? t.acres(acres) : null, irrigated ? t.irrigated : t.rainOnly, history.length ? t.crops(history.length) : t.noHistory]
    .filter(Boolean)
    .join(" · ");

  if (!point) {
    return (
      <div className="space-y-6">
        <h2 className="font-serif text-3xl font-semibold leading-tight">{t.markTitle}</h2>
        <p className="max-w-prose text-lg text-ink-soft">{t.markLead}</p>
        <p className="text-base text-ink-soft">
          {t.firstSee}{" "}
          <button onClick={() => goTab("estrategias")} className="font-semibold text-moss hover:underline">
            {t.seeExample}
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
            {name.trim() || t.yourField}
          </h2>
          {!showForm && (
            <button onClick={() => setEditing(true)} className="shrink-0 text-base font-semibold text-moss hover:underline">
              {t.edit}
            </button>
          )}
        </div>
        {!showForm && <p className="mt-1 text-base text-ink-soft">{facts}</p>}

        <dl className="mt-5 space-y-2 text-base">
          <div className="flex gap-3">
            <dt className="w-32 shrink-0 text-ink-soft">{t.soil}</dt>
            <dd className="text-ink">
              {soilMain
                ? `${cap(textureWord(soilMain, lang))}, ${DRAINAGE[lang][soilMain.drainage ?? ""] ?? t.noDrainage}`
                : soil === null
                  ? t.checking
                  : t.noData}
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-32 shrink-0 text-ink-soft">{t.hardMonths}</dt>
            <dd className="text-ink">
              {data?.zone.id === "custom" ? cap(monthList(data.most_vulnerable_months, lang)) : loadingPoint ? t.checkingClimate : t.noDataYet}
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-32 shrink-0 text-ink-soft">{t.slope}</dt>
            <dd className="text-ink">{factSlope(nasa.srtm, lang)}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-32 shrink-0 text-ink-soft">{t.moisture}</dt>
            <dd className="text-ink">{factMoisture(nasa.smap, lang)}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-32 shrink-0 text-ink-soft">{t.recentRain}</dt>
            <dd className="text-ink">{factRain(nasa.imerg, lang)}</dd>
          </div>
        </dl>

        {showForm && (
          <div className="mt-6 space-y-6 border-t border-rule pt-6">
            <div className="grid grid-cols-2 gap-4">
              <label className="block text-base text-ink">
                {t.size}
                <input className={`${field} mt-1`} type="number" inputMode="decimal" min="0" step="any" value={acres} onChange={(e) => setAcres(e.target.value)} placeholder={t.sizePh} />
              </label>
              <label className="block text-base text-ink">
                {t.name} <span className="text-ink-soft">{t.optional}</span>
                <input className={`${field} mt-1`} value={name} onChange={(e) => setName(e.target.value)} placeholder={t.namePh} />
              </label>
            </div>
            {acres !== "" && !areaOk && <p className="text-base text-clay">{t.badAcres}</p>}

            <fieldset>
              <legend className="text-base text-ink">{t.irrigate}</legend>
              <div className="mt-2 flex gap-2">
                {[false, true].map((v) => (
                  <button
                    key={String(v)}
                    onClick={() => setIrrigated(v)}
                    aria-pressed={irrigated === v}
                    className={`rounded-md border px-5 py-2.5 text-base ${irrigated === v ? "border-moss bg-moss text-paper" : "border-field text-ink hover:border-moss"}`}
                  >
                    {v ? t.yesIrr : t.noIrr}
                  </button>
                ))}
              </div>
            </fieldset>

            <div>
              <h3 className="font-serif text-lg font-semibold">{t.planted}</h3>
              <p className="text-base text-ink-soft">{t.plantedLead}</p>
              <div className="mt-3 space-y-3">
                {history.map((h, i) => (
                  <div key={i} className="rounded-lg border border-rule p-4">
                    <div className="flex items-end gap-3">
                      <label className="flex-1 text-base text-ink">
                        {t.crop}
                        <select className={`${field} mt-1`} value={h.crop} onChange={(e) => setRow(i, { crop: e.target.value })}>
                          {Object.entries(CROPS).map(([k, n]) => (
                            <option key={k} value={k}>{n}</option>
                          ))}
                        </select>
                      </label>
                      <button
                        onClick={() => setHistory(history.filter((_, j) => j !== i))}
                        aria-label={t.remove(CROPS[h.crop] ?? t.cropWord)}
                        className="grid size-11 place-items-center rounded-md border border-field text-ink-soft hover:border-clay hover:text-clay"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-4">
                      {(
                        [
                          [t.sowed, "plant_month", "plant_year"],
                          [t.harvested, "harvest_month", "harvest_year"],
                        ] as const
                      ).map(([label, mk, yk]) => (
                        <fieldset key={label}>
                          <legend className="text-base text-ink">{label}</legend>
                          <div className="mt-1 grid grid-cols-[1fr_5.5rem] gap-2">
                            <select aria-label={t.month(label.toLowerCase())} className={field} value={h[mk]} onChange={(e) => setRow(i, { [mk]: +e.target.value })}>
                              {MONTH_NAMES.map((m, j) => (
                                <option key={m} value={j + 1}>{cap(m)}</option>
                              ))}
                            </select>
                            <select aria-label={t.year(label.toLowerCase())} className={field} value={h[yk]} onChange={(e) => setRow(i, { [yk]: +e.target.value })}>
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
                {badDates && <p className="text-base text-clay">{t.badRow}</p>}
                <button onClick={addRow} className="inline-flex items-center gap-2 rounded-md border border-moss px-4 py-2.5 text-base text-moss hover:bg-moss hover:text-paper">
                  <PlusIcon className="size-5" /> {t.addCrop}
                </button>
              </div>
            </div>

            <p className="text-base text-ink-soft">
              {econCount > 0 ? t.havePrices(econCount) : t.pricesHint}{" "}
              <button onClick={() => goTab("precios")} className="font-semibold text-moss hover:underline">
                {econCount > 0 ? t.changePrices : t.setPrices}
              </button>
            </p>

            {editing && areaOk && !badDates && (
              <button onClick={() => setEditing(false)} className="rounded-md border border-moss px-5 py-2.5 text-base text-moss hover:bg-moss hover:text-paper">
                {t.done}
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
              {busy ? t.searching : result ? t.recalc : t.whatToPlant}
            </button>
            {!busy && (missing ? <span className="text-base text-ink-soft">{missing}</span> : stale && <span className="text-base text-ink-soft">{t.changed}</span>)}
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
          {t.wantAll}{" "}
          <button onClick={openReport} className="font-semibold text-moss hover:underline">
            {t.download}
          </button>
        </p>
      )}
    </div>
  );
}

const TONE: Record<string, string> = {
  "Mejor opción": "text-moss",
  "Casi tan buena": "text-ink",
  "Más arriesgada": "text-clay",
  "Best option": "text-moss",
  "Almost as good": "text-ink",
  Riskier: "text-clay",
};

/** La recomendación en limpio: qué sembrar, por qué, de qué cuidarse y el informe para ver el detalle. */
function Summary({ r, onReport }: { r: Result; onReport: () => void }) {
  const lang = useLang();
  const t = T[lang];
  const MONTH_NAMES = MONTHS[lang];
  const [best, ...rest] = r.rotations;
  if (!best) return null;
  const sell = best.sell;
  const others = [
    ...rest.map((rot) => ({
      key: rot.sell.crop,
      name: `${t.inMonth(rot.sell.name, MONTH_NAMES[rot.sell.plant_month - 1])}${rot.cover ? ` + ${rot.cover.name.toLowerCase()}` : ""}`,
      label: rot.label,
    })),
    ...(r.baseline ? [{ key: "baseline", name: t.keepSame(r.baseline.name.toLowerCase()), label: r.baseline.label }] : []),
  ];
  return (
    <section aria-labelledby="best-title" className="space-y-8">
      <article className="rounded-xl bg-moss-wash p-6">
        <h2 id="best-title" className="font-serif text-3xl font-semibold leading-tight">
          {t.suits} <span className="text-moss">{t.inMonth(sell.name.toLowerCase(), MONTH_NAMES[sell.plant_month - 1])}</span>
        </h2>
        {best.cover && (
          <p className="mt-2 text-lg text-ink">{t.afterHarvest(best.cover.name.toLowerCase())}</p>
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
            <span className="font-semibold text-clay">{t.careful}</span> {sell.risks[0]}
          </p>
        )}
      </article>

      <div className="space-y-2">
        <button onClick={onReport} className="inline-flex items-center gap-2 rounded-md bg-moss px-6 py-3 text-base font-semibold text-paper hover:bg-moss-deep">
          <DownloadIcon /> {t.downloadFull}
        </button>
        <p className="text-sm text-ink-soft">{t.downloadNote}</p>
      </div>

      {others.length > 0 && (
        <div>
          <h3 className="font-serif text-xl font-semibold">{t.otherOptions}</h3>
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
  const t = T[useLang()];
  const steps: [string, boolean][] = [
    [t.steps[0], data],
    [t.steps[1], local],
    [t.steps[2], soil],
    [t.steps[3], ndvi],
    [t.steps[4], comparing],
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
      {!ndvi && <p className="text-sm text-ink-soft">{t.ndviSlow}</p>}
    </div>
  );
}

/* ------------------------------ Resultados ------------------------------ */

function Money({ o }: { o: Option }) {
  const lang = useLang();
  const t = T[lang];
  if (!o.economics) return null;
  const perAcre = Math.round(o.economics.margin_per_ha * HA_PER_ACRE);
  const total = Math.round(o.economics.margin_total);
  const fmt = (n: number) => fmtNum(lang, n);
  return (
    <p className={`mt-3 text-base ${o.economics.loss ? "text-clay" : "text-ink"}`}>
      <strong>{o.economics.investment ? t.estCost : o.economics.loss ? t.estLoss : t.estGain}:</strong> {t.money(fmt(perAcre), fmt(total))}
    </p>
  );
}

function Evidence({ o, point }: { o: Option; point: Point }) {
  const lang = useLang();
  const t = T[lang];
  return (
    <details className="group mt-3">
      <summary className="inline-flex cursor-pointer items-center gap-1.5 text-base text-moss hover:underline">
        <ShieldIcon className="size-5" /> {t.whereFrom}
      </summary>
      <div className="mt-3 space-y-3 text-sm">
        <ul className="space-y-2">
          {o.evidence.map((e) => (
            <li key={e.text} className="text-ink-soft">
              {e.text}.{" "}
              {e.kind === "real" && e.source ? (
                <a href={sourceUrl(e.source, point.lat, point.lon)} target="_blank" rel="noopener noreferrer" title={SOURCE_LABELS[lang][e.source]} className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-moss underline">
                  {t.official} <ExternalIcon />
                </a>
              ) : (
                <span className="whitespace-nowrap text-ink-faint">{t.calc}</span>
              )}
            </li>
          ))}
        </ul>
        {o.gaps.length > 0 && (
          <div>
            <p className="font-semibold text-ink">{t.unknown}</p>
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
  const t = T[useLang()];
  const why = limit ? o.why.slice(0, limit) : o.why;
  const risks = limit ? o.risks.slice(0, limit) : o.risks;
  return (
    <div className="mt-3 grid gap-4 text-base sm:grid-cols-2">
      {why.length > 0 && (
        <div>
          <p className="font-semibold text-ink">{t.whyYes}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-soft marker:text-moss">
            {why.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {risks.length > 0 && (
        <div>
          <p className="font-semibold text-ink">{t.watch}</p>
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

function RotationBody({ rot, point }: { rot: Rotation; point: Point }) {
  const lang = useLang();
  const t = T[lang];
  const sell = rot.sell;
  const cover = rot.cover;
  return (
    <>
      <p className="text-base text-ink-soft">
        <span className="text-ink">{t.cashCrop}</span> {t.inMonth(sell.name.toLowerCase(), MONTHS[lang][sell.plant_month - 1])}.
        {cover && (
          <>
            {" "}
            <span className="text-ink">{t.optCover}</span> {t.coverLine(cover.name).toLowerCase()}
            {t.coverWinter}
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
  const t = T[useLang()];
  return (
    <div className="mt-4 border-t border-rule pt-4">
      <p className="font-semibold text-ink">{t.aboutCover(o.name.toLowerCase())}</p>
      <Money o={o} />
      <Reasons o={o} limit={2} />
      <Evidence o={o} point={point} />
    </div>
  );
}

const labelTone = (label: string) => TONE[label] ?? "text-clay";

function FieldNotes({ notes, point }: { notes: Note[]; point: Point }) {
  const lang = useLang();
  const t = T[lang];
  if (!notes.length) return null;
  return (
    <div>
      <h3 className="font-serif text-xl font-semibold">{t.nutshell}</h3>
      <ul className="mt-2 space-y-1.5 text-base text-ink-soft">
        {notes.map((n) => (
          <li key={n.text}>
            {n.text}.{" "}
            {n.kind === "real" && n.source ? (
              <a href={sourceUrl(n.source, point.lat, point.lon)} target="_blank" rel="noopener noreferrer" title={SOURCE_LABELS[lang][n.source]} className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-moss underline">
                {t.official} <ExternalIcon />
              </a>
            ) : (
              <span className="text-sm text-ink-faint">{t.tip}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Resultados con todo el detalle (evidencia, vacíos, riesgos, otras rotaciones). Se usa en el informe. */
export function ReportResults({ r, name, point }: { r: Result; name: string; point: Point }) {
  const lang = useLang();
  const t = T[lang];
  const CROPS = CROP_NAMES[lang];
  const MONTH_NAMES = MONTHS[lang];
  const [best, ...rest] = r.rotations;
  return (
    <section className="space-y-8 border-t border-rule pt-8">
      <div>
        <h2 className="font-serif text-3xl font-semibold">{t.suggest(name)}</h2>
        <p className="mt-2 max-w-prose text-base text-ink-soft">
          {r.last_crop ? t.lastCrop((CROPS[r.last_crop] ?? r.last_crop).toLowerCase()) : ""}
          {t.hardHere(monthList(r.critical_months, lang))}
        </p>
      </div>

      {best && (
        <article className="rounded-xl bg-moss-wash p-6">
          <h3 className="font-serif text-3xl font-semibold leading-tight">
            <span className="text-moss">{best.label}:</span> {t.inMonth(best.sell.name.toLowerCase(), MONTH_NAMES[best.sell.plant_month - 1])}
            {best.cover ? <span className="text-ink-soft">{t.andAfter(best.cover.name.toLowerCase())}</span> : null}
          </h3>
          <div className="mt-4">
            <RotationBody rot={best} point={point} />
          </div>
        </article>
      )}

      <FieldNotes notes={r.field_notes} point={point} />

      {(rest.length > 0 || r.baseline) && (
        <div>
          <h3 className="font-serif text-xl font-semibold">{t.otherRot}</h3>
          <div className="mt-2 border-t border-rule">
            {rest.map((rot) => (
              <details key={rot.sell.crop} className="group border-b border-rule py-4">
                <summary className="flex cursor-pointer items-center gap-3">
                  <ChevronIcon className="size-5 shrink-0 text-moss transition-transform group-open:rotate-90" />
                  <span className="flex-1">
                    <span className="block font-serif text-lg font-semibold">
                      {t.inMonth(rot.sell.name, MONTH_NAMES[rot.sell.plant_month - 1])}
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
                    <span className="block font-serif text-lg font-semibold">{t.keepSame(r.baseline.name.toLowerCase())}</span>
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

      {r.method && r.method.length > 0 && (
        <div className="report-section">
          <h3 className="font-serif text-xl font-semibold">{t.howChose}</h3>
          <p className="mt-1 max-w-prose text-base text-ink-soft">{t.howLead}</p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-base text-ink-soft marker:text-field">
            {r.method.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
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
  const lang = useLang();
  const t = T[lang];
  return (
    <section>
      <h4 className="font-serif text-lg font-semibold">{t.climate}</h4>
      {loading && !data && <p className="text-ink-soft">{t.checking}</p>}
      {data && data.zone.id === "custom" && (
        <p className="mt-1 text-ink-soft">
          {t.climateTxt1}
          <strong className="text-ink">{monthList(data.most_vulnerable_months, lang)}</strong>
          {t.climateTxt2}
        </p>
      )}
      <p className="mt-1">
        <SourceLink href={powerUrl(point.lat, point.lon)} title={SOURCE_LABELS[lang].power}>
          {t.seePower}
        </SourceLink>
      </p>
    </section>
  );
}

export function AboutCrops({ point, local }: { point: Point; local: LocalCrops | null }) {
  const lang = useLang();
  const t = T[lang];
  const CROPS = CROP_NAMES[lang];
  const avg: Record<string, number> = {};
  if (local?.available) {
    const ys = Object.values(local.years);
    ys.forEach((y) => Object.entries(y).forEach(([k, v]) => (avg[k] = (avg[k] ?? 0) + v / ys.length)));
  }
  const nearby = Object.entries(avg)
    .filter(([k]) => k !== "otros usos" && k !== "other uses")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  return (
    <section>
      <h4 className="font-serif text-lg font-semibold">{t.around}</h4>
      <p className="mt-1 text-ink-soft">{t.aroundLead}</p>
      {!local && <p className="text-ink-soft">{t.checking}</p>}
      {local && !local.available && <p className="mt-1 text-ink-soft">{local.note}</p>}
      {local?.available && (
        <ul className="mt-3 max-w-md space-y-2">
          {nearby.map(([k, v]) => (
            <li key={k} className="grid grid-cols-[9rem_1fr_3rem] items-center gap-3">
              <span>
                {cap(CROPS[k] ?? LAND_NAMES[lang][k] ?? k)}
                {local.unverified?.includes(k) && <span className="text-ink-faint">*</span>}
              </span>
              <span className="h-2.5 rounded-full bg-paper-deep">
                <span className="block h-full rounded-full bg-moss" style={{ width: `${Math.max(2, v * 100)}%` }} />
              </span>
              <span className="text-right tabular-nums text-ink-soft">{Math.round(v * 100)}%</span>
            </li>
          ))}
        </ul>
      )}
      {local?.available && nearby.some(([k]) => local.unverified?.includes(k)) && (
        <p className="mt-2 text-sm text-ink-soft">{t.unverified}</p>
      )}
      <p className="mt-2">
        <SourceLink href={cdlUrl(point.lat, point.lon)} title={SOURCE_LABELS[lang].cdl}>
          {t.seeCdl}
        </SourceLink>
      </p>
    </section>
  );
}

export function AboutSoil({ point, soil }: { point: Point; soil: Soil | null }) {
  const lang = useLang();
  const t = T[lang];
  const c = soil?.available ? soil.components[0] : null;
  const fmt = (v: number | null, d = 0, u = "") => (v === null ? t.noDataW : `${v.toFixed(d)}${u}`);
  return (
    <section>
      <h4 className="font-serif text-lg font-semibold">{t.soil}</h4>
      {!soil && <p className="text-ink-soft">{t.checking}</p>}
      {soil && !c && <p className="mt-1 text-ink-soft">{soil.note}</p>}
      {c && (
        <dl className="mt-2 grid max-w-xl grid-cols-[11rem_1fr] gap-x-4 gap-y-3">
          <dt className="text-ink-soft">{t.type}</dt>
          <dd>
            {t.soilType(textureWord(c, lang))} <span className="text-sm text-ink-soft">{t.usdaName(c.name)}</span>
            <span className="block text-sm text-ink-soft">{t.texture(fmt(c.sand), fmt(c.silt), fmt(c.clay))}</span>
          </dd>
          <dt className="text-ink-soft">{t.drainage}</dt>
          <dd>{cap(DRAINAGE[lang][c.drainage ?? ""] ?? t.noDataW)}</dd>
          <dt className="text-ink-soft">{t.awc}</dt>
          <dd>
            {c.awc === null ? t.noDataW : c.awc < 0.12 ? t.awcW[0] : c.awc >= 0.18 ? t.awcW[1] : t.awcW[2]}
            <span className="block text-sm text-ink-soft">{t.awcNote}</span>
          </dd>
          <dt className="text-ink-soft">{t.om}</dt>
          <dd>{fmt(c.om, 1, " %")}</dd>
          <dt className="text-ink-soft">{t.ph}</dt>
          <dd>
            {fmt(c.ph, 1)} <span className="text-sm text-ink-soft">{t.neutral}</span>
          </dd>
          <dt className="text-ink-soft">{t.slope}</dt>
          <dd>
            {fmt(c.slope, 0, " %")} <span className="text-sm text-ink-soft">{t.slopeNote}</span>
          </dd>
        </dl>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <SourceLink href={ssurgoMapUrl(point.lat, point.lon)} title={SOURCE_LABELS[lang].ssurgo}>
          {t.seeSsurgo}
        </SourceLink>
        {c && (
          <details className="text-sm text-ink-soft">
            <summary className="cursor-pointer text-moss underline">{t.techQuery}</summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md border border-rule bg-paper-deep p-3 text-xs">{soil!.sql}</pre>
            <p className="mt-1">
              {t.pasteIn}
              <a className="text-moss underline" href={soil!.query_page} target="_blank" rel="noopener noreferrer">
                Soil Data Access
              </a>
              {t.sameNums}
            </p>
          </details>
        )}
      </div>
    </section>
  );
}

export function AboutGreen({ point, ndvi }: { point: Point; ndvi: Ndvi | null }) {
  const lang = useLang();
  const t = T[lang];
  const low = ndvi?.low_months ?? [];
  return (
    <section>
      <h4 className="font-serif text-lg font-semibold">{t.greenTitle}</h4>
      {!ndvi && <p className="mt-1 text-ink-soft">{t.greenSlow}</p>}
      {ndvi && !ndvi.available && <p className="mt-1 text-ink-soft">{ndvi.note}</p>}
      {ndvi?.available && (
        <>
          <p className="mt-1 text-ink-soft">
            {t.greenLead}{" "}
            {low.length > 0 ? (
              <>
                {t.lowIn1}
                <strong className="text-ink">{monthList(low, lang)}</strong>.
              </>
            ) : (
              t.notBare
            )}
          </p>
          <div className="mt-3 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ndvi.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--rule)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--ink-soft)" fontSize={12} minTickGap={36} tickFormatter={(d: string) => `${MONTHS[lang][+d.slice(5, 7) - 1].slice(0, 3)} ${d.slice(0, 4)}`} />
                <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} stroke="var(--ink-soft)" fontSize={12} width={32} />
                <Tooltip
                  contentStyle={{ background: "var(--paper)", border: "1px solid var(--rule)", color: "var(--ink)" }}
                  labelFormatter={(d) => String(d)}
                  formatter={(v) => [String(v), t.greenness]}
                />
                <ReferenceLine y={ndvi.threshold} stroke="var(--clay)" strokeDasharray="4 3" />
                <Line dataKey="ndvi" stroke="var(--moss)" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            {t.greenNote(ndvi.threshold)}
          </p>
        </>
      )}
      <p className="mt-2">
        <SourceLink href={ndviUrl(point.lat, point.lon)} title={SOURCE_LABELS[lang].ndvi}>
          {t.seeNdvi}
        </SourceLink>
      </p>
    </section>
  );
}

