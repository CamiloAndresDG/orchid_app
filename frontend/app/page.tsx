"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ParallaxHero } from "./hero-video";
import { endSession, startSession, useSession } from "./auth";

const FARMER_STEPS = [
  {
    n: "1",
    title: "Marca tu terreno",
    text: "Busca tu pueblo o haz clic sobre tu campo en el mapa satelital. Field Shift toma el clima y el suelo de ese punto.",
  },
  {
    n: "2",
    title: "Compara rotaciones",
    text: "Ves la mejor rotación para tu terreno, otras alternativas y lo que pasa si sigues igual. Cada una explica por qué se sugiere, qué ventajas trae y qué riesgos tiene.",
  },
  {
    n: "3",
    title: "Decide tú",
    text: "Pon tus precios y tus costos. La herramienta muestra lo que sabe y lo que no sabe; la decisión final es tuya.",
  },
];

const REQUIREMENTS = [
  "Compara al menos tres estrategias de rotación, incluida la actual.",
  "Para cada una: por qué se sugiere, qué evidencia la respalda, beneficios, vacíos de información y riesgos.",
  "Usa datos reales de la NASA, el USDA y el Censo de EE. UU. Lo que aún no está conectado aparece como pendiente, nunca como si ya existiera.",
  "Apoya el criterio del agricultor: no lo reemplaza.",
];

const SOURCES: { name: string; status: "Conectado" | "Pendiente"; use: string }[] = [
  { name: "NASA POWER", status: "Conectado", use: "Lluvia, temperatura y humedad del suelo de tu punto, por día y por mes." },
  { name: "MODIS · NDVI (NASA)", status: "Conectado", use: "Qué tan verde se ve tu campo desde el satélite, cada 16 días." },
  { name: "SSURGO (USDA)", status: "Conectado", use: "Tipo de suelo, drenaje y cuánta agua guarda." },
  { name: "CDL (USDA)", status: "Conectado", use: "Qué se siembra alrededor de tu terreno, de 2021 a 2025." },
  { name: "QuickStats (USDA)", status: "Conectado", use: "Precio promedio de tu estado, con tu propia clave gratuita." },
  { name: "SMAP (NASA)", status: "Pendiente", use: "Humedad del suelo medida por satélite. Pide cuenta de NASA Earthdata." },
  { name: "IMERG (NASA)", status: "Pendiente", use: "Lluvia por satélite cada media hora. Pide cuenta de NASA Earthdata." },
];

export default function Home() {
  const session = useSession();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="font-serif text-2xl font-semibold tracking-tight">
          Field Shift
        </Link>
        <nav className="flex items-center gap-2 text-sm sm:gap-4">
          <a href="#agricultores" className="hidden px-2 text-ink-soft hover:text-ink sm:inline">
            Para agricultores
          </a>
          <a href="#jurado" className="hidden px-2 text-ink-soft hover:text-ink sm:inline">
            Para el jurado
          </a>
          {session ? (
            <>
              <Link href="/mapa" className="rounded-md bg-moss px-4 py-2 font-semibold text-paper hover:bg-moss-deep">
                Ir a mi mapa
              </Link>
              <button
                type="button"
                onClick={() => {
                  endSession();
                }}
                className="rounded-md border border-field px-3 py-2 text-ink-soft hover:border-moss hover:text-ink"
              >
                Salir
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-md border border-moss px-4 py-2 font-semibold text-moss hover:bg-moss hover:text-paper"
            >
              Iniciar sesión
            </Link>
          )}
        </nav>
      </header>

      {/* Portada */}
      <ParallaxHero>
        <div className="mx-auto max-w-6xl px-6 pb-24 pt-6">
          <div className="max-w-3xl">
            <p className="fs-rise mb-5 inline-flex items-center gap-2 rounded-full border border-rule bg-paper/80 px-3 py-1 text-sm text-ink-soft backdrop-blur">
              <span className="size-2 rounded-full bg-moss" aria-hidden="true" />
              NASA Space Apps 2026 · Reto Field Shift
            </p>
            <h1 className="fs-rise font-serif text-4xl font-semibold leading-[1.05] tracking-tight [animation-delay:80ms] sm:text-5xl lg:text-6xl">
              Decide qué sembrar después, con datos de la NASA y tu criterio.
            </h1>
            <p className="fs-rise mt-6 max-w-prose text-lg leading-relaxed text-ink-soft [animation-delay:160ms]">
              Marca tu terreno en el mapa y compara rotaciones de cultivo para cuidar el suelo y enfrentar mejor el clima.
              Cada recomendación muestra su evidencia, sus vacíos y sus riesgos.
            </p>
            <div className="fs-rise mt-9 flex flex-wrap items-center gap-4 [animation-delay:240ms]">
              <Link
                href={session ? "/mapa" : "/login"}
                className="rounded-md bg-moss px-7 py-3.5 text-lg font-semibold text-paper shadow-[0_10px_30px_-10px_rgb(63_107_58/0.8)] transition hover:-translate-y-0.5 hover:bg-moss-deep"
              >
                {session ? "Abrir mi mapa" : "Entrar y marcar mi terreno"}
              </Link>
              {!session && (
                <button
                  type="button"
                  onClick={() => {
                    startSession("demo@fieldshift.local", "Visitante");
                    router.push("/mapa");
                  }}
                  className="rounded-md border border-moss px-6 py-3.5 font-semibold text-moss hover:bg-moss hover:text-paper"
                >
                  Ver la demo sin cuenta
                </button>
              )}
              <a href="#agricultores" className="font-semibold text-moss underline-offset-4 hover:underline">
                Cómo funciona →
              </a>
            </div>
            <dl className="fs-rise mt-8 grid sm:mt-12 max-w-md grid-cols-3 gap-4 border-t border-rule pt-6 [animation-delay:320ms]">
              <div>
                <dt className="text-sm text-ink-soft">Fuentes verificadas</dt>
                <dd className="font-serif text-3xl font-semibold text-moss">24</dd>
              </div>
              <div>
                <dt className="text-sm text-ink-soft">Rotaciones por terreno</dt>
                <dd className="font-serif text-3xl font-semibold text-moss">3+</dd>
              </div>
              <div>
                <dt className="text-sm text-ink-soft">Zonas de demostración</dt>
                <dd className="font-serif text-3xl font-semibold text-moss">2</dd>
              </div>
            </dl>
          </div>
        </div>
      </ParallaxHero>

      {/* Agricultores */}
      <section id="agricultores" className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-2xl">
          <h2 className="font-serif text-4xl font-semibold tracking-tight">Para agricultores</h2>
          <p className="mt-4 text-lg text-ink-soft">
            Tres pasos, en lenguaje sencillo y con unidades de EE. UU. (acres, bushels, dólares por acre).
          </p>
        </div>
        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {FARMER_STEPS.map((s) => (
            <li key={s.n} className="rounded-xl border border-rule bg-paper-deep/60 p-7 transition hover:border-moss">
              <span className="flex size-10 items-center justify-center rounded-full bg-moss font-semibold text-paper">
                {s.n}
              </span>
              <h3 className="mt-6 font-serif text-2xl font-semibold">{s.title}</h3>
              <p className="mt-3 leading-relaxed text-ink-soft">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Jurado */}
      <section id="jurado" className="bg-moss-deep text-paper">
        <div className="mx-auto grid max-w-6xl gap-14 px-6 py-20 lg:grid-cols-2">
          <div>
            <h2 className="font-serif text-4xl font-semibold tracking-tight">Para el jurado</h2>
            <p className="mt-4 text-lg text-paper/80">
              Cómo responde Field Shift al reto «Adapting Farms with NASA Data». Lo que no está conectado se marca como pendiente.
            </p>
            <ul className="mt-8 space-y-4">
              {REQUIREMENTS.map((r) => (
                <li key={r} className="flex gap-3 leading-relaxed">
                  <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-paper" aria-hidden="true" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-serif text-2xl font-semibold">Fuentes de datos</h3>
            <p className="mt-2 text-sm text-paper/70">24 fuentes documentadas en el repositorio; estas son las principales.</p>
            <ul className="mt-6 divide-y divide-paper/15 rounded-xl border border-paper/15">
              {SOURCES.map((s) => (
                <li key={s.name} className="flex items-start justify-between gap-4 p-5">
                  <div>
                    <p className="font-semibold">{s.name}</p>
                    <p className="mt-1 text-sm text-paper/70">{s.use}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                      s.status === "Conectado" ? "bg-paper text-moss-deep" : "border border-paper/40 text-paper/80"
                    }`}
                  >
                    {s.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Cierre */}
      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <h2 className="font-serif text-4xl font-semibold tracking-tight">Empieza con un solo campo.</h2>
        <p className="mx-auto mt-4 max-w-prose text-lg text-ink-soft">
          Marca el lugar donde siembras y revisa qué te sugiere la herramienta. Tú decides qué cambia.
        </p>
        <Link
          href={session ? "/mapa" : "/login"}
          className="mt-8 inline-block rounded-md bg-moss px-8 py-4 text-lg font-semibold text-paper hover:bg-moss-deep"
        >
          {session ? "Abrir mi mapa" : "Iniciar sesión"}
        </Link>
      </section>

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 text-sm text-ink-soft sm:flex-row sm:justify-between">
          <span>Field Shift · NASA Space Apps Challenge 2026</span>
          <span>Apoya tu criterio; no lo reemplaza.</span>
        </div>
      </footer>
    </div>
  );
}
