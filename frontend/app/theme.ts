"use client";

// Tema: por defecto sigue al sistema (prefers-color-scheme). El usuario puede forzar claro u oscuro desde su menú;
// esa elección se guarda en localStorage["orchid.theme"]. Siempre se escribe el tema efectivo en <html data-theme>.

import { useSyncExternalStore } from "react";

export type ThemePref = "system" | "light" | "dark";
export type Theme = "light" | "dark";

const listeners = new Set<() => void>();
// Clave nueva: el interruptor viejo guardaba "theme" y casi siempre era "light"; así todos arrancan siguiendo al sistema.
const KEY = "orchid.theme";
const MQ = "(prefers-color-scheme: dark)";

function readPref(): ThemePref {
  try {
    const t = localStorage.getItem(KEY);
    if (t === "light" || t === "dark") return t;
  } catch {}
  return "system";
}

const systemTheme = (): Theme => (window.matchMedia?.(MQ).matches ? "dark" : "light");

function apply() {
  const p = readPref();
  document.documentElement.dataset.theme = p === "system" ? systemTheme() : p;
  listeners.forEach((f) => f());
}

let watching = false;
function subscribe(f: () => void) {
  listeners.add(f);
  if (!watching && typeof window !== "undefined" && window.matchMedia) {
    watching = true;
    window.matchMedia(MQ).addEventListener("change", () => {
      if (readPref() === "system") apply();
    });
  }
  return () => listeners.delete(f);
}

export function setThemePref(p: ThemePref) {
  try {
    if (p === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, p);
  } catch {}
  apply();
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, readPref, () => "system");
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"),
    () => "light",
  );
}
