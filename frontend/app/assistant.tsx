"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { currentSession, type Session } from "./auth";
import { ExternalIcon, Spinner } from "./icons";
import { Mascot, type MascotState } from "./mascot";
import { API } from "./shared";
import type { Point } from "./terreno";

// Brote, la guía de Orchid: chat con IA anclado a las fuentes, por texto o voz (Web Speech API del navegador).

type Source = { n: number; id: string; name: string; url: string | null };
type Msg = { role: "user" | "assistant"; content: string; sources?: Source[]; error?: boolean };

const SPEAK_KEY = "orchid.guide.speak.v1";
const SUGGESTIONS = [
  "¿Qué me conviene sembrar después?",
  "¿Cómo es el suelo de mi terreno?",
  "¿Cuáles son los meses más secos en mi campo?",
  "¿Qué se siembra en Ames, Iowa?",
];

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function getRecognition(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const speechLang = () => (typeof navigator !== "undefined" && navigator.language?.startsWith("es") ? navigator.language : "es-US");

/** Texto apto para leer en voz alta: sin citas [n] ni marcas de formato. */
const forSpeech = (t: string) => t.replace(/\[\d+\]/g, "").replace(/\*\*/g, "").replace(/^\s*-\s+/gm, "");

/** Párrafos y listas simples, **negritas** y citas [n] como enlaces a la fuente. */
function Rich({ text, sources }: { text: string; sources?: Source[] }) {
  const inline = (line: string, key: string) =>
    line.split(/(\*\*[^*]+\*\*|\[\d+\])/g).map((part, i) => {
      if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong>;
      const m = part.match(/^\[(\d+)\]$/);
      if (m) {
        const s = sources?.find((x) => x.n === Number(m[1]));
        return (
          <sup key={`${key}-${i}`} className="ml-0.5 font-semibold text-moss">
            {s?.url ? (
              <a href={s.url} target="_blank" rel="noopener noreferrer" title={s.name} className="hover:underline">
                [{m[1]}]
              </a>
            ) : (
              <span title={s?.name}>[{m[1]}]</span>
            )}
          </sup>
        );
      }
      return part;
    });
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = (k: number) => {
    if (list.length) {
      blocks.push(
        <ul key={`ul-${k}`} className="my-2 list-disc space-y-1 pl-5">
          {list.map((l, i) => (
            <li key={i}>{inline(l, `li-${k}-${i}`)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  text.split("\n").forEach((line, k) => {
    const item = line.match(/^\s*[-•]\s+(.*)$/);
    if (item) return void list.push(item[1]);
    flush(k);
    if (line.trim()) blocks.push(<p key={`p-${k}`} className="my-2 first:mt-0 last:mb-0">{inline(line, `p-${k}`)}</p>);
  });
  flush(-1);
  return <>{blocks}</>;
}

export function Guide({ point }: { point: Point | null }) {
  const [session, setSession] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const [speak, setSpeak] = useState(false);
  const [canListen, setCanListen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setSession(currentSession());
    setCanListen(!!getRecognition());
    try {
      setSpeak(localStorage.getItem(SPEAK_KEY) === "1");
    } catch {}
    /* eslint-enable react-hooks/set-state-in-effect */
    fetch(`${API}/assistant/status`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setEnabled(!!j?.enabled))
      .catch(() => setEnabled(false));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else {
      recRef.current?.stop();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    }
  }, [open]);

  function toggleSpeak() {
    const next = !speak;
    setSpeak(next);
    if (!next) {
      window.speechSynthesis?.cancel();
      setSpeaking(false);
    }
    try {
      localStorage.setItem(SPEAK_KEY, next ? "1" : "0");
    } catch {}
  }

  const say = useCallback(
    (text: string) => {
      if (!speak || typeof window === "undefined" || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(forSpeech(text));
      u.lang = speechLang();
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
    },
    [speak],
  );

  async function send(text: string) {
    const q = text.trim();
    const token = session?.token;
    if (!q || busy || !token) return;
    window.speechSynthesis?.cancel();
    const history: Msg[] = [...messages.filter((m) => !m.error), { role: "user", content: q }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    setStatus("Pensando…");
    const ctl = new AbortController();
    abortRef.current = ctl;
    let answer = "";
    let sources: Source[] = [];
    let failed = false;
    const update = (patch: Partial<Msg>) =>
      setMessages((ms) => {
        const copy = ms.slice();
        copy[copy.length - 1] = { ...copy[copy.length - 1], ...patch };
        return copy;
      });
    try {
      const r = await fetch(`${API}/assistant/chat`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messages: history.slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 4000) })),
          map_point: point,
        }),
        signal: ctl.signal,
      });
      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => ({}));
        throw new Error(
          r.status === 401
            ? "Tu sesión venció. Vuelve a iniciar sesión."
            : typeof j.detail === "string"
              ? j.detail
              : "No pudimos hablar con la Guía. Intenta de nuevo.",
        );
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const ev = JSON.parse(line.slice(6));
          if (ev.type === "text") {
            answer += ev.text;
            setStatus(null);
            update({ content: answer });
          } else if (ev.type === "status") setStatus(ev.text);
          else if (ev.type === "sources") {
            sources = ev.items;
            update({ sources });
          } else if (ev.type === "error") {
            failed = true;
            answer = answer ? `${answer}\n\n${ev.text}` : ev.text;
            update({ content: answer, error: true });
          } else if (ev.type === "done") setRemaining(ev.remaining);
        }
      }
      if (!answer) update({ content: "No recibí respuesta. Intenta de nuevo.", error: true });
      else if (!failed) say(answer);
    } catch (e) {
      if ((e as Error).name !== "AbortError") update({ content: (e as Error).message, error: true });
    } finally {
      setBusy(false);
      setStatus(null);
      abortRef.current = null;
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  function toggleMic() {
    const R = getRecognition();
    if (!R) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    window.speechSynthesis?.cancel();
    const rec = new R();
    rec.lang = speechLang();
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interim += res[0].transcript;
      }
      setInput((finalText + interim).trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      if (finalText.trim()) send(finalText);
    };
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  const loggedIn = !!session?.token;
  const streaming = busy && !status;
  const mood: MascotState = listening ? "listening" : busy && status ? "thinking" : streaming || speaking ? "talking" : "idle";

  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)} className="brote-launcher group fixed bottom-6 right-6 z-40 flex items-center gap-3">
          <span className="rounded-full bg-paper px-4 py-2 text-base font-semibold text-ink shadow-[0_4px_14px_rgb(0_0_0/0.3)] group-hover:text-moss">
            Pregúntale a Brote
          </span>
          <span className="grid size-[4.75rem] place-items-center rounded-full border-2 border-moss bg-paper shadow-[0_8px_22px_-4px_rgb(0_0_0/0.45)] transition-transform duration-300 ease-out group-hover:-translate-y-1">
            <Mascot size={62} decorative />
          </span>
        </button>
      )}
      {open && (
        <section
          role="dialog"
          aria-label="Brote, tu guía de campo"
          className="fixed bottom-6 right-6 top-20 z-50 flex w-[420px] flex-col overflow-hidden rounded-xl border border-rule bg-paper shadow-[0_24px_60px_-20px_rgb(0_0_0/0.55)]"
        >
          <header className="flex items-start justify-between gap-3 border-b border-rule px-5 py-4">
            <div className="flex items-center gap-3">
              <Mascot state={mood} size={56} className="shrink-0" decorative />
              <div>
                <h2 className="font-serif text-xl font-semibold leading-tight">Brote</h2>
                <p className="text-sm text-ink-soft">Tu guía de campo. Responde con datos de NASA, USDA y FAO.</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleSpeak}
                aria-pressed={speak}
                title={speak ? "No leer las respuestas en voz alta" : "Leer las respuestas en voz alta"}
                className={`rounded-md p-2 ${speak ? "bg-moss text-paper" : "text-ink-soft hover:text-ink"}`}
              >
                <SpeakerIcon />
                <span className="sr-only">Leer en voz alta</span>
              </button>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md p-2 text-ink-soft hover:text-ink" title="Cerrar">
                <CloseIcon />
                <span className="sr-only">Cerrar la guía</span>
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-4" aria-live="polite">
            {!loggedIn ? (
              <div className="space-y-3 text-base">
                <p>Soy Brote. Respondo preguntas sobre tu terreno con datos oficiales, por texto o por voz.</p>
                <p className="text-ink-soft">Para usarla necesitas una cuenta gratuita (así tus preguntas usan tu terreno guardado).</p>
                <Link href="/login" className="inline-block rounded-md bg-moss px-5 py-2.5 font-semibold text-paper hover:bg-moss-deep">
                  Crear cuenta o iniciar sesión
                </Link>
              </div>
            ) : enabled === false ? (
              <p className="rounded-lg border border-clay/40 bg-paper-deep p-4 text-base text-clay">
                Brote todavía no está disponible en este servidor. Vuelve a intentarlo más tarde.
              </p>
            ) : messages.length === 0 ? (
              <div className="space-y-4">
                <p className="text-base">
                  Hola{session?.name ? `, ${session.name.split(" ")[0]}` : ""}. Soy Brote. Pregúntame sobre tu terreno o sobre otro lugar: respondo
                  solo con datos de las fuentes y te digo de dónde sale cada uno.
                </p>
                <div className="flex flex-col gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-lg border border-field px-4 py-2.5 text-left text-base text-ink hover:border-moss"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ol className="space-y-4">
                {messages.map((m, i) => (
                  <li key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                    {m.role === "user" ? (
                      <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-moss px-4 py-2.5 text-base text-paper">{m.content}</p>
                    ) : (
                      <div className={`text-base leading-relaxed ${m.error ? "text-clay" : "text-ink"}`}>
                        {m.content ? <Rich text={m.content} sources={m.sources} /> : null}
                        {!!m.sources?.length && (
                          <div className="mt-3 border-t border-rule pt-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Fuentes consultadas</p>
                            <ul className="mt-1 space-y-1 text-sm">
                              {m.sources.map((s) => (
                                <li key={s.n} className="flex gap-1.5">
                                  <span className="font-semibold text-moss">[{s.n}]</span>
                                  {s.url ? (
                                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-ink underline-offset-2 hover:underline">
                                      {s.name} <ExternalIcon className="size-3.5" />
                                    </a>
                                  ) : (
                                    <span className="text-ink">{s.name}</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {status && (
              <p className="mt-3 flex items-center gap-2 text-sm text-ink-soft">
                <Spinner /> {status}
              </p>
            )}
            <div ref={endRef} />
          </div>

          {loggedIn && enabled !== false && (
            <form onSubmit={onSubmit} className="border-t border-rule px-4 py-3">
              <div className="flex items-end gap-2">
                <label htmlFor="guide-input" className="sr-only">
                  Escribe tu pregunta
                </label>
                <textarea
                  id="guide-input"
                  ref={inputRef}
                  rows={2}
                  value={input}
                  maxLength={2000}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                  placeholder={listening ? "Te escucho…" : "Escribe o dicta tu pregunta"}
                  className="min-h-[2.75rem] flex-1 resize-none rounded-md border border-field bg-paper px-3 py-2 text-base text-ink placeholder:text-ink-soft focus:border-moss"
                />
                {canListen && (
                  <button
                    type="button"
                    onClick={toggleMic}
                    disabled={busy}
                    aria-pressed={listening}
                    title={listening ? "Dejar de escuchar" : "Hablar"}
                    className={`rounded-md p-2.5 disabled:opacity-45 ${listening ? "animate-pulse bg-clay text-paper" : "border border-field text-ink hover:border-moss"}`}
                  >
                    <MicIcon />
                    <span className="sr-only">{listening ? "Dejar de escuchar" : "Dictar la pregunta"}</span>
                  </button>
                )}
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  className="rounded-md bg-moss px-4 py-2.5 font-semibold text-paper hover:bg-moss-deep disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Enviar
                </button>
              </div>
              <p className="mt-2 text-xs text-ink-soft">
                Apoyo a tu decisión: confirma con tu oficina de extensión local.
                {remaining !== null && ` Te quedan ${remaining} preguntas hoy.`}
              </p>
            </form>
          )}
        </section>
      )}
    </>
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
const MicIcon = () => (
  <svg {...svg}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);
const SpeakerIcon = () => (
  <svg {...svg}>
    <path d="M4 10v4h4l5 4V6L8 10H4Z" />
    <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
  </svg>
);
const CloseIcon = () => (
  <svg {...svg}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
