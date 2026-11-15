"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ParallaxHero } from "./hero-video";
import { CREDIT, FULL_NAME, OrchidMark } from "./logo";
import { endSession, startSession, useSession } from "./auth";
import { useLang } from "./i18n";
import { LangToggle } from "./lang-toggle";

type Source = { name: string; status: "on" | "off"; use: string };

const COPY = {
  es: {
    navFarmers: "Para agricultores",
    navJury: "Para el jurado",
    goMap: "Ir a mi mapa",
    exit: "Salir",
    signIn: "Iniciar sesión",
    badge: "NASA Space Apps 2026 · Reto Field Shift",
    title: "Decide qué sembrar después, con datos de la NASA y tu criterio.",
    lead: "Marca tu terreno en el mapa y compara rotaciones de cultivo para cuidar el suelo y enfrentar mejor el clima. Cada recomendación muestra su evidencia, sus vacíos y sus riesgos.",
    openMap: "Abrir mi mapa",
    enter: "Entrar y marcar mi terreno",
    demo: "Ver la demo sin cuenta",
    guestName: "Visitante",
    how: "Cómo funciona →",
    stats: ["Fuentes verificadas", "Rotaciones por terreno", "Zonas de demostración"],
    farmersLead: "Tres pasos, en lenguaje sencillo y con unidades de EE. UU. (acres, bushels, dólares por acre).",
    steps: [
      {
        title: "Marca tu terreno",
        text: "Busca tu pueblo o haz clic sobre tu campo en el mapa satelital. ORCHID toma el clima y el suelo de ese punto.",
      },
      {
        title: "Compara rotaciones",
        text: "Ves la mejor rotación para tu terreno, otras alternativas y lo que pasa si sigues igual. Cada una explica por qué se sugiere, qué ventajas trae y qué riesgos tiene.",
      },
      {
        title: "Decide tú",
        text: "Pon tus precios y tus costos. La herramienta muestra lo que sabe y lo que no sabe; la decisión final es tuya.",
      },
    ],
    juryLead: "Cómo responde ORCHID al reto «Adapting Farms with NASA Data». Lo que no está conectado se marca como pendiente.",
    team: ["Equipo: ", ", participante en el NASA Space Apps Challenge 2026."],
    requirements: [
      "Compara al menos tres estrategias de rotación, incluida la actual.",
      "Para cada una: por qué se sugiere, qué evidencia la respalda, beneficios, vacíos de información y riesgos.",
      "Usa datos reales de la NASA, el USDA, la FAO y una red de pluviómetros voluntarios. Lo que aún no está conectado aparece como pendiente, nunca como si ya existiera.",
      "Apoya el criterio del agricultor: no lo reemplaza.",
    ],
    sourcesTitle: "Fuentes de datos",
    sourcesLead: "24 fuentes documentadas en el repositorio; estas son las principales.",
    status: { on: "Conectado", off: "Pendiente" },
    sources: [
      { name: "NASA POWER", status: "on", use: "Lluvia, temperatura y humedad del suelo de tu punto, por día y por mes." },
      { name: "MODIS · NDVI (NASA)", status: "on", use: "Qué tan verde se ve tu campo desde el satélite, cada 16 días." },
      { name: "SSURGO (USDA)", status: "on", use: "Tipo de suelo, drenaje y cuánta agua guarda." },
      { name: "CDL (USDA)", status: "on", use: "Qué se siembra alrededor de tu terreno, de 2021 a 2025." },
      { name: "SMAP (NASA)", status: "on", use: "Humedad de la superficie del suelo medida por satélite en las últimas semanas." },
      { name: "GPM IMERG (NASA)", status: "on", use: "Lluvia diaria por satélite de los últimos 30 días." },
      { name: "NLDAS-2 (NASA)", status: "on", use: "Cuánta agua guarda tu suelo frente a lo normal, mes a mes." },
      { name: "SRTM (NASA)", status: "on", use: "Altura y pendiente de tu terreno, para el riesgo de erosión." },
      { name: "QuickStats (USDA)", status: "on", use: "Precio promedio de tu estado, con tu propia clave gratuita." },
      { name: "GAEZ (FAO)", status: "on", use: "Qué cultivos se dan bien en tu zona y cuánto pueden rendir." },
      { name: "CoCoRaHS (voluntarios, NOAA)", status: "on", use: "Lluvia medida por pluviómetros de tus vecinos." },
    ] as Source[],
    closeTitle: "Empieza con un solo campo.",
    closeText: "Marca el lugar donde siembras y revisa qué te sugiere la herramienta. Tú decides qué cambia.",
    footer: "Apoya tu criterio; no lo reemplaza.",
  },
  en: {
    navFarmers: "For farmers",
    navJury: "For the judges",
    goMap: "Go to my map",
    exit: "Sign out",
    signIn: "Sign in",
    badge: "NASA Space Apps 2026 · Field Shift challenge",
    title: "Decide what to plant next, with NASA data and your own judgment.",
    lead: "Mark your field on the map and compare crop rotations to protect your soil and handle the weather better. Every recommendation shows its evidence, its gaps and its risks.",
    openMap: "Open my map",
    enter: "Sign in and mark my field",
    demo: "Try the demo without an account",
    guestName: "Guest",
    how: "How it works →",
    stats: ["Verified sources", "Rotations per field", "Demo areas"],
    farmersLead: "Three steps, in plain language and U.S. units (acres, bushels, dollars per acre).",
    steps: [
      {
        title: "Mark your field",
        text: "Search for your town or click on your field on the satellite map. ORCHID pulls the climate and soil for that spot.",
      },
      {
        title: "Compare rotations",
        text: "See the best rotation for your field, other options, and what happens if you keep doing the same. Each one explains why it's suggested, what it brings and what risks it carries.",
      },
      {
        title: "You decide",
        text: "Enter your prices and costs. The tool shows what it knows and what it doesn't; the final call is yours.",
      },
    ],
    juryLead: "How ORCHID answers the “Adapting Farms with NASA Data” challenge. Anything not connected yet is marked as pending.",
    team: ["Team: ", ", taking part in the NASA Space Apps Challenge 2026."],
    requirements: [
      "Compares at least three rotation strategies, including the current one.",
      "For each one: why it's suggested, what evidence backs it, benefits, information gaps and risks.",
      "Uses real data from NASA, USDA, FAO and a volunteer rain-gauge network. Anything not connected yet shows as pending, never as if it already existed.",
      "Supports the farmer's judgment: it doesn't replace it.",
    ],
    sourcesTitle: "Data sources",
    sourcesLead: "24 sources documented in the repository; these are the main ones.",
    status: { on: "Connected", off: "Pending" },
    sources: [
      { name: "NASA POWER", status: "on", use: "Rain, temperature and soil moisture at your spot, by day and by month." },
      { name: "MODIS · NDVI (NASA)", status: "on", use: "How green your field looks from the satellite, every 16 days." },
      { name: "SSURGO (USDA)", status: "on", use: "Soil type, drainage and how much water it holds." },
      { name: "CDL (USDA)", status: "on", use: "What's planted around your field, 2021 to 2025." },
      { name: "SMAP (NASA)", status: "on", use: "Surface soil moisture measured by satellite over the last few weeks." },
      { name: "GPM IMERG (NASA)", status: "on", use: "Daily satellite rainfall for the last 30 days." },
      { name: "NLDAS-2 (NASA)", status: "on", use: "How much water your soil holds compared with normal, month by month." },
      { name: "SRTM (NASA)", status: "on", use: "Elevation and slope of your field, for erosion risk." },
      { name: "QuickStats (USDA)", status: "on", use: "Your state's average price, with your own free key." },
      { name: "GAEZ (FAO)", status: "on", use: "Which crops do well in your area and how much they can yield." },
      { name: "CoCoRaHS (volunteers, NOAA)", status: "on", use: "Rain measured by your neighbors' rain gauges." },
    ] as Source[],
    closeTitle: "Start with a single field.",
    closeText: "Mark where you plant and see what the tool suggests. You decide what changes.",
    footer: "It supports your judgment; it doesn't replace it.",
  },
};

// Contenedor de la página: ancho, con margen lateral que crece con la pantalla, y todo alineado a la izquierda.
const WRAP = "mx-auto w-full max-w-[120rem] px-6 sm:px-10 lg:px-16";

export default function Home() {
  const session = useSession();
  const router = useRouter();
  const lang = useLang();
  const c = COPY[lang];

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className={`relative z-20 flex items-center justify-between py-5 ${WRAP}`}>
        <Link href="/" className="flex items-center gap-3" aria-label={`ORCHID, ${FULL_NAME}`}>
          <OrchidMark size={40} />
          <span className="leading-none">
            <span className="block font-serif text-2xl font-semibold tracking-wide">ORCHID</span>
            <span className="mt-1 hidden text-xs text-ink-soft lg:block">{FULL_NAME}</span>
          </span>
        </Link>
        <nav className="flex items-center gap-2 text-sm sm:gap-4">
          <a href="#agricultores" className="hidden px-2 text-ink-soft hover:text-ink sm:inline">
            {c.navFarmers}
          </a>
          <a href="#jurado" className="hidden px-2 text-ink-soft hover:text-ink sm:inline">
            {c.navJury}
          </a>
          <LangToggle />
          {session ? (
            <>
              <Link href="/mapa" className="rounded-md bg-moss px-4 py-2 font-semibold text-paper hover:bg-moss-deep">
                {c.goMap}
              </Link>
              <button
                type="button"
                onClick={() => {
                  endSession();
                }}
                className="rounded-md border border-field px-3 py-2 text-ink-soft hover:border-moss hover:text-ink"
              >
                {c.exit}
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-md border border-moss px-4 py-2 font-semibold text-moss hover:bg-moss hover:text-paper"
            >
              {c.signIn}
            </Link>
          )}
        </nav>
      </header>

      {/* Portada */}
      <ParallaxHero>
        <div className={`pb-24 pt-6 ${WRAP}`}>
          <div className="max-w-3xl">
            <p className="fs-rise mb-5 inline-flex items-center gap-2 rounded-full border border-rule bg-paper/80 px-3 py-1 text-sm text-ink-soft backdrop-blur">
              <span className="size-2 rounded-full bg-moss" aria-hidden="true" />
              {c.badge}
            </p>
            <h1 className="fs-rise font-serif text-4xl font-semibold leading-[1.05] tracking-tight [animation-delay:80ms] sm:text-5xl lg:text-6xl">
              {c.title}
            </h1>
            <p className="fs-rise mt-6 max-w-prose text-lg leading-relaxed text-ink-soft [animation-delay:160ms]">{c.lead}</p>
            <div className="fs-rise mt-9 flex flex-wrap items-center gap-4 [animation-delay:240ms]">
              <Link
                href={session ? "/mapa" : "/login"}
                className="rounded-md bg-moss px-7 py-3.5 text-lg font-semibold text-paper shadow-[0_10px_30px_-10px_rgb(63_107_58/0.8)] transition hover:-translate-y-0.5 hover:bg-moss-deep"
              >
                {session ? c.openMap : c.enter}
              </Link>
              {!session && (
                <button
                  type="button"
                  onClick={() => {
                    startSession("demo@orchid.local", c.guestName);
                    router.push("/mapa");
                  }}
                  className="rounded-md border border-moss px-6 py-3.5 font-semibold text-moss hover:bg-moss hover:text-paper"
                >
                  {c.demo}
                </button>
              )}
              <a href="#agricultores" className="font-semibold text-moss underline-offset-4 hover:underline">
                {c.how}
              </a>
            </div>
            <dl className="fs-rise mt-8 grid sm:mt-12 max-w-md grid-cols-3 gap-4 border-t border-rule pt-6 [animation-delay:320ms]">
              {["24", "3+", "2"].map((v, i) => (
                <div key={v}>
                  <dt className="text-sm text-ink-soft">{c.stats[i]}</dt>
                  <dd className="font-serif text-3xl font-semibold text-moss">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </ParallaxHero>

      {/* Agricultores */}
      <section id="agricultores" className={`py-20 ${WRAP}`}>
        <div className="max-w-2xl">
          <h2 className="font-serif text-4xl font-semibold tracking-tight">{c.navFarmers}</h2>
          <p className="mt-4 text-lg text-ink-soft">{c.farmersLead}</p>
        </div>
        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {c.steps.map((s, i) => (
            <li key={i} className="rounded-xl border border-rule bg-paper-deep/60 p-7 transition hover:border-moss">
              <span className="flex size-10 items-center justify-center rounded-full bg-moss font-semibold text-paper">{i + 1}</span>
              <h3 className="mt-6 font-serif text-2xl font-semibold">{s.title}</h3>
              <p className="mt-3 leading-relaxed text-ink-soft">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Jurado */}
      <section id="jurado" className="bg-moss-deep text-paper">
        <div className={`grid gap-14 py-20 lg:grid-cols-2 ${WRAP}`}>
          <div>
            <h2 className="font-serif text-4xl font-semibold tracking-tight">{c.navJury}</h2>
            <p className="mt-4 text-lg text-paper/80">{c.juryLead}</p>
            <p className="mt-3 text-base text-paper/80">
              {c.team[0]}
              <strong className="font-semibold text-paper">Orbital Farmers</strong>
              {c.team[1]}
            </p>
            <p className="mt-3 text-base text-paper/80">
              <strong className="font-semibold text-paper">ORCHID</strong> = {FULL_NAME}.
            </p>
            <ul className="mt-8 space-y-4">
              {c.requirements.map((r) => (
                <li key={r} className="flex gap-3 leading-relaxed">
                  <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-paper" aria-hidden="true" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-serif text-2xl font-semibold">{c.sourcesTitle}</h3>
            <p className="mt-2 text-sm text-paper/70">{c.sourcesLead}</p>
            <ul className="mt-6 divide-y divide-paper/15 rounded-xl border border-paper/15">
              {c.sources.map((s) => (
                <li key={s.name} className="flex items-start justify-between gap-4 p-5">
                  <div>
                    <p className="font-semibold">{s.name}</p>
                    <p className="mt-1 text-sm text-paper/70">{s.use}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                      s.status === "on" ? "bg-paper text-moss-deep" : "border border-paper/40 text-paper/80"
                    }`}
                  >
                    {c.status[s.status]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Cierre */}
      <section className={`py-20 ${WRAP}`}>
        <h2 className="font-serif text-4xl font-semibold tracking-tight">{c.closeTitle}</h2>
        <p className="mt-4 max-w-prose text-lg text-ink-soft">{c.closeText}</p>
        <Link
          href={session ? "/mapa" : "/login"}
          className="mt-8 inline-block rounded-md bg-moss px-8 py-4 text-lg font-semibold text-paper hover:bg-moss-deep"
        >
          {session ? c.openMap : c.signIn}
        </Link>
      </section>

      <footer className="border-t border-rule">
        <div className={`flex flex-col gap-3 py-8 text-sm text-ink-soft sm:flex-row sm:items-center sm:justify-between ${WRAP}`}>
          <span className="flex items-center gap-2.5">
            <OrchidMark size={24} />
            <span>
              <span className="font-semibold text-ink">ORCHID</span> ({FULL_NAME}) · {CREDIT[lang]}.
            </span>
          </span>
          <span>{c.footer}</span>
        </div>
      </footer>
    </div>
  );
}
