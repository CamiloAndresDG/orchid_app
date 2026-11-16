"use client";

// Platform language: Spanish or English. Starts with what the user chose before (localStorage) or, if they never chose,
// with the browser's language. The <head> script in layout.tsx sets <html lang> before painting; here it is read and changed.

import { useSyncExternalStore } from "react";

export type Lang = "es" | "en";

const listeners = new Set<() => void>();

export function detectLang(): Lang {
  if (typeof document === "undefined") return "es";
  return document.documentElement.lang === "en" ? "en" : "es";
}

/** Current language, for code that isn't a component (fetch, module-level texts). */
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

/** Headers for the backend: the language goes in Accept-Language (a simple header, it doesn't trigger a CORS preflight). */
export const langHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
  "accept-language": currentLang(),
  ...extra,
});
