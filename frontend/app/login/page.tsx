"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { InteractiveField } from "../interactive-field";
import { login, register, startSession, useSession } from "../auth";
import { CREDIT, FULL_NAME, OrchidMark } from "../logo";
import { useLang } from "../i18n";
import { LangToggle } from "../lang-toggle";

const COPY = {
  es: {
    badMail: "Escribe un correo válido.",
    noName: "Escribe tu nombre para crear la cuenta.",
    shortPw: "La contraseña debe tener al menos 8 caracteres.",
    noPw: "Escribe tu contraseña.",
    access: "Acceso",
    signIn: "Iniciar sesión",
    signUp: "Crear cuenta",
    welcome: "Bienvenido de vuelta",
    create: "Crea tu cuenta",
    welcomeText: "Entra para abrir tu cuaderno de campo.",
    createText: "Empieza a guardar tus terrenos y precios.",
    name: "Nombre",
    namePh: "Ej.: Ana Pérez",
    mail: "Correo",
    mailPh: "tu@correo.com",
    pw: "Contraseña",
    pwNew: "Mínimo 8 caracteres",
    pwOld: "Tu contraseña",
    entering: "Entrando…",
    creating: "Creando tu cuenta…",
    enter: "Entrar",
    createEnter: "Crear cuenta y entrar",
    guest: "Entrar como visitante (demo)",
    guestName: "Visitante",
    note: "Con cuenta, tu terreno y tus precios se guardan en el servidor y los ves desde cualquier computadora. El modo visitante guarda todo solo en este navegador; si después creas una cuenta, lo que hayas cargado se pasa a ella.",
    back: "← Volver al inicio",
  },
  en: {
    badMail: "Enter a valid email.",
    noName: "Enter your name to create the account.",
    shortPw: "The password must be at least 8 characters.",
    noPw: "Enter your password.",
    access: "Access",
    signIn: "Sign in",
    signUp: "Create account",
    welcome: "Welcome back",
    create: "Create your account",
    welcomeText: "Sign in to open your field notebook.",
    createText: "Start saving your fields and prices.",
    name: "Name",
    namePh: "E.g. Ann Parker",
    mail: "Email",
    mailPh: "you@email.com",
    pw: "Password",
    pwNew: "At least 8 characters",
    pwOld: "Your password",
    entering: "Signing in…",
    creating: "Creating your account…",
    enter: "Sign in",
    createEnter: "Create account and sign in",
    guest: "Continue as a guest (demo)",
    guestName: "Guest",
    note: "With an account, your field and prices are saved on the server and you can see them from any computer. Guest mode keeps everything in this browser only; if you create an account later, what you entered moves to it.",
    back: "← Back to home",
  },
};

export default function LoginPage() {
  const router = useRouter();
  const session = useSession();
  const lang = useLang();
  const c = COPY[lang];
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) router.replace("/mapa");
  }, [session, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const mail = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(mail)) {
      setError(c.badMail);
      return;
    }
    if (mode === "up" && name.trim().length < 2) {
      setError(c.noName);
      return;
    }
    if (mode === "up" && password.length < 8) {
      setError(c.shortPw);
      return;
    }
    if (!password) {
      setError(c.noPw);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "up") await register(name.trim(), mail, password);
      else await login(mail, password);
      router.push("/mapa");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-md border border-field bg-paper px-4 py-3 text-base text-ink placeholder:text-ink-soft focus:border-moss";

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-paper px-5 pb-32 pt-12">
      <InteractiveField />
      <LangToggle className="absolute right-5 top-5 z-20 bg-paper/90 backdrop-blur" />
      <div className="relative z-10 w-full max-w-md">
        <Link href="/" className="mb-8 flex flex-col items-center gap-2 text-ink" aria-label={`ORCHID, ${FULL_NAME}`}>
          <span className="flex items-center gap-3 font-serif text-3xl font-semibold tracking-wide">
            <OrchidMark size={44} />
            ORCHID
          </span>
          <span className="rounded-full bg-paper/85 px-3 py-0.5 text-center text-xs text-ink-soft backdrop-blur-sm">{FULL_NAME}</span>
        </Link>

        <div className="fs-rise rounded-xl border border-rule bg-paper/90 p-7 shadow-[0_24px_60px_-30px_rgb(35_48_31/0.45)] backdrop-blur sm:p-9">
          <div role="tablist" aria-label={c.access} className="mb-7 grid grid-cols-2 rounded-full border border-rule p-1">
            {(
              [
                ["in", c.signIn],
                ["up", c.signUp],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={mode === id}
                type="button"
                onClick={() => {
                  setMode(id);
                  setError(null);
                }}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  mode === id ? "bg-moss text-paper" : "text-ink-soft hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <h1 className="font-serif text-3xl font-semibold">
            {mode === "in" ? c.welcome : c.create}
          </h1>
          <p className="mt-2 text-ink-soft">
            {mode === "in" ? c.welcomeText : c.createText}
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
            {mode === "up" && (
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold">{c.name}</span>
                <input
                  className={field}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  placeholder={c.namePh}
                />
              </label>
            )}
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">{c.mail}</span>
              <input
                className={field}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder={c.mailPh}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">{c.pw}</span>
              <input
                className={field}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "in" ? "current-password" : "new-password"}
                placeholder={mode === "up" ? c.pwNew : c.pwOld}
              />
            </label>

            {error && (
              <p role="alert" className="rounded-md bg-paper-deep px-4 py-3 text-sm text-clay">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-moss px-5 py-3.5 text-lg font-semibold text-paper transition hover:bg-moss-deep disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? (mode === "in" ? c.entering : c.creating) : mode === "in" ? c.enter : c.createEnter}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              startSession("demo@orchid.local", c.guestName);
              router.push("/mapa");
            }}
            className="mt-5 w-full rounded-md border border-moss px-5 py-3 font-semibold text-moss hover:bg-moss hover:text-paper"
          >
            {c.guest}
          </button>

          <p className="mt-6 border-t border-rule pt-5 text-sm leading-relaxed text-ink-soft">
            {c.note}
          </p>
        </div>

        <p className="mt-6 text-center text-sm">
          <Link href="/" className="text-ink-soft underline-offset-4 hover:text-ink hover:underline">
            {c.back}
          </Link>
        </p>
        <p className="mt-3 text-center">
          <span className="inline-block rounded-full bg-paper/90 px-3 py-1 text-xs text-ink-soft backdrop-blur-sm">{CREDIT[lang]}.</span>
        </p>
      </div>
    </main>
  );
}
