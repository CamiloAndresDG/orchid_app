import { useMemo, useSyncExternalStore } from "react";
import { API } from "./shared";

// Sesión del navegador. Con cuenta real lleva el token del API (el terreno se guarda en el servidor).
// El modo visitante no tiene token: todo queda solo en este navegador. La contraseña nunca se guarda aquí.
export type Session = { name: string; email: string; createdAt: string; token?: string };

export const SESSION_KEY = "orchid.session.v1";
const EVENT = "orchid-session";
// Claves del cuaderno local; se borran al cerrar una sesión con cuenta para no mezclar datos de dos personas.
export const PLOT_KEY = "orchid.plot.v1";
export const ECON_KEY = "orchid.econ.us.v1";
export const NASS_KEY = "orchid.nassKey.v1";

// El proyecto se llamaba Field Shift: se pasan las claves viejas a las nuevas una sola vez.
if (typeof window !== "undefined") {
  try {
    for (const k of ["session.v1", "plot.v1", "econ.us.v1", "nassKey.v1"]) {
      const old = localStorage.getItem(`fieldshift.${k}`);
      if (old !== null) {
        if (localStorage.getItem(`orchid.${k}`) === null) localStorage.setItem(`orchid.${k}`, old);
        localStorage.removeItem(`fieldshift.${k}`);
      }
    }
  } catch {}
}

function read(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

export function currentSession(): Session | null {
  try {
    return JSON.parse(read() ?? "null");
  } catch {
    return null;
  }
}

// undefined = todavía no sabemos (servidor o primera pintura); null = sin sesión.
export function useSession(): Session | null | undefined {
  const raw = useSyncExternalStore(subscribe, read, () => undefined);
  return useMemo(() => {
    if (raw === undefined || raw === null) return raw;
    try {
      return JSON.parse(raw) as Session;
    } catch {
      return null;
    }
  }, [raw]);
}

export function startSession(email: string, name: string, token?: string) {
  const s: Session = { name, email, createdAt: new Date().toISOString(), ...(token ? { token } : {}) };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export function endSession() {
  const s = currentSession();
  if (s?.token) {
    fetch(`${API}/auth/logout`, { method: "POST", headers: { authorization: `Bearer ${s.token}` }, keepalive: true }).catch(() => {});
  }
  try {
    localStorage.removeItem(SESSION_KEY);
    if (s?.token) {
      localStorage.removeItem(PLOT_KEY);
      localStorage.removeItem(ECON_KEY);
    }
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

async function authCall(path: string, body: object): Promise<void> {
  let r: Response;
  try {
    r = await fetch(`${API}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.");
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    // 422 de FastAPI trae una lista de errores; los demás, un texto.
    throw new Error(typeof j.detail === "string" ? j.detail : "Revisa los datos e intenta de nuevo.");
  }
  startSession(j.user.email, j.user.name, j.token);
}

export const login = (email: string, password: string) => authCall("/auth/login", { email, password });
export const register = (name: string, email: string, password: string) => authCall("/auth/register", { name, email, password });
