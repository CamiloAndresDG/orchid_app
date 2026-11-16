"use client";

import { useEffect, useRef, useState } from "react";
import type { Session } from "./auth";
import { MoonIcon, SunIcon } from "./icons";
import { Lang, setLang, useLang } from "./i18n";
import { ThemePref, setThemePref, useThemePref } from "./theme";

const COPY = {
  es: {
    title: "Tu cuenta y ajustes",
    open: "Abrir los ajustes de tu cuenta",
    menu: "Tu cuenta",
    guest: "Modo visitante: se guarda solo en este navegador",
    prices: "Mis precios y costos",
    language: "Idioma",
    theme: "Tema",
    themes: { system: "Sistema", light: "Claro", dark: "Oscuro" } as Record<ThemePref, string>,
    leaveGuest: "Salir del modo visitante",
    logout: "Cerrar sesión",
  },
  en: {
    title: "Your account and settings",
    open: "Open your account settings",
    menu: "Your account",
    guest: "Guest mode: saved only in this browser",
    prices: "My prices and costs",
    language: "Language",
    theme: "Theme",
    themes: { system: "System", light: "Light", dark: "Dark" } as Record<ThemePref, string>,
    leaveGuest: "Leave guest mode",
    logout: "Sign out",
  },
};

const LANGS: { id: Lang; name: string }[] = [
  { id: "es", name: "Español" },
  { id: "en", name: "English" },
];
const THEMES: ThemePref[] = ["system", "light", "dark"];
const ITEMS = "[role=menuitem],[role=menuitemradio]";

// User settings: a button with the initials, top right over the map.

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

export function UserMenu({
  session,
  onPrices,
  onLogout,
}: {
  session: Session;
  onPrices: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const guest = !session.token;
  const lang = useLang();
  const pref = useThemePref();
  const c = COPY[lang];

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>(ITEMS)?.focus();
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
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  }

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  const seg = (on: boolean) =>
    `flex-1 rounded px-2 py-1.5 text-sm font-semibold transition ${on ? "bg-moss text-paper" : "text-ink-soft hover:bg-paper-deep hover:text-ink"}`;
  const item = "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-base text-ink hover:bg-paper-deep focus-visible:bg-paper-deep";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={c.title}
        className="grid size-11 place-items-center rounded-full border-2 border-paper bg-moss font-semibold text-paper shadow-[0_4px_12px_rgb(0_0_0/0.3)] hover:bg-moss-deep"
      >
        {initials(session.name)}
        <span className="sr-only">{c.open}</span>
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={c.menu}
          onKeyDown={onMenuKey}
          className="absolute right-0 top-[calc(100%+0.5rem)] w-72 rounded-lg border border-rule bg-paper p-2 text-ink shadow-[0_10px_30px_-6px_rgb(0_0_0/0.35)]"
        >
          <div className="px-3 pb-3 pt-2">
            <p className="font-serif text-lg font-semibold leading-tight">{session.name}</p>
            <p className="truncate text-sm text-ink-soft">{guest ? c.guest : session.email}</p>
          </div>
          <div className="border-t border-rule pt-2">
            <button role="menuitem" tabIndex={-1} className={item} onClick={run(onPrices)}>
              <CoinIcon /> {c.prices}
            </button>
          </div>
          <div className="mt-2 space-y-3 border-t border-rule px-3 pb-1 pt-3">
            <div role="group" aria-label={c.language}>
              <p className="mb-1.5 flex items-center gap-2 text-sm text-ink-soft">
                <GlobeIcon /> {c.language}
              </p>
              <div className="flex gap-1 rounded-md border border-rule p-0.5">
                {LANGS.map((l) => (
                  <button
                    key={l.id}
                    role="menuitemradio"
                    aria-checked={lang === l.id}
                    tabIndex={-1}
                    lang={l.id}
                    className={seg(lang === l.id)}
                    onClick={() => setLang(l.id)}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
            </div>
            <div role="group" aria-label={c.theme}>
              <p className="mb-1.5 flex items-center gap-2 text-sm text-ink-soft">
                {pref === "light" ? <SunIcon /> : <MoonIcon />} {c.theme}
              </p>
              <div className="flex gap-1 rounded-md border border-rule p-0.5">
                {THEMES.map((t) => (
                  <button
                    key={t}
                    role="menuitemradio"
                    aria-checked={pref === t}
                    tabIndex={-1}
                    className={seg(pref === t)}
                    onClick={() => setThemePref(t)}
                  >
                    {c.themes[t]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-2 border-t border-rule pt-2">
            <button role="menuitem" tabIndex={-1} className={item} onClick={run(onLogout)}>
              <DoorIcon /> {guest ? c.leaveGuest : c.logout}
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
const GlobeIcon = () => (
  <svg {...svg} width={18} height={18}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5s1.1-6.1 3.4-8.5Z" />
  </svg>
);
const DoorIcon = () => (
  <svg {...svg}>
    <path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14M10 8l-4 4 4 4M6 12h10" />
  </svg>
);
