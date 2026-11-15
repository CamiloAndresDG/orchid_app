"use client";

// Idioma de la plataforma: español o inglés. Arranca con lo que el usuario eligió antes (localStorage) o, si nunca eligió,
// con el idioma del navegador. El script de <head> en layout.tsx fija <html lang> antes de pintar; aquí se lee y se cambia.

import { useSyncExternalStore } from "react";

export type Lang = "es" | "en";

const listeners = new Set<() => void>();

export function detectLang(): Lang {
  if (typeof document === "undefined") return "es";
  return document.documentElement.lang === "en" ? "en" : "es";
}

/** Idioma actual, para código que no es un componente (fetch, textos de módulos). */
export const currentLang = detectLang;

export function setLang(l: Lang) {
  document.documentElement.lang = l;
  try {
    localStorage.setItem("lang", l);
  } catch {}
  listeners.forEach((f) => f());
}

function subscribe(f: () => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, detectLang, () => "es");
}

export const locale = (l: Lang) => (l === "en" ? "en-US" : "es-US");

export const fmtNum = (l: Lang, n: number, d = 0) =>
  n.toLocaleString(locale(l), { maximumFractionDigits: d, minimumFractionDigits: d });

/** Cabeceras para el backend: el idioma va en Accept-Language (cabecera simple, no dispara preflight de CORS). */
export const langHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
  "accept-language": currentLang(),
  ...extra,
});
