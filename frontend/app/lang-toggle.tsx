"use client";

import { Lang, setLang, useLang } from "./i18n";

const OPTIONS: { id: Lang; short: string; name: string }[] = [
  { id: "es", short: "ES", name: "Español" },
  { id: "en", short: "EN", name: "English" },
];

/** ES | EN language switcher. */
export function LangToggle({ className = "", tone = "ink" }: { className?: string; tone?: "ink" | "paper" }) {
  const lang = useLang();
  const off = tone === "paper" ? "text-paper/75 hover:text-paper" : "text-ink-soft hover:text-ink";
  return (
    <div
      role="group"
      aria-label={lang === "en" ? "Language" : "Idioma"}
      className={`inline-flex items-center rounded-md border p-0.5 text-sm font-semibold ${tone === "paper" ? "border-paper/40" : "border-field"} ${className}`}
    >
      {OPTIONS.map((o) => {
        const on = o.id === lang;
        return (
          <button
            key={o.id}
            type="button"
            lang={o.id}
            title={o.name}
            aria-label={o.name}
            aria-pressed={on}
            onClick={() => setLang(o.id)}
            className={`rounded px-2 py-1 transition ${on ? "bg-moss text-paper" : off}`}
          >
            {o.short}
          </button>
        );
      })}
    </div>
  );
}
