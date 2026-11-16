"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as maplibregl from "maplibre-gl";
import { Guide } from "../assistant";
import { ECON_KEY, PLOT_KEY, endSession, useSession, type Session } from "../auth";
import "maplibre-gl/dist/maplibre-gl.css";
import { AlertIcon, PinIcon } from "../icons";
import { Analysis, ClimatePanel, StrategiesPanel, SourcesPanel, TabId, VulnerabilityPanel, Zone } from "../panels";
import { flushNotebook, notebookChanged, pullNotebook } from "../notebook";
import { PricesPanel } from "../prices";
import { EconUS, HistoryRow } from "../shared";
import { LocalCrops, Point, FieldPanel } from "../field";
import { UserMenu } from "../user-menu";
import { CREDIT, FULL_NAME, OrchidMark } from "../logo";
import { Lang, currentLang, langHeaders, useLang } from "../i18n";

// Next doesn't bundle the MapLibre worker: it's served from /public/maplibre.
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// USGS satellite imagery with roads and names (public domain, U.S.).
const MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    usgs: {
      type: "raster",
      tiles: ["https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 16,
      attribution: "USGS The National Map",
    },
  },
  layers: [{ id: "usgs", type: "raster", source: "usgs" }],
};

const MORE_IDS: TabId[] = ["climate", "vulnerability", "strategies", "sources"];
const isMore = (t: TabId) => MORE_IDS.includes(t);

const COPY = {
  es: {
    more: { climate: "Clima", vulnerability: "Meses difíciles", strategies: "Ejemplos", sources: "De dónde salen los datos" } as Record<string, string>,
    pin: "Mi terreno",
    opening: "Abriendo tu cuaderno…",
    offline: "No pudimos abrir tu cuaderno guardado. Lo que cambies ahora no se guardará en tu cuenta; recarga la página en un rato.",
    noServer: "No pudimos conectar con el servidor de ORCHID. Revisa tu conexión y vuelve a cargar la página.",
    found: (label: string) => `${label}. Ahora acércate y haz clic sobre tu campo para marcarlo.`,
    notFound: "No encontramos ese lugar.",
    searchFail: "No pudimos buscar ahora. Revisa tu conexión o acércate con el mapa.",
    climateFail: "No pudimos consultar el clima de este punto. Vuelve a tocar el mapa para intentarlo de nuevo.",
    cropsFail: "No pudimos consultar los cultivos cercanos.",
    exampleFail: "No pudimos cargar el ejemplo. Inténtalo de nuevo en un momento.",
    back: "← Volver a tu terreno",
    zoneData: "Datos de la zona",
    moreData: "Más datos",
    moreDataZone: "Más datos de la zona:",
    mapLabel: "Mapa para marcar tu terreno",
    searchLabel: "Buscar tu dirección, pueblo o código postal",
    searchPh: "Pueblo y estado, condado o código postal",
    searching: "Buscando…",
    search: "Buscar",
    tapTitle: "Toca tu terreno en el mapa",
    tapText: "Acerca con la rueda del ratón o los botones + y − hasta ver tu campo, y haz clic encima. Disponible en EE. UU.",
    notYours: "¿No es tu campo? Haz clic en el lugar correcto para mover el pin.",
    exTitle: "Ejemplos de dos zonas reales",
    exText: "Mira cómo funciona con dos zonas de muestra. Abrir un ejemplo no cambia tu terreno.",
    exLoading: "Cargando el ejemplo…",
    emptyLoading: "Consultando el clima de tu terreno…",
    emptyTitle: "Primero marca tu terreno",
    emptyText: "Toca tu campo en el mapa para ver su clima, o abre uno de los ejemplos.",
    emptyBtn: "Ver un ejemplo",
  },
  en: {
    more: { climate: "Climate", vulnerability: "Hard months", strategies: "Examples", sources: "Where the data comes from" } as Record<string, string>,
    pin: "My field",
    opening: "Opening your notebook…",
    offline: "We couldn't open your saved notebook. Changes you make now won't be saved to your account; reload the page in a while.",
    noServer: "We couldn't reach the ORCHID server. Check your connection and reload the page.",
    found: (label: string) => `${label}. Now zoom in and click on your field to mark it.`,
    notFound: "We couldn't find that place.",
    searchFail: "We couldn't search right now. Check your connection or zoom in on the map.",
    climateFail: "We couldn't get the climate for this point. Tap the map again to retry.",
    cropsFail: "We couldn't look up nearby crops.",
    exampleFail: "We couldn't load the example. Try again in a moment.",
    back: "← Back to your field",
    zoneData: "Area data",
    moreData: "More data",
    moreDataZone: "More data about the area:",
    mapLabel: "Map to mark your field",
    searchLabel: "Search your address, town or ZIP code",
    searchPh: "Town and state, county or ZIP code",
    searching: "Searching…",
    search: "Search",
    tapTitle: "Tap your field on the map",
    tapText: "Zoom in with the mouse wheel or the + and − buttons until you see your field, then click on it. Available in the U.S.",
    notYours: "Not your field? Click the right spot to move the pin.",
    exTitle: "Examples from two real areas",
    exText: "See how it works with two sample areas. Opening an example doesn't change your field.",
    exLoading: "Loading the example…",
    emptyLoading: "Getting your field's climate…",
    emptyTitle: "Mark your field first",
    emptyText: "Tap your field on the map to see its climate, or open one of the examples.",
    emptyBtn: "See an example",
  },
};

function pinElement(lang: Lang): HTMLElement {
  const el = document.createElement("div");
  el.className = "fs-pin";
  el.innerHTML = `
    <span style="display:block;padding:4px 10px;border-radius:999px;background:var(--moss);color:var(--paper);font:600 13px/1.2 var(--font-public),system-ui;white-space:nowrap;box-shadow:0 2px 6px rgb(0 0 0/.35)">${COPY[lang].pin}</span>
    <svg width="34" height="44" viewBox="0 0 34 44" style="display:block;margin:2px auto 0;filter:drop-shadow(0 3px 4px rgb(0 0 0/.4))">
      <path d="M17 43s14-12.4 14-25A14 14 0 0 0 3 18c0 12.6 14 25 14 25Z" fill="var(--moss)" stroke="var(--paper)" stroke-width="2.5"/>
      <circle cx="17" cy="18" r="5.5" fill="var(--paper)"/>
    </svg>`;
  el.style.textAlign = "center";
  el.setAttribute("aria-label", COPY[lang].pin);
  return el;
}

// Only signed-in people get in; otherwise they go to sign-in.
// With an account, the notebook is fetched from the server first; guest mode uses only this browser.
export default function MapPage() {
  const router = useRouter();
  const session = useSession();
  const c = COPY[useLang()];
  const token = session?.token;
  const [pulled, setPulled] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if (session === null) router.replace("/login");
  }, [session, router]);
  useEffect(() => {
    if (!token || pulled === token) return;
    let live = true;
    pullNotebook(token).then((r) => {
      if (!live) return;
      if (r === "unauthorized") return endSession(); // session expired: back to sign-in
      setOffline(r === "offline");
      setPulled(token);
    });
    return () => {
      live = false;
    };
  }, [token, pulled]);
  if (!session || (token && pulled !== token)) {
    return <div className="grid h-screen place-items-center bg-paper text-ink-soft">{c.opening}</div>;
  }
  return (
    <>
      <MapApp
        session={session}
        onLogout={() => {
          flushNotebook();
          endSession();
          router.replace("/");
        }}
      />
      {offline && (
        <p role="status" className="fixed bottom-4 left-4 z-50 max-w-xs rounded-lg border border-clay/40 bg-paper px-4 py-2 text-sm text-clay shadow-[0_4px_12px_rgb(0_0_0/0.25)]">
          {c.offline}
        </p>
      )}
    </>
  );
}

function MapApp({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const pin = useRef<maplibregl.Marker | null>(null);

  const [zones, setZones] = useState<Zone[]>([]);
  const [example, setExample] = useState<Analysis | null>(null);
  const [exampleId, setExampleId] = useState<string | null>(null);
  const [pointData, setPointData] = useState<Analysis | null>(null);
  const [local, setLocal] = useState<LocalCrops | null>(null);
  const [point, setPoint] = useState<Point | null>(null);
  const [loadingPoint, setLoadingPoint] = useState(false);
  const [loadingExample, setLoadingExample] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("field");
  const [econ, setEcon] = useState<Record<string, EconUS>>({});
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const lang = useLang();
  const c = COPY[lang];

  useEffect(() => {
    try {
      const e = JSON.parse(localStorage.getItem(ECON_KEY) ?? "null");
      const p = JSON.parse(localStorage.getItem(PLOT_KEY) ?? "null");
      /* eslint-disable react-hooks/set-state-in-effect */
      if (e) setEcon(e);
      if (p?.history) setHistory(p.history);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {}
    setHydrated(true);
  }, []);
  // Don't write until the saved data has been read: otherwise the empty initial state wipes the prices.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(ECON_KEY, JSON.stringify(econ));
    } catch {}
    notebookChanged();
  }, [econ, hydrated]);

  useEffect(() => {
    fetch(`${API}/zones`, { headers: langHeaders() })
      .then((r) => r.json())
      .then(setZones)
      .catch(() => setError(COPY[currentLang()].noServer));
  }, [lang]);

  useEffect(() => {
    if (!mapEl.current || map.current) return;
    map.current = new maplibregl.Map({
      container: mapEl.current,
      style: MAP_STYLE,
      center: [-96, 39],
      zoom: 4,
      maxZoom: 16,
      attributionControl: { compact: true },
    });
    map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-left");
    const style = document.createElement("style");
    style.textContent = ".maplibregl-ctrl-group button{width:44px!important;height:44px!important}";
    document.head.appendChild(style);
    map.current.getCanvas().style.cursor = "crosshair";
    map.current.on("click", (e) => choosePoint({ lat: +e.lngLat.lat.toFixed(5), lon: +e.lngLat.lng.toFixed(5) }));
    const ro = new ResizeObserver(() => map.current?.resize());
    ro.observe(mapEl.current);
    return () => {
      ro.disconnect();
      map.current?.remove();
      map.current = null;
    };
  }, []);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  async function searchPlace(e: React.FormEvent) {
    e.preventDefault();
    const text = query.trim();
    if (!text) return;
    setSearching(true);
    setSearchMsg(null);
    try {
      const r = await fetch(`${API}/geocode?q=${encodeURIComponent(text)}`, { headers: langHeaders() });
      const j = await r.json();
      if (r.ok) {
        const zoom = j.kind === "address" ? 15 : j.kind === "county" ? 10 : 12;
        map.current?.flyTo({ center: [j.lon, j.lat], zoom, speed: 1.4 });
        setSearchMsg(c.found(j.label));
      } else {
        setSearchMsg(j.detail ?? c.notFound);
      }
    } catch {
      setSearchMsg(c.searchFail);
    } finally {
      setSearching(false);
    }
  }

  function choosePoint(p: Point, fly = true) {
    setPoint(p);
    setError(null);
    setPointData(null);
    setLocal(null);
    setLoadingPoint(true);
    if (!pin.current && map.current) {
      pin.current = new maplibregl.Marker({ element: pinElement(currentLang()), anchor: "bottom" }).setLngLat([p.lon, p.lat]).addTo(map.current);
    }
    pin.current?.setLngLat([p.lon, p.lat]);
    if (fly) map.current?.flyTo({ center: [p.lon, p.lat], zoom: Math.max(map.current.getZoom(), 14), speed: 1.4 });
    const t = COPY[currentLang()];
    const post = (path: string) =>
      fetch(`${API}${path}`, { method: "POST", headers: langHeaders({ "content-type": "application/json" }), body: JSON.stringify(p) }).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
      );
    post("/point/analysis")
      .then(setPointData)
      .catch(() => setError(t.climateFail))
      .finally(() => setLoadingPoint(false));
    post("/point/local-crops")
      .then(setLocal)
      .catch(() => setLocal({ available: false, years: {}, radius_km: 1.1, note: t.cropsFail }));
  }

  // On language change: the server's notes come in the requested language, so they're requested again.
  const langRef = useRef(lang);
  useEffect(() => {
    if (langRef.current === lang) return;
    langRef.current = lang;
    const el = pin.current?.getElement();
    if (el) {
      el.innerHTML = pinElement(lang).innerHTML;
      el.setAttribute("aria-label", COPY[lang].pin);
    }
    if (point) choosePoint(point, false);
    if (exampleId) {
      const z = zones.find((x) => x.id === exampleId);
      if (z) openExample(z);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(PLOT_KEY) ?? "null");
      if (s?.point) {
        const t = setTimeout(() => choosePoint(s.point), 500);
        return () => clearTimeout(t);
      }
    } catch {}
  }, []);

  function openExample(z: Zone) {
    setExampleId(z.id);
    setExample(null);
    setLoadingExample(true);
    fetch(`${API}/zones/${z.id}/analysis`, { headers: langHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setExample)
      .catch(() => setError(COPY[currentLang()].exampleFail))
      .finally(() => setLoadingExample(false));
  }

  // The notebook shows one view at a time: your field (main), your prices or the area's data.
  const scrollRef = useRef<HTMLDivElement>(null);
  function goTab(t: TabId) {
    setTab(t);
    scrollRef.current?.scrollTo({ top: 0 });
  }

  // Crops covering at least 5% of the area (USDA crop map): offered in My prices.
  const zoneCrops: string[] = [];
  if (local?.available) {
    const ys = Object.values(local.years);
    const avg: Record<string, number> = {};
    ys.forEach((y) => Object.entries(y).forEach(([k, v]) => (avg[k] = (avg[k] ?? 0) + v / ys.length)));
    Object.entries(avg).forEach(([k, v]) => v >= 0.05 && zoneCrops.push(k));
  }

  // Climate and hard months: your field first; if there's none, the open example.
  const climateData = pointData ?? example;

  return (
    <main className="flex h-screen min-w-[1024px]">
      <aside className="flex h-full w-[30rem] shrink-0 flex-col border-r border-rule bg-paper text-ink">
        <header className="px-8 pb-2 pt-7">
          <div className="flex items-center justify-between gap-4">
            <h1 className="flex items-center gap-2.5" title={FULL_NAME}>
              <OrchidMark size={34} />
              <span className="font-serif text-2xl font-semibold leading-none tracking-wide">ORCHID</span>
              <span className="sr-only">, {FULL_NAME}</span>
            </h1>
            {tab !== "field" && (
              <button onClick={() => goTab("field")} className="text-base font-semibold text-moss hover:underline">
                {c.back}
              </button>
            )}
          </div>
          {isMore(tab) && (
            <nav className="flex flex-wrap gap-2 pt-5" aria-label={c.zoneData}>
              {MORE_IDS.map((id) => (
                <button
                  key={id}
                  onClick={() => goTab(id)}
                  aria-current={tab === id ? "page" : undefined}
                  className={`rounded-full border px-4 py-2 text-sm ${tab === id ? "border-moss bg-moss text-paper" : "border-rule text-ink-soft hover:border-moss hover:text-ink"}`}
                >
                  {c.more[id]}
                </button>
              ))}
            </nav>
          )}
        </header>

        <div ref={scrollRef} className="relative flex-1 overflow-y-auto px-8 pb-10 pt-6" id="scroll-area">
          {error && (
            <p role="alert" className="mb-5 flex items-start gap-3 rounded-lg border border-clay/40 bg-paper-deep p-4 text-base text-clay">
              <AlertIcon className="mt-0.5 shrink-0" /> {error}
            </p>
          )}

          <div hidden={tab !== "field"}>
            <FieldPanel
              point={point}
              data={pointData}
              local={local}
              loadingPoint={loadingPoint}
              econ={econ}
              history={history}
              setHistory={setHistory}
              hydrated={hydrated}
              go={goTab}
            />
            <nav aria-label={c.moreData} className="mt-12 border-t border-rule pt-6 text-base text-ink-soft">
              <p>{c.moreDataZone}</p>
              <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {MORE_IDS.map((id) => (
                  <button key={id} onClick={() => goTab(id)} className="font-semibold text-moss hover:underline">
                    {c.more[id]}
                  </button>
                ))}
              </p>
            </nav>
            <p className="mt-8 text-sm text-ink-faint">
              ORCHID: {FULL_NAME}. {CREDIT[lang]}.
            </p>
          </div>
          <div hidden={tab !== "prices"}>
            <PricesPanel econ={econ} setEcon={setEcon} point={point} history={history} zoneCrops={zoneCrops} go={goTab} />
          </div>
          {isMore(tab) && (
            <div>
              {tab === "strategies" && (
                <ExamplesHeader zones={zones} activeId={exampleId} onOpen={openExample} loading={loadingExample} />
              )}
              {tab === "strategies" && example && <StrategiesPanel data={example} go={goTab} />}
              {(tab === "climate" || tab === "vulnerability") && !climateData && (
                <EmptyMore loading={loadingPoint || loadingExample} onExample={() => goTab("strategies")} />
              )}
              {tab === "climate" && climateData && <ClimatePanel data={climateData} />}
              {tab === "vulnerability" && climateData && <VulnerabilityPanel data={climateData} />}
              {tab === "sources" && <SourcesPanel data={climateData} />}
            </div>
          )}
        </div>
      </aside>

      <section className="relative h-full min-w-0 flex-1" aria-label={c.mapLabel}>
        <div ref={mapEl} className="h-full w-full" />
        <div className="pointer-events-none absolute inset-0 shadow-[inset_12px_0_24px_-12px_rgb(0_0_0/0.35)]" />
        <form onSubmit={searchPlace} className="absolute left-4 top-4 flex w-[min(30rem,calc(100%-6.5rem))] gap-2" role="search">
          <label className="sr-only" htmlFor="place">{c.searchLabel}</label>
          <input
            id="place"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={c.searchPh}
            className="min-w-0 flex-1 rounded-md border border-field bg-paper px-4 py-3 text-base text-ink shadow-[0_4px_12px_rgb(0_0_0/0.25)] placeholder:text-ink-soft"
          />
          <button disabled={searching} className="rounded-md bg-moss px-5 py-3 text-base font-semibold text-paper shadow-[0_4px_12px_rgb(0_0_0/0.25)] hover:bg-moss-deep disabled:opacity-60">
            {searching ? c.searching : c.search}
          </button>
        </form>
        <div className="absolute right-4 top-4 z-20">
          <UserMenu session={session} onPrices={() => goTab("prices")} onLogout={onLogout} />
        </div>
        {searchMsg && (
          <p role="status" className="absolute left-4 top-[4.75rem] w-[min(30rem,calc(100%-6.5rem))] rounded-md bg-paper/95 px-4 py-2 text-base text-ink shadow-[0_4px_12px_rgb(0_0_0/0.25)]">
            {searchMsg}
          </p>
        )}
        {!point && !searchMsg && (
          <div className="pointer-events-none absolute left-1/2 top-24 w-[min(28rem,calc(100%-3rem))] -translate-x-1/2 rounded-lg bg-paper/95 px-5 py-4 text-ink shadow-[0_6px_20px_rgb(0_0_0/0.3)]">
            <p className="flex items-center gap-2 font-serif text-xl font-semibold">
              <PinIcon className="text-moss" /> {c.tapTitle}
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              {c.tapText}
            </p>
          </div>
        )}
        {point && (
          <p className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-paper/95 px-4 py-2 text-sm text-ink shadow-[0_4px_12px_rgb(0_0_0/0.3)]">
            {c.notYours}
          </p>
        )}
        <Guide point={point} />
      </section>
    </main>
  );
}

function ExamplesHeader({ zones, activeId, onOpen, loading }: { zones: Zone[]; activeId: string | null; onOpen: (z: Zone) => void; loading: boolean }) {
  const c = COPY[useLang()];
  return (
    <div className="mb-8">
      <h2 className="font-serif text-2xl font-semibold">{c.exTitle}</h2>
      <p className="mt-1 text-base text-ink-soft">
        {c.exText}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {zones.map((z) => (
          <button
            key={z.id}
            onClick={() => onOpen(z)}
            aria-pressed={activeId === z.id}
            className={`rounded-full border px-5 py-2.5 text-base ${activeId === z.id ? "border-moss bg-moss text-paper" : "border-field text-ink hover:border-moss"}`}
          >
            {z.name}
          </button>
        ))}
      </div>
      {loading && <p className="mt-3 text-sm text-ink-soft">{c.exLoading}</p>}
    </div>
  );
}

function EmptyMore({ loading, onExample }: { loading: boolean; onExample: () => void }) {
  const c = COPY[useLang()];
  if (loading) return <p className="text-base text-ink-soft">{c.emptyLoading}</p>;
  return (
    <div className="rounded-lg border border-dashed border-field p-8 text-center">
      <PinIcon className="mx-auto text-moss" />
      <p className="mt-3 font-serif text-xl font-semibold">{c.emptyTitle}</p>
      <p className="mx-auto mt-1 max-w-sm text-base text-ink-soft">{c.emptyText}</p>
      <button onClick={onExample} className="mt-4 rounded-full border border-moss px-5 py-2 text-base text-moss hover:bg-moss hover:text-paper">
        {c.emptyBtn}
      </button>
    </div>
  );
}
