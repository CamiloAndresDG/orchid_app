"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as maplibregl from "maplibre-gl";
import { Guide } from "../assistant";
import { ECON_KEY, PLOT_KEY, endSession, useSession, type Session } from "../auth";
import "maplibre-gl/dist/maplibre-gl.css";
import { AlertIcon, PinIcon } from "../icons";
import { Analysis, ClimaPanel, EstrategiasPanel, FuentesPanel, TabId, VulnerabilidadPanel, Zone } from "../panels";
import { flushNotebook, notebookChanged, pullNotebook } from "../notebook";
import { PreciosPanel } from "../precios";
import { EconUS, HistoryRow } from "../shared";
import { LocalCrops, Point, TerrenoPanel } from "../terreno";
import { UserMenu } from "../user-menu";
import { CREDIT, OrchidMark } from "../logo";

// Next no empaqueta el worker de MapLibre: se sirve desde /public/maplibre.
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Imagen satelital con caminos y nombres del USGS (dominio publico, EE. UU.).
const MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    usgs: {
      type: "raster",
      tiles: ["https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 16,
      attribution: "Imagen: USGS The National Map",
    },
  },
  layers: [{ id: "usgs", type: "raster", source: "usgs" }],
};

const MORE: { id: TabId; label: string }[] = [
  { id: "clima", label: "Clima" },
  { id: "vulnerabilidad", label: "Meses difíciles" },
  { id: "estrategias", label: "Ejemplos" },
  { id: "fuentes", label: "De dónde salen los datos" },
];
const isMore = (t: TabId) => MORE.some((m) => m.id === t);

function pinElement(): HTMLElement {
  const el = document.createElement("div");
  el.className = "fs-pin";
  el.innerHTML = `
    <span style="display:block;padding:4px 10px;border-radius:999px;background:var(--moss);color:var(--paper);font:600 13px/1.2 var(--font-public),system-ui;white-space:nowrap;box-shadow:0 2px 6px rgb(0 0 0/.35)">Mi terreno</span>
    <svg width="34" height="44" viewBox="0 0 34 44" style="display:block;margin:2px auto 0;filter:drop-shadow(0 3px 4px rgb(0 0 0/.4))">
      <path d="M17 43s14-12.4 14-25A14 14 0 0 0 3 18c0 12.6 14 25 14 25Z" fill="var(--moss)" stroke="var(--paper)" stroke-width="2.5"/>
      <circle cx="17" cy="18" r="5.5" fill="var(--paper)"/>
    </svg>`;
  el.style.textAlign = "center";
  el.setAttribute("aria-label", "Mi terreno");
  return el;
}

// Solo entran personas con sesión; si no, van al inicio de sesión.
// Con cuenta, primero se trae el cuaderno del servidor; el modo visitante usa solo este navegador.
export default function MapaPage() {
  const router = useRouter();
  const session = useSession();
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
      if (r === "unauthorized") return endSession(); // sesión vencida: vuelve al inicio de sesión
      setOffline(r === "offline");
      setPulled(token);
    });
    return () => {
      live = false;
    };
  }, [token, pulled]);
  if (!session || (token && pulled !== token)) {
    return <div className="grid h-screen place-items-center bg-paper text-ink-soft">Abriendo tu cuaderno…</div>;
  }
  return (
    <>
      <MapaApp
        session={session}
        onLogout={() => {
          flushNotebook();
          endSession();
          router.replace("/");
        }}
      />
      {offline && (
        <p role="status" className="fixed bottom-4 left-4 z-50 max-w-xs rounded-lg border border-clay/40 bg-paper px-4 py-2 text-sm text-clay shadow-[0_4px_12px_rgb(0_0_0/0.25)]">
          No pudimos abrir tu cuaderno guardado. Lo que cambies ahora no se guardará en tu cuenta; recarga la página en un rato.
        </p>
      )}
    </>
  );
}

function MapaApp({ session, onLogout }: { session: Session; onLogout: () => void }) {
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
  const [tab, setTab] = useState<TabId>("terreno");
  const [econ, setEcon] = useState<Record<string, EconUS>>({});
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [hydrated, setHydrated] = useState(false);

  // Tema: claro por defecto (el cuaderno de papel); oscuro solo si la persona lo eligio.
  useEffect(() => {
    const t = localStorage.getItem("theme") === "dark" ? "dark" : "light";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(t);
    document.documentElement.dataset.theme = t;
  }, []);
  function toggleTheme() {
    const t = theme === "dark" ? "light" : "dark";
    setTheme(t);
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem("theme", t);
    } catch {}
  }

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
  // No escribir hasta haber leído lo guardado: si no, el estado inicial vacío borra los precios.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(ECON_KEY, JSON.stringify(econ));
    } catch {}
    notebookChanged();
  }, [econ, hydrated]);

  useEffect(() => {
    fetch(`${API}/zones`)
      .then((r) => r.json())
      .then(setZones)
      .catch(() => setError("No pudimos conectar con el servidor de Orchid. Revisa tu conexión y vuelve a cargar la página."));
  }, []);

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
      const r = await fetch(`${API}/geocode?q=${encodeURIComponent(text)}`);
      const j = await r.json();
      if (r.ok) {
        const zoom = j.kind === "address" ? 15 : j.kind === "county" ? 10 : 12;
        map.current?.flyTo({ center: [j.lon, j.lat], zoom, speed: 1.4 });
        setSearchMsg(`${j.label}. Ahora acércate y haz clic sobre tu campo para marcarlo.`);
      } else {
        setSearchMsg(j.detail ?? "No encontramos ese lugar.");
      }
    } catch {
      setSearchMsg("No pudimos buscar ahora. Revisa tu conexión o acércate con el mapa.");
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
      pin.current = new maplibregl.Marker({ element: pinElement(), anchor: "bottom" }).setLngLat([p.lon, p.lat]).addTo(map.current);
    }
    pin.current?.setLngLat([p.lon, p.lat]);
    if (fly) map.current?.flyTo({ center: [p.lon, p.lat], zoom: Math.max(map.current.getZoom(), 14), speed: 1.4 });
    const post = (path: string) =>
      fetch(`${API}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p) }).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
      );
    post("/point/analysis")
      .then(setPointData)
      .catch(() => setError("No pudimos consultar el clima de este punto. Vuelve a tocar el mapa para intentarlo de nuevo."))
      .finally(() => setLoadingPoint(false));
    post("/point/local-crops")
      .then(setLocal)
      .catch(() => setLocal({ available: false, years: {}, radius_km: 1.1, note: "No pudimos consultar los cultivos cercanos." }));
  }

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
    fetch(`${API}/zones/${z.id}/analysis`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setExample)
      .catch(() => setError("No pudimos cargar el ejemplo. Inténtalo de nuevo en un momento."))
      .finally(() => setLoadingExample(false));
  }

  // El cuaderno muestra una sola vista a la vez: tu terreno (principal), tus precios o los datos de la zona.
  const scrollRef = useRef<HTMLDivElement>(null);
  function goTab(t: TabId) {
    setTab(t);
    scrollRef.current?.scrollTo({ top: 0 });
  }

  // Cultivos que ocupan al menos el 5% de la zona (mapa de cultivos USDA): se ofrecen en Mis precios.
  const zoneCrops: string[] = [];
  if (local?.available) {
    const ys = Object.values(local.years);
    const avg: Record<string, number> = {};
    ys.forEach((y) => Object.entries(y).forEach(([k, v]) => (avg[k] = (avg[k] ?? 0) + v / ys.length)));
    Object.entries(avg).forEach(([k, v]) => v >= 0.05 && zoneCrops.push(k));
  }

  // Clima y meses dificiles: tu terreno primero; si no hay, el ejemplo abierto.
  const climateData = pointData ?? example;

  return (
    <main className="flex h-screen min-w-[1024px]">
      <aside className="flex h-full w-[30rem] shrink-0 flex-col border-r border-rule bg-paper text-ink">
        <header className="px-8 pb-2 pt-7">
          <div className="flex items-center justify-between gap-4">
            <h1 className="flex items-center gap-2.5 font-serif text-2xl font-semibold leading-none">
              <OrchidMark size={34} />
              Orchid
            </h1>
            {tab !== "terreno" && (
              <button onClick={() => goTab("terreno")} className="text-base font-semibold text-moss hover:underline">
                ← Volver a tu terreno
              </button>
            )}
          </div>
          {isMore(tab) && (
            <nav className="flex flex-wrap gap-2 pt-5" aria-label="Datos de la zona">
              {MORE.map((m) => (
                <button
                  key={m.id}
                  onClick={() => goTab(m.id)}
                  aria-current={tab === m.id ? "page" : undefined}
                  className={`rounded-full border px-4 py-2 text-sm ${tab === m.id ? "border-moss bg-moss text-paper" : "border-rule text-ink-soft hover:border-moss hover:text-ink"}`}
                >
                  {m.label}
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

          <div hidden={tab !== "terreno"}>
            <TerrenoPanel
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
            <nav aria-label="Más datos" className="mt-12 border-t border-rule pt-6 text-base text-ink-soft">
              <p>Más datos de la zona:</p>
              <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {MORE.map((m) => (
                  <button key={m.id} onClick={() => goTab(m.id)} className="font-semibold text-moss hover:underline">
                    {m.label}
                  </button>
                ))}
              </p>
            </nav>
            <p className="mt-8 text-sm text-ink-faint">{CREDIT}.</p>
          </div>
          <div hidden={tab !== "precios"}>
            <PreciosPanel econ={econ} setEcon={setEcon} point={point} history={history} zoneCrops={zoneCrops} go={goTab} />
          </div>
          {isMore(tab) && (
            <div>
              {tab === "estrategias" && (
                <ExamplesHeader zones={zones} activeId={exampleId} onOpen={openExample} loading={loadingExample} />
              )}
              {tab === "estrategias" && example && <EstrategiasPanel data={example} go={goTab} />}
              {(tab === "clima" || tab === "vulnerabilidad") && !climateData && (
                <EmptyMore loading={loadingPoint || loadingExample} onExample={() => goTab("estrategias")} />
              )}
              {tab === "clima" && climateData && <ClimaPanel data={climateData} />}
              {tab === "vulnerabilidad" && climateData && <VulnerabilidadPanel data={climateData} />}
              {tab === "fuentes" && <FuentesPanel data={climateData} />}
            </div>
          )}
        </div>
      </aside>

      <section className="relative h-full min-w-0 flex-1" aria-label="Mapa para marcar tu terreno">
        <div ref={mapEl} className="h-full w-full" />
        <div className="pointer-events-none absolute inset-0 shadow-[inset_12px_0_24px_-12px_rgb(0_0_0/0.35)]" />
        <form onSubmit={searchPlace} className="absolute left-4 top-4 flex w-[min(30rem,calc(100%-6.5rem))] gap-2" role="search">
          <label className="sr-only" htmlFor="place">Buscar tu dirección, pueblo o código postal</label>
          <input
            id="place"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pueblo y estado, condado o código postal"
            className="min-w-0 flex-1 rounded-md border border-field bg-paper px-4 py-3 text-base text-ink shadow-[0_4px_12px_rgb(0_0_0/0.25)] placeholder:text-ink-soft"
          />
          <button disabled={searching} className="rounded-md bg-moss px-5 py-3 text-base font-semibold text-paper shadow-[0_4px_12px_rgb(0_0_0/0.25)] hover:bg-moss-deep disabled:opacity-60">
            {searching ? "Buscando…" : "Buscar"}
          </button>
        </form>
        <div className="absolute right-4 top-4 z-20">
          <UserMenu session={session} theme={theme} onToggleTheme={toggleTheme} onPrices={() => goTab("precios")} onLogout={onLogout} />
        </div>
        {searchMsg && (
          <p role="status" className="absolute left-4 top-[4.75rem] w-[min(30rem,calc(100%-6.5rem))] rounded-md bg-paper/95 px-4 py-2 text-base text-ink shadow-[0_4px_12px_rgb(0_0_0/0.25)]">
            {searchMsg}
          </p>
        )}
        {!point && !searchMsg && (
          <div className="pointer-events-none absolute left-1/2 top-24 w-[min(28rem,calc(100%-3rem))] -translate-x-1/2 rounded-lg bg-paper/95 px-5 py-4 text-ink shadow-[0_6px_20px_rgb(0_0_0/0.3)]">
            <p className="flex items-center gap-2 font-serif text-xl font-semibold">
              <PinIcon className="text-moss" /> Toca tu terreno en el mapa
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              Acerca con la rueda del ratón o los botones + y − hasta ver tu campo, y haz clic encima. Disponible en EE. UU.
            </p>
          </div>
        )}
        {point && (
          <p className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-paper/95 px-4 py-2 text-sm text-ink shadow-[0_4px_12px_rgb(0_0_0/0.3)]">
            ¿No es tu campo? Haz clic en el lugar correcto para mover el pin.
          </p>
        )}
        <Guide point={point} />
      </section>
    </main>
  );
}

function ExamplesHeader({ zones, activeId, onOpen, loading }: { zones: Zone[]; activeId: string | null; onOpen: (z: Zone) => void; loading: boolean }) {
  return (
    <div className="mb-8">
      <h2 className="font-serif text-2xl font-semibold">Ejemplos de dos zonas reales</h2>
      <p className="mt-1 text-base text-ink-soft">
        Mira cómo funciona con dos zonas de muestra. Abrir un ejemplo no cambia tu terreno.
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
      {loading && <p className="mt-3 text-sm text-ink-soft">Cargando el ejemplo…</p>}
    </div>
  );
}

function EmptyMore({ loading, onExample }: { loading: boolean; onExample: () => void }) {
  if (loading) return <p className="text-base text-ink-soft">Consultando el clima de tu terreno…</p>;
  return (
    <div className="rounded-lg border border-dashed border-field p-8 text-center">
      <PinIcon className="mx-auto text-moss" />
      <p className="mt-3 font-serif text-xl font-semibold">Primero marca tu terreno</p>
      <p className="mx-auto mt-1 max-w-sm text-base text-ink-soft">Toca tu campo en el mapa para ver su clima, o abre uno de los ejemplos.</p>
      <button onClick={onExample} className="mt-4 rounded-full border border-moss px-5 py-2 text-base text-moss hover:bg-moss hover:text-paper">
        Ver un ejemplo
      </button>
    </div>
  );
}
