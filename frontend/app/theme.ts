"use client";

// Theme: follows the system by default (prefers-color-scheme). The user can force light or dark from their menu;
// that choice is stored in localStorage["orchid.theme"]. The effective theme is always written to <html data-theme>.

import { useSyncExternalStore } from "react";

export type ThemePref = "system" | "light" | "dark";
export type Theme = "light" | "dark";

const listeners = new Set<() => void>();
// New key: the old toggle stored "theme" and it was almost always "light"; this way everyone starts following the system.
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
