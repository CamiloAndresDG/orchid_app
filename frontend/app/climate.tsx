"use client";

import { useEffect, useState } from "react";
import { ExternalIcon } from "./icons";
import { powerViewerUrl } from "./sources";
import { Lang, langHeaders, useLang } from "./i18n";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Res = "daily" | "monthly" | "quarterly" | "semester" | "yearly";
type Row = { label: string; days: number; precip_mm_total: number; precip_mm_day: number; temp_c: number; soil_wetness: number | null };
type Out = { rows: Row[]; official_url: string; last_available: string | null };

const RES: Res[] = ["daily", "monthly", "quarterly", "semester", "yearly"];

type SeriesKey = "rain_in_day" | "rain_in_total" | "temp_f" | "soil_pct";
type Series = { key: SeriesKey; label: string; unit: string; kind: "bar" | "line"; color: string; source: string; derived?: boolean };
const SERIES: Record<Lang, Series[]> = {
  es: [
    { key: "rain_in_day", label: "Lluvia por día", unit: "pulgadas", kind: "line", color: "var(--moss)", source: "PRECTOTCORR · Precipitation Corrected (MERRA-2), en mm/día; aquí en pulgadas" },
    { key: "rain_in_total", label: "Lluvia acumulada", unit: "pulgadas", kind: "bar", color: "var(--moss)", source: "No existe en la fuente: es la suma de los días de PRECTOTCORR en el periodo (cálculo de Orchid)", derived: true },
    { key: "temp_f", label: "Temperatura", unit: "°F", kind: "line", color: "var(--clay)", source: "T2M · Temperature at 2 Meters (MERRA-2), en °C; aquí en °F" },
    { key: "soil_pct", label: "Humedad del suelo", unit: "%", kind: "line", color: "var(--field)", source: "GWETROOT · Root Zone Soil Wetness (MERRA-2), de 0 a 1; aquí en %" },
  ],
  en: [
    { key: "rain_in_day", label: "Rain per day", unit: "inches", kind: "line", color: "var(--moss)", source: "PRECTOTCORR · Precipitation Corrected (MERRA-2), in mm/day; shown here in inches" },
    { key: "rain_in_total", label: "Total rain", unit: "inches", kind: "bar", color: "var(--moss)", source: "Not in the source: it's the sum of the PRECTOTCORR days in the period (Orchid's calculation)", derived: true },
    { key: "temp_f", label: "Temperature", unit: "°F", kind: "line", color: "var(--clay)", source: "T2M · Temperature at 2 Meters (MERRA-2), in °C; shown here in °F" },
    { key: "soil_pct", label: "Soil moisture", unit: "%", kind: "line", color: "var(--field)", source: "GWETROOT · Root Zone Soil Wetness (MERRA-2), 0 to 1; shown here in %" },
  ],
};

const T = {
  es: {
    res: { daily: "Día", monthly: "Mes", quarterly: "Trimestre", semester: "Semestre", yearly: "Año" } as Record<Res, string>,
    months: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
    title: "Clima por fechas",
    lead: "Elige las fechas y si quieres verlo por día, mes, trimestre, semestre o año.",
    groupBy: "Agrupar por",
    from: "Desde",
    to: "Hasta",
    shortcuts: "Atajos:",
    last3: "Últimos 3 meses",
    lastYear: "Último año",
    year: "Año",
    badRange: "La fecha «Desde» debe ser antes de «Hasta».",
    tooLong: "Por día puedes ver hasta 400 días. Acorta el rango o agrupa por mes.",
    asking: "Consultando a la NASA…",
    whatToSee: "Qué ver en el gráfico",
    chartData: "Datos del gráfico",
    computed: "· calculado",
    pickOne: "Marca al menos un dato para ver el gráfico.",
    hiddenAxes: "Con más de dos datos, el eje de los demás está oculto: pasa el cursor sobre el gráfico para ver sus valores.",
    period: "Periodo",
    days: "Días",
    totalRain: "Lluvia acumulada*",
    avgTemp: "Temperatura media",
    soil: "Suelo",
    seeNasa: "Ver estos datos en la página de la NASA",
    submit1: "Se abre la página oficial con tu punto y tus fechas ya puestos; allí pulsa el botón ",
    submit2: " (significa «enviar»; esa página está en inglés y usa mm y °C).",
    sameDays: "Verás los mismos días.",
    sumBy: (r: string) => `La NASA muestra cada mes de los años elegidos; la suma por ${r} la hacemos nosotros.`,
    delay: "La NASA publica con 2 o 3 días de retraso",
    lastData: (d: string) => ` (último dato: ${d})`,
    tech: "Detalle técnico de los datos",
    techNote: "* En la página de la NASA la lluvia aparece como «Precipitation Corrected», en mm por día. La lluvia acumulada es la suma de esos días.",
    raw: "Datos diarios en bruto (JSON)",
    dateFmt: "$3/$2/$1",
  },
  en: {
    res: { daily: "Day", monthly: "Month", quarterly: "Quarter", semester: "Half-year", yearly: "Year" } as Record<Res, string>,
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    title: "Climate by dates",
    lead: "Pick the dates and whether you want to see it by day, month, quarter, half-year or year.",
    groupBy: "Group by",
    from: "From",
    to: "To",
    shortcuts: "Shortcuts:",
    last3: "Last 3 months",
    lastYear: "Last year",
    year: "Year",
    badRange: "The “From” date must be before “To”.",
    tooLong: "By day you can see up to 400 days. Shorten the range or group by month.",
    asking: "Asking NASA…",
    whatToSee: "What to show on the chart",
    chartData: "Chart data",
    computed: "· calculated",
    pickOne: "Check at least one item to see the chart.",
    hiddenAxes: "With more than two items, the other axes are hidden: hover over the chart to see their values.",
    period: "Period",
    days: "Days",
    totalRain: "Total rain*",
    avgTemp: "Average temperature",
    soil: "Soil",
    seeNasa: "See this data on NASA's page",
    submit1: "The official page opens with your point and dates filled in; press the ",
    submit2: " button there (that page uses mm and °C).",
    sameDays: "You'll see the same days.",
    sumBy: (r: string) => `NASA shows each month of the chosen years; we do the sum by ${r}.`,
    delay: "NASA publishes with a 2 to 3 day delay",
    lastData: (d: string) => ` (latest data: ${d})`,
    tech: "Technical details of the data",
    techNote: "* On NASA's page rain appears as “Precipitation Corrected”, in mm per day. Total rain is the sum of those days.",
    raw: "Raw daily data (JSON)",
    dateFmt: "$2/$3/$1",
  },
};

// "2025-11" -> "nov 2025"; el resto de etiquetas se deja igual
const prettyLabel = (s: string, l: Lang) => (/^\d{4}-\d{2}$/.test(s) ? `${T[l].months[+s.slice(5) - 1]} ${s.slice(0, 4)}` : s);
const toIn = (mm: number) => mm / 25.4;
const toF = (c: number) => (c * 9) / 5 + 32;
export const soilWord = (w: number, l: Lang = "es") =>
  l === "en" ? (w < 0.35 ? "dry" : w < 0.55 ? "medium" : "wet") : w < 0.35 ? "seco" : w < 0.55 ? "medio" : "húmedo";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const compact = (s: string) => s.replaceAll("-", "");
const shift = (d: Date, days: number) => new Date(d.getTime() + days * 86400000);

const field = "rounded-md border border-field bg-paper px-3 py-2.5 text-base text-ink";

export function ClimaExplorer({ lat, lon }: { lat: number; lon: number }) {
  const l = useLang();
  const t = T[l];
  const series = SERIES[l];
  const today = new Date();
  const maxDate = iso(shift(today, -3)); // POWER publica con ~2-3 dias de retraso
  const [res, setRes] = useState<Res>("monthly");
  const [start, setStart] = useState(iso(shift(today, -365)));
  const [end, setEnd] = useState(maxDate);
  const [out, setOut] = useState<Out | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shown, setShown] = useState<SeriesKey[]>(["rain_in_total", "temp_f"]);

  const spanDays = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
  const tooLong = res === "daily" && spanDays > 400;
  const invalid = !start || !end || start > end || tooLong;

  useEffect(() => {
    if (invalid) return;
    const ctl = new AbortController();
    /* eslint-disable react-hooks/set-state-in-effect */
    setBusy(true);
    setErr(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    fetch(`${API}/climate?lat=${lat}&lon=${lon}&start=${compact(start)}&end=${compact(end)}&resolution=${res}`, { signal: ctl.signal, headers: langHeaders() })
      .then((r) => (r.ok ? r.json() : r.json().then((j) => Promise.reject(new Error(j.detail ?? `API ${r.status}`)))))
      .then(setOut)
      .catch((e) => e.name !== "AbortError" && setErr(String(e.message ?? e)))
      .finally(() => setBusy(false));
    return () => ctl.abort();
  }, [lat, lon, res, start, end, invalid, l]);

  function preset(days: number) {
    setEnd(maxDate);
    setStart(iso(shift(new Date(maxDate), -(days - 1))));
  }
  function year(y: number) {
    setStart(`${y}-01-01`);
    setEnd(y === today.getFullYear() ? maxDate : `${y}-12-31`);
  }

  const active = series.filter((x) => shown.includes(x.key));
  const chart = out?.rows.map((r) => ({
    name: prettyLabel(r.label, l),
    rain_in_day: +toIn(r.precip_mm_day).toFixed(2),
    rain_in_total: +toIn(r.precip_mm_total).toFixed(1),
    temp_f: +toF(r.temp_c).toFixed(0),
    soil_pct: r.soil_wetness === null ? null : Math.round(r.soil_wetness * 100),
  }));
  function toggle(k: SeriesKey) {
    setShown((cur) => (cur.includes(k) ? cur.filter((c) => c !== k) : [...cur, k]));
  }
  const thisYear = today.getFullYear();
  const viewerHref =
    res === "daily"
      ? powerViewerUrl(lat, lon, "daily", start, end)
      : powerViewerUrl(lat, lon, "monthly", `${start.slice(0, 4)}-01-01`, `${end.slice(0, 4)}-12-31`);
  const resName = t.res[res].toLowerCase();

  return (
    <section className="space-y-5">
      <div>
        <h3 className="font-serif text-xl font-semibold">{t.title}</h3>
        <p className="mt-1 text-base text-ink-soft">{t.lead}</p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label={t.groupBy}>
        {RES.map((r) => (
          <button
            key={r}
            onClick={() => setRes(r)}
            aria-pressed={res === r}
            className={`rounded-full border px-4 py-2 text-base ${res === r ? "border-moss bg-moss text-paper" : "border-field text-ink hover:border-moss"}`}
          >
            {t.res[r]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-4 text-base">
        <label>
          {t.from}
          <input type="date" className={`${field} block`} value={start} max={end} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          {t.to}
          <input type="date" className={`${field} block`} value={end} min={start} max={maxDate} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <div className="flex flex-wrap gap-2 text-base">
        <span className="py-1.5 text-ink-soft">{t.shortcuts}</span>
        {(
          [
            [t.last3, 91],
            [t.lastYear, 365],
          ] as [string, number][]
        ).map(([label, d]) => (
          <button key={label} onClick={() => preset(d)} className="rounded-md border border-field px-3 py-1.5 text-ink hover:border-moss">
            {label}
          </button>
        ))}
        {[thisYear, thisYear - 1].map((y) => (
          <button key={y} onClick={() => year(y)} className="rounded-md border border-field px-3 py-1.5 text-ink hover:border-moss">
            {t.year} {y}
          </button>
        ))}
      </div>

      {start > end && <p className="text-base text-clay">{t.badRange}</p>}
      {tooLong && <p className="text-base text-clay">{t.tooLong}</p>}
      {err && <p role="alert" className="rounded-lg border border-clay/40 bg-paper-deep p-4 text-base text-clay">{err}</p>}
      {busy && <p className="text-base text-ink-soft" aria-live="polite">{t.asking}</p>}

      {out && !invalid && (
        <>
          <div className="space-y-2">
            <p className="text-base font-semibold text-ink">{t.whatToSee}</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t.chartData}>
              {series.map((x) => (
                <label
                  key={x.key}
                                    className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-base ${shown.includes(x.key) ? "border-moss text-ink" : "border-field text-ink-soft hover:border-moss"}`}
                >
                  <input type="checkbox" className="size-4 accent-[var(--moss)]" checked={shown.includes(x.key)} onChange={() => toggle(x.key)} />
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: x.color }} />
                  {x.label} <span className="text-ink-soft">({x.unit})</span>
                  {x.derived && <span className="text-sm text-ink-soft">{t.computed}</span>}
                </label>
              ))}
            </div>
          </div>

          {active.length === 0 ? (
            <p className="rounded-lg border border-dashed border-field p-6 text-center text-base text-ink-soft">{t.pickOne}</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chart}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--rule)" vertical={false} />
                  <XAxis dataKey="name" stroke="var(--ink-soft)" fontSize={12} minTickGap={16} />
                  {active.map((x, i) => (
                    <YAxis
                      key={x.key}
                      yAxisId={x.key}
                      orientation={i === 0 ? "left" : "right"}
                      hide={i > 1}
                      stroke="var(--ink-soft)"
                      fontSize={12}
                      width={i > 1 ? 0 : 56}
                      unit={i <= 1 ? ` ${x.unit}` : undefined}
                    />
                  ))}
                  <Tooltip
                    contentStyle={{ background: "var(--paper)", border: "1px solid var(--rule)", color: "var(--ink)" }}
                    formatter={(v, _n, item) => {
                      const d = series.find((x) => x.key === item.dataKey);
                      return [`${v} ${d?.unit ?? ""}`, d ? d.label : String(item.dataKey)];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 14 }} formatter={(_v, e) => series.find((x) => x.key === (e as { dataKey?: string }).dataKey)?.label} />
                  {active.map((x) =>
                    x.kind === "bar" ? (
                      <Bar key={x.key} yAxisId={x.key} dataKey={x.key} fill={x.color} opacity={0.55} />
                    ) : (
                      <Line key={x.key} yAxisId={x.key} dataKey={x.key} stroke={x.color} strokeWidth={2} dot={false} />
                    ),
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          {active.length > 2 && <p className="text-sm text-ink-soft">{t.hiddenAxes}</p>}

          <div className="max-h-72 overflow-auto">
            <table className="w-full text-base">
              <thead className="sticky top-0 bg-paper text-left text-sm text-ink-soft">
                <tr>
                  <th className="py-2 pr-2">{t.period}</th>
                  <th className="pr-2">{t.days}</th>
                  <th className="pr-2">{t.totalRain}</th>
                  <th className="pr-2">{t.avgTemp}</th>
                  <th>{t.soil}</th>
                </tr>
              </thead>
              <tbody>
                {out.rows.map((r) => (
                  <tr key={r.label} className="border-b border-rule/60">
                    <td className="py-1.5 pr-2 font-semibold">{prettyLabel(r.label, l)}</td>
                    <td className="pr-2 tabular-nums">{r.days}</td>
                    <td className="pr-2 tabular-nums">
                      {toIn(r.precip_mm_total).toFixed(1)} in <span className="text-sm text-ink-soft">({r.precip_mm_total.toFixed(0)} mm)</span>
                    </td>
                    <td className="pr-2 tabular-nums">
                      {toF(r.temp_c).toFixed(0)} °F <span className="text-sm text-ink-soft">({r.temp_c.toFixed(0)} °C)</span>
                    </td>
                    <td>{r.soil_wetness === null ? "—" : soilWord(r.soil_wetness, l)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 text-base">
            <a
              href={viewerHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-moss px-4 py-2.5 font-semibold text-moss hover:bg-moss hover:text-paper"
            >
              {t.seeNasa} <ExternalIcon />
            </a>
            <p className="max-w-prose text-sm text-ink-soft">
              {t.submit1}
              <strong>Submit</strong>
              {t.submit2} {res === "daily" ? t.sameDays : t.sumBy(resName)} {t.delay}
              {out.last_available ? t.lastData(out.last_available.replace(/(\d{4})(\d{2})(\d{2})/, t.dateFmt)) : ""}.
            </p>
          </div>

          <details className="group text-base">
            <summary className="inline-flex cursor-pointer items-center gap-1.5 text-moss hover:underline">{t.tech}</summary>
            <div className="mt-3 space-y-2 text-sm text-ink-soft">
              <ul className="space-y-1">
                {series.map((x) => (
                  <li key={x.key}>
                    <strong className="text-ink">{x.label} ({x.unit}):</strong> {x.source}.
                  </li>
                ))}
              </ul>
              <p>
                {t.techNote}{" "}
                <a className="inline-flex items-center gap-1 text-moss underline" href={out.official_url} target="_blank" rel="noopener noreferrer">
                  {t.raw} <ExternalIcon />
                </a>
              </p>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
