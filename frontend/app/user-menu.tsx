"use client";

import { useEffect, useRef, useState } from "react";
import type { Session } from "./auth";
import { MoonIcon, SunIcon } from "./icons";

// Ajustes de usuario: botón con las iniciales, arriba a la derecha sobre el mapa.

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

export function UserMenu({
  session,
  theme,
  onToggleTheme,
  onPrices,
  onLogout,
}: {
  session: Session;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onPrices: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const guest = !session.token;

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function onMenuKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  }

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  const item = "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-base text-ink hover:bg-paper-deep focus-visible:bg-paper-deep";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Tu cuenta y ajustes"
        className="grid size-11 place-items-center rounded-full border-2 border-paper bg-moss font-semibold text-paper shadow-[0_4px_12px_rgb(0_0_0/0.3)] hover:bg-moss-deep"
      >
        {initials(session.name)}
        <span className="sr-only">Abrir los ajustes de tu cuenta</span>
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Tu cuenta"
          onKeyDown={onMenuKey}
          className="absolute right-0 top-[calc(100%+0.5rem)] w-72 rounded-lg border border-rule bg-paper p-2 text-ink shadow-[0_10px_30px_-6px_rgb(0_0_0/0.35)]"
        >
          <div className="px-3 pb-3 pt-2">
            <p className="font-serif text-lg font-semibold leading-tight">{session.name}</p>
            <p className="truncate text-sm text-ink-soft">{guest ? "Modo visitante: se guarda solo en este navegador" : session.email}</p>
          </div>
          <div className="border-t border-rule pt-2">
            <button role="menuitem" tabIndex={-1} className={item} onClick={run(onPrices)}>
              <CoinIcon /> Mis precios y costos
            </button>
            <button role="menuitem" tabIndex={-1} className={item} onClick={run(onToggleTheme)}>
              {theme === "dark" ? <SunIcon /> : <MoonIcon />} {theme === "dark" ? "Modo claro" : "Modo oscuro"}
            </button>
          </div>
          <div className="mt-2 border-t border-rule pt-2">
            <button role="menuitem" tabIndex={-1} className={item} onClick={run(onLogout)}>
              <DoorIcon /> {guest ? "Salir del modo visitante" : "Cerrar sesión"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const svg = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};
const CoinIcon = () => (
  <svg {...svg}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M14.5 9.2c-.5-.9-1.5-1.4-2.6-1.4-1.5 0-2.6.8-2.6 2s1.1 1.7 2.6 2 2.8.8 2.8 2.1-1.2 2.1-2.8 2.1c-1.2 0-2.2-.5-2.7-1.4M12 6.5v1.3M12 16.6v1" />
  </svg>
);
const DoorIcon = () => (
  <svg {...svg}>
    <path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14M10 8l-4 4 4 4M6 12h10" />
  </svg>
);
