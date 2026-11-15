"use client";

import { useEffect, useState } from "react";
import { NASS_KEY as KEY_STORAGE } from "./auth";
import { ChevronIcon, ExternalIcon } from "./icons";
import type { TabId } from "./panels";
import { COVER_CROPS, CROP_NAMES, ECON_CROPS, EconUS, HistoryRow, US_UNITS, hasEcon } from "./shared";
import type { Point } from "./terreno";
import { langHeaders, useLang } from "./i18n";

const T = {
  es: {
    yield: "Rinde",
    price: "Precio de venta",
    cost: "Costo",
    dunno: "No sé",
    coverNote: "Las coberturas no se venden: solo pon lo que cuesta sembrarlas.",
    priceFail: "No pudimos consultar los precios.",
    title: "Mis precios y costos",
    lead: "Es opcional. Con tus números calculamos cuánto ganarías con cada opción y te avisamos si alguna daría pérdida. Si no sabes un dato, déjalo vacío: no inventamos precios. Se guarda en tu cuenta (en modo visitante, solo en esta computadora).",
    mine: "Tus cultivos y los de tu zona",
    common: "Cultivos más comunes",
    whenAdd: "Cuando agregues tus cultivos en ",
    myField: "Mi terreno",
    willShow: ", aparecerán aquí.",
    others: "Poner precios de otros cultivos",
    othersNote: "Sirve para que las opciones nuevas que te sugerimos también tengan cálculo de dinero.",
    done: "Listo, ver mis opciones con estos precios",
    stateTitle: "¿No sabes el precio? Mira el promedio de tu estado",
    stateLead:
      "El Departamento de Agricultura de EE. UU. (USDA) publica el precio promedio que recibieron los agricultores de cada estado. No es el precio de tu comprador, pero sirve de punto de partida.",
    withServer: " Puedes consultarlo directamente; si tienes tu propia clave gratuita, también puedes usarla:",
    needKey: " Para consultarlo hace falta una clave gratuita:",
    askAt: "Pídela en ",
    byMail: ". Te llega por correo.",
    paste: "Pégala aquí. Necesitamos tu terreno marcado para saber tu estado.",
    yourKey: "Tu clave del USDA",
    optional: " (opcional)",
    pastePh: "Pega tu clave",
    asking: "Consultando…",
    seeState: "Ver precios de mi estado",
    remember: "Recordar la clave en esta computadora",
    markFirst: "Primero marca tu terreno en el mapa.",
    avgIn: (s: string) => `Precio promedio pagado a los agricultores de ${s}, por año:`,
    none: "El USDA no tiene precios publicados para tu estado.",
    inYear: "en",
    before: "Años anteriores:",
    noData: "sin datos",
    use: "Usar este precio",
    missing: "Sin precio publicado:",
    check1: "Para comprobarlo, en ",
    check2: " elige: Crops → tu cultivo → Price received → State → tu estado.",
    daily: "Para precios del día en elevadores y mercados de tu región: ",
    buyer: ". El precio de tu comprador siempre manda.",
  },
  en: {
    yield: "Yield",
    price: "Sale price",
    cost: "Cost",
    dunno: "Not sure",
    coverNote: "Cover crops aren't sold: just enter what they cost to plant.",
    priceFail: "We couldn't look up the prices.",
    title: "My prices and costs",
    lead: "It's optional. With your numbers we estimate how much you'd make with each option and warn you if any would lose money. If you don't know a figure, leave it blank: we don't make up prices. It's saved to your account (in guest mode, only on this computer).",
    mine: "Your crops and your area's",
    common: "Most common crops",
    whenAdd: "When you add your crops in ",
    myField: "My field",
    willShow: ", they'll show up here.",
    others: "Add prices for other crops",
    othersNote: "So the new options we suggest also get a money estimate.",
    done: "Done, see my options with these prices",
    stateTitle: "Don't know the price? See your state's average",
    stateLead:
      "The U.S. Department of Agriculture (USDA) publishes the average price farmers in each state received. It's not your buyer's price, but it's a starting point.",
    withServer: " You can look it up directly; if you have your own free key, you can use it too:",
    needKey: " Looking it up requires a free key:",
    askAt: "Request it at ",
    byMail: ". It arrives by email.",
    paste: "Paste it here. We need your field marked to know your state.",
    yourKey: "Your USDA key",
    optional: " (optional)",
    pastePh: "Paste your key",
    asking: "Looking up…",
    seeState: "See my state's prices",
    remember: "Remember the key on this computer",
    markFirst: "Mark your field on the map first.",
    avgIn: (s: string) => `Average price paid to farmers in ${s}, by year:`,
    none: "USDA has no published prices for your state.",
    inYear: "in",
    before: "Earlier years:",
    noData: "no data",
    use: "Use this price",
    missing: "No published price:",
    check1: "To check it, in ",
    check2: " choose: Crops → your crop → Price received → State → your state.",
    daily: "For today's prices at elevators and markets in your region: ",
    buyer: ". Your buyer's price always wins.",
  },
};

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Ref = { crop: string; unit: string; series: { year: number; price: number }[]; last_year: number; last_price: number };
type RefOut = { state: string; state_name: string; prices: Ref[]; missing: string[] };

const field = "w-full rounded-md border border-field bg-paper px-3 py-2.5 text-base text-ink placeholder:text-ink-faint";
const EMPTY: EconUS = { yield: "", price: "", cost: "" };

function CropRow({ crop, value, onChange }: { crop: string; value?: EconUS; onChange: (p: Partial<EconUS>) => void }) {
  const lang = useLang();
  const t = T[lang];
  const CROPS = CROP_NAMES[lang];
  const cover = COVER_CROPS.includes(crop);
  const u = US_UNITS[crop];
  return (
    <fieldset className="border-b border-rule py-4">
      <legend className="sr-only">{CROPS[crop]}</legend>
      <p className="font-serif text-lg font-semibold">{CROPS[crop]}</p>
      <div className={`mt-2 grid gap-3 ${cover ? "max-w-[14rem] grid-cols-1" : "grid-cols-3"}`}>
        {!cover && (
          <>
            <label className="text-base text-ink">
              {t.yield} <span className="text-sm text-ink-soft">({u.yieldUnit})</span>
              <input className={`${field} mt-1`} type="number" inputMode="decimal" min="0" step="any" placeholder={t.dunno} value={value?.yield ?? ""} onChange={(e) => onChange({ yield: e.target.value })} />
            </label>
            <label className="text-base text-ink">
              {t.price} <span className="text-sm text-ink-soft">({u.priceUnit})</span>
              <input className={`${field} mt-1`} type="number" inputMode="decimal" min="0" step="any" placeholder={t.dunno} value={value?.price ?? ""} onChange={(e) => onChange({ price: e.target.value })} />
            </label>
          </>
        )}
        <label className="text-base text-ink">
          {t.cost} <span className="text-sm text-ink-soft">($/acre)</span>
          <input className={`${field} mt-1`} type="number" inputMode="decimal" min="0" step="any" placeholder={t.dunno} value={value?.cost ?? ""} onChange={(e) => onChange({ cost: e.target.value })} />
        </label>
      </div>
      {cover && <p className="mt-1 text-sm text-ink-soft">{t.coverNote}</p>}
    </fieldset>
  );
}

export function PreciosPanel({
  econ,
  setEcon,
  point,
  history,
  zoneCrops,
  go,
}: {
  econ: Record<string, EconUS>;
  setEcon: (e: Record<string, EconUS>) => void;
  point: Point | null;
  history: HistoryRow[];
  zoneCrops: string[];
  go: (t: TabId) => void;
}) {
  const lang = useLang();
  const t = T[lang];
  const CROPS = CROP_NAMES[lang];
  const [key, setKey] = useState(() => {
    try {
      return typeof window === "undefined" ? "" : (localStorage.getItem(KEY_STORAGE) ?? "");
    } catch {
      return "";
    }
  });
  const [remember, setRemember] = useState(() => {
    try {
      return typeof window !== "undefined" && !!localStorage.getItem(KEY_STORAGE);
    } catch {
      return false;
    }
  });
  // Si el servidor tiene su propia clave de QuickStats, la del usuario es opcional.
  const [serverKey, setServerKey] = useState(false);
  useEffect(() => {
    fetch(`${API}/prices/status`, { headers: langHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setServerKey(!!j?.server_key))
      .catch(() => {});
  }, []);
  const [ref, setRef] = useState<RefOut | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const mine = ECON_CROPS.filter((c) => history.some((h) => h.crop === c) || zoneCrops.includes(c) || hasEcon(econ[c]));
  const shown = mine.length ? mine : ["corn", "soybean"];
  const others = ECON_CROPS.filter((c) => !shown.includes(c));

  function setE(crop: string, patch: Partial<EconUS>) {
    setEcon({ ...econ, [crop]: { ...(econ[crop] ?? EMPTY), ...patch } });
  }

  async function load() {
    if (!point) return;
    setBusy(true);
    setErr(null);
    setRef(null);
    try {
      const r = await fetch(`${API}/prices/reference`, {
        method: "POST",
        headers: langHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ ...point, api_key: key.trim() || null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail ?? t.priceFail);
      setRef(j);
      try {
        if (remember && key.trim()) localStorage.setItem(KEY_STORAGE, key.trim());
        else localStorage.removeItem(KEY_STORAGE);
      } catch {}
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-serif text-3xl font-semibold">{t.title}</h2>
        <p className="mt-2 max-w-prose text-base text-ink-soft">{t.lead}</p>
      </div>

      <section>
        <h3 className="font-serif text-xl font-semibold">{mine.length ? t.mine : t.common}</h3>
        {!mine.length && (
          <p className="mt-1 text-base text-ink-soft">
            {t.whenAdd}
            <button onClick={() => go("terreno")} className="font-semibold text-moss hover:underline">
              {t.myField}
            </button>
            {t.willShow}
          </p>
        )}
        <div className="mt-2 border-t border-rule">
          {shown.map((c) => (
            <CropRow key={c} crop={c} value={econ[c]} onChange={(p) => setE(c, p)} />
          ))}
        </div>
        {others.length > 0 && (
          <details className="group mt-4">
            <summary className="inline-flex cursor-pointer items-center gap-2 text-base font-semibold text-moss">
              <ChevronIcon className="size-5 transition-transform group-open:rotate-90" /> {t.others}
            </summary>
            <p className="mt-2 text-base text-ink-soft">{t.othersNote}</p>
            <div className="mt-2 border-t border-rule">
              {others.map((c) => (
                <CropRow key={c} crop={c} value={econ[c]} onChange={(p) => setE(c, p)} />
              ))}
            </div>
          </details>
        )}
        <button onClick={() => go("terreno")} className="mt-8 rounded-md bg-moss px-6 py-3 text-base font-semibold text-paper hover:bg-moss-deep">
          {t.done}
        </button>
      </section>

      <details className="group border-t border-rule pt-6">
        <summary className="flex cursor-pointer items-center gap-2 font-serif text-xl font-semibold">
          <ChevronIcon className="size-5 text-moss transition-transform group-open:rotate-90" />
          {t.stateTitle}
        </summary>
        <div className="mt-4 space-y-4 pl-7">
          <p className="max-w-prose text-base text-ink-soft">
            {t.stateLead}
            {serverKey ? t.withServer : t.needKey}
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-base text-ink-soft">
            <li>
              {t.askAt}
              <a className="inline-flex items-center gap-1 font-semibold text-moss underline" href="https://quickstats.nass.usda.gov/api" target="_blank" rel="noopener noreferrer">
                quickstats.nass.usda.gov/api <ExternalIcon />
              </a>
              {t.byMail}
            </li>
            <li>{t.paste}</li>
          </ol>
          <div className="flex max-w-xl flex-wrap items-end gap-3">
            <label className="min-w-[14rem] flex-1 text-base text-ink">
              {t.yourKey}
              {serverKey && t.optional}
              <input className={`${field} mt-1`} type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={t.pastePh} />
            </label>
            <button
              onClick={load}
              disabled={busy || !point || (!serverKey && key.trim().length < 8)}
              className="rounded-md bg-moss px-5 py-2.5 text-base font-semibold text-paper hover:bg-moss-deep disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busy ? t.asking : t.seeState}
            </button>
          </div>
          <label className="flex items-center gap-2 text-base text-ink-soft">
            <input type="checkbox" className="size-4 accent-[var(--moss)]" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            {t.remember}
          </label>
          {!point && <p className="text-base text-ink-soft">{t.markFirst}</p>}
          {err && (
            <p role="alert" className="rounded-lg border border-clay/40 bg-paper-deep p-4 text-base text-clay">
              {err}
            </p>
          )}

          {ref && (
            <div className="space-y-3">
              <p className="text-base text-ink">{t.avgIn(ref.state_name)}</p>
              {ref.prices.length === 0 && <p className="text-base text-ink-soft">{t.none}</p>}
              <ul className="border-t border-rule">
                {ref.prices.map((p) => (
                  <li key={p.crop} className="flex flex-wrap items-center justify-between gap-3 border-b border-rule py-3">
                    <div className="text-base">
                      <strong>{CROPS[p.crop]}</strong>: {p.last_price} {p.unit.replace(" / ", "/").toLowerCase()} {t.inYear} {p.last_year}
                      <span className="block text-sm text-ink-soft">
                        {t.before} {p.series.slice(0, -1).map((s) => `${s.year}: ${s.price}`).join(" · ") || t.noData}
                      </span>
                    </div>
                    <button
                      onClick={() => setE(p.crop, { price: String(p.last_price) })}
                      className="rounded-md border border-moss px-4 py-2 text-base text-moss hover:bg-moss hover:text-paper"
                    >
                      {t.use}
                    </button>
                  </li>
                ))}
              </ul>
              {ref.missing.length > 0 && (
                <p className="text-sm text-ink-soft">
                  {t.missing} {ref.missing.map((c) => CROPS[c]).join(", ")}.
                </p>
              )}
              <p className="text-sm text-ink-soft">
                {t.check1}
                <a className="inline-flex items-center gap-1 font-semibold text-moss underline" href="https://quickstats.nass.usda.gov/" target="_blank" rel="noopener noreferrer">
                  QuickStats <ExternalIcon />
                </a>{" "}
                {t.check2}
              </p>
            </div>
          )}
          <p className="text-sm text-ink-soft">
            {t.daily}
            <a className="inline-flex items-center gap-1 font-semibold text-moss underline" href="https://www.ams.usda.gov/market-news" target="_blank" rel="noopener noreferrer">
              USDA Market News <ExternalIcon />
            </a>
            {t.buyer}
          </p>
        </div>
      </details>
    </div>
  );
}
