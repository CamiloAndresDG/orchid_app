"use client";

import { useEffect, useState } from "react";
import { ChevronIcon, ExternalIcon } from "./icons";
import type { TabId } from "./panels";
import { COVER_CROPS, CROPS, ECON_CROPS, EconUS, HistoryRow, US_UNITS, hasEcon } from "./shared";
import type { Point } from "./terreno";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const KEY_STORAGE = "fieldshift.nassKey.v1";

type Ref = { crop: string; unit: string; series: { year: number; price: number }[]; last_year: number; last_price: number };
type RefOut = { state: string; state_name: string; prices: Ref[]; missing: string[] };

const field = "w-full rounded-md border border-field bg-paper px-3 py-2.5 text-base text-ink placeholder:text-ink-faint";
const EMPTY: EconUS = { yield: "", price: "", cost: "" };

function CropRow({ crop, value, onChange }: { crop: string; value?: EconUS; onChange: (p: Partial<EconUS>) => void }) {
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
              Rinde <span className="text-sm text-ink-soft">({u.yieldUnit})</span>
              <input className={`${field} mt-1`} type="number" inputMode="decimal" min="0" step="any" placeholder="No sé" value={value?.yield ?? ""} onChange={(e) => onChange({ yield: e.target.value })} />
            </label>
            <label className="text-base text-ink">
              Precio de venta <span className="text-sm text-ink-soft">({u.priceUnit})</span>
              <input className={`${field} mt-1`} type="number" inputMode="decimal" min="0" step="any" placeholder="No sé" value={value?.price ?? ""} onChange={(e) => onChange({ price: e.target.value })} />
            </label>
          </>
        )}
        <label className="text-base text-ink">
          Costo <span className="text-sm text-ink-soft">($/acre)</span>
          <input className={`${field} mt-1`} type="number" inputMode="decimal" min="0" step="any" placeholder="No sé" value={value?.cost ?? ""} onChange={(e) => onChange({ cost: e.target.value })} />
        </label>
      </div>
      {cover && <p className="mt-1 text-sm text-ink-soft">Las coberturas no se venden: solo pon lo que cuesta sembrarlas.</p>}
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
    fetch(`${API}/prices/status`)
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
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...point, api_key: key.trim() || null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail ?? "No pudimos consultar los precios.");
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
        <h2 className="font-serif text-3xl font-semibold">Mis precios y costos</h2>
        <p className="mt-2 max-w-prose text-base text-ink-soft">
          Es opcional. Con tus números calculamos cuánto ganarías con cada opción y te avisamos si alguna daría pérdida. Si no sabes un dato, déjalo
          vacío: no inventamos precios. Se guarda en tu cuenta (en modo visitante, solo en esta computadora).
        </p>
      </div>

      <section>
        <h3 className="font-serif text-xl font-semibold">{mine.length ? "Tus cultivos y los de tu zona" : "Cultivos más comunes"}</h3>
        {!mine.length && (
          <p className="mt-1 text-base text-ink-soft">
            Cuando agregues tus cultivos en{" "}
            <button onClick={() => go("terreno")} className="font-semibold text-moss hover:underline">
              Mi terreno
            </button>
            , aparecerán aquí.
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
              <ChevronIcon className="size-5 transition-transform group-open:rotate-90" /> Poner precios de otros cultivos
            </summary>
            <p className="mt-2 text-base text-ink-soft">Sirve para que las opciones nuevas que te sugerimos también tengan cálculo de dinero.</p>
            <div className="mt-2 border-t border-rule">
              {others.map((c) => (
                <CropRow key={c} crop={c} value={econ[c]} onChange={(p) => setE(c, p)} />
              ))}
            </div>
          </details>
        )}
        <button onClick={() => go("terreno")} className="mt-8 rounded-md bg-moss px-6 py-3 text-base font-semibold text-paper hover:bg-moss-deep">
          Listo, ver mis opciones con estos precios
        </button>
      </section>

      <details className="group border-t border-rule pt-6">
        <summary className="flex cursor-pointer items-center gap-2 font-serif text-xl font-semibold">
          <ChevronIcon className="size-5 text-moss transition-transform group-open:rotate-90" />
          ¿No sabes el precio? Mira el promedio de tu estado
        </summary>
        <div className="mt-4 space-y-4 pl-7">
          <p className="max-w-prose text-base text-ink-soft">
            El Departamento de Agricultura de EE. UU. (USDA) publica el precio promedio que recibieron los agricultores de cada estado. No es el precio de
            tu comprador, pero sirve de punto de partida.
            {serverKey ? " Puedes consultarlo directamente; si tienes tu propia clave gratuita, también puedes usarla:" : " Para consultarlo hace falta una clave gratuita:"}
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-base text-ink-soft">
            <li>
              Pídela en{" "}
              <a className="inline-flex items-center gap-1 font-semibold text-moss underline" href="https://quickstats.nass.usda.gov/api" target="_blank" rel="noopener noreferrer">
                quickstats.nass.usda.gov/api <ExternalIcon />
              </a>
              . Te llega por correo.
            </li>
            <li>Pégala aquí. Necesitamos tu terreno marcado para saber tu estado.</li>
          </ol>
          <div className="flex max-w-xl flex-wrap items-end gap-3">
            <label className="min-w-[14rem] flex-1 text-base text-ink">
              Tu clave del USDA{serverKey && " (opcional)"}
              <input className={`${field} mt-1`} type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Pega tu clave" />
            </label>
            <button
              onClick={load}
              disabled={busy || !point || (!serverKey && key.trim().length < 8)}
              className="rounded-md bg-moss px-5 py-2.5 text-base font-semibold text-paper hover:bg-moss-deep disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busy ? "Consultando…" : "Ver precios de mi estado"}
            </button>
          </div>
          <label className="flex items-center gap-2 text-base text-ink-soft">
            <input type="checkbox" className="size-4 accent-[var(--moss)]" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Recordar la clave en esta computadora
          </label>
          {!point && <p className="text-base text-ink-soft">Primero marca tu terreno en el mapa.</p>}
          {err && (
            <p role="alert" className="rounded-lg border border-clay/40 bg-paper-deep p-4 text-base text-clay">
              {err}
            </p>
          )}

          {ref && (
            <div className="space-y-3">
              <p className="text-base text-ink">Precio promedio pagado a los agricultores de {ref.state_name}, por año:</p>
              {ref.prices.length === 0 && <p className="text-base text-ink-soft">El USDA no tiene precios publicados para tu estado.</p>}
              <ul className="border-t border-rule">
                {ref.prices.map((p) => (
                  <li key={p.crop} className="flex flex-wrap items-center justify-between gap-3 border-b border-rule py-3">
                    <div className="text-base">
                      <strong>{CROPS[p.crop]}</strong>: {p.last_price} {p.unit.replace(" / ", "/").toLowerCase()} en {p.last_year}
                      <span className="block text-sm text-ink-soft">Años anteriores: {p.series.slice(0, -1).map((s) => `${s.year}: ${s.price}`).join(" · ") || "sin datos"}</span>
                    </div>
                    <button
                      onClick={() => setE(p.crop, { price: String(p.last_price) })}
                      className="rounded-md border border-moss px-4 py-2 text-base text-moss hover:bg-moss hover:text-paper"
                    >
                      Usar este precio
                    </button>
                  </li>
                ))}
              </ul>
              {ref.missing.length > 0 && <p className="text-sm text-ink-soft">Sin precio publicado: {ref.missing.map((c) => CROPS[c]).join(", ")}.</p>}
              <p className="text-sm text-ink-soft">
                Para comprobarlo, en{" "}
                <a className="inline-flex items-center gap-1 font-semibold text-moss underline" href="https://quickstats.nass.usda.gov/" target="_blank" rel="noopener noreferrer">
                  QuickStats <ExternalIcon />
                </a>{" "}
                elige: Crops → tu cultivo → Price received → State → tu estado.
              </p>
            </div>
          )}
          <p className="text-sm text-ink-soft">
            Para precios del día en elevadores y mercados de tu región:{" "}
            <a className="inline-flex items-center gap-1 font-semibold text-moss underline" href="https://www.ams.usda.gov/market-news" target="_blank" rel="noopener noreferrer">
              USDA Market News <ExternalIcon />
            </a>
            . El precio de tu comprador siempre manda.
          </p>
        </div>
      </details>
    </div>
  );
}
