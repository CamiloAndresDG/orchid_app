"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { InteractiveField } from "../interactive-field";
import { login, register, startSession, useSession } from "../auth";

export default function LoginPage() {
  const router = useRouter();
  const session = useSession();
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
      setError("Escribe un correo válido.");
      return;
    }
    if (mode === "up" && name.trim().length < 2) {
      setError("Escribe tu nombre para crear la cuenta.");
      return;
    }
    if (mode === "up" && password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (!password) {
      setError("Escribe tu contraseña.");
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
      <div className="relative z-10 w-full max-w-md">
        <Link href="/" className="mb-8 block text-center font-serif text-3xl font-semibold tracking-tight text-ink">
          Orchid
        </Link>

        <div className="fs-rise rounded-xl border border-rule bg-paper/90 p-7 shadow-[0_24px_60px_-30px_rgb(35_48_31/0.45)] backdrop-blur sm:p-9">
          <div role="tablist" aria-label="Acceso" className="mb-7 grid grid-cols-2 rounded-full border border-rule p-1">
            {(
              [
                ["in", "Iniciar sesión"],
                ["up", "Crear cuenta"],
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
            {mode === "in" ? "Bienvenido de vuelta" : "Crea tu cuenta"}
          </h1>
          <p className="mt-2 text-ink-soft">
            {mode === "in" ? "Entra para abrir tu cuaderno de campo." : "Empieza a guardar tus terrenos y precios."}
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
            {mode === "up" && (
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold">Nombre</span>
                <input
                  className={field}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  placeholder="Ej.: Ana Pérez"
                />
              </label>
            )}
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">Correo</span>
              <input
                className={field}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="tu@correo.com"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">Contraseña</span>
              <input
                className={field}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "in" ? "current-password" : "new-password"}
                placeholder={mode === "up" ? "Mínimo 8 caracteres" : "Tu contraseña"}
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
              {busy ? (mode === "in" ? "Entrando…" : "Creando tu cuenta…") : mode === "in" ? "Entrar" : "Crear cuenta y entrar"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              startSession("demo@orchid.local", "Visitante");
              router.push("/mapa");
            }}
            className="mt-5 w-full rounded-md border border-moss px-5 py-3 font-semibold text-moss hover:bg-moss hover:text-paper"
          >
            Entrar como visitante (demo)
          </button>

          <p className="mt-6 border-t border-rule pt-5 text-sm leading-relaxed text-ink-soft">
            Con cuenta, tu terreno y tus precios se guardan en el servidor y los ves desde cualquier computadora. El modo
            visitante guarda todo solo en este navegador; si después creas una cuenta, lo que hayas cargado se pasa a ella.
          </p>
        </div>

        <p className="mt-6 text-center text-sm">
          <Link href="/" className="text-ink-soft underline-offset-4 hover:text-ink hover:underline">
            ← Volver al inicio
          </Link>
        </p>
      </div>
    </main>
  );
}
