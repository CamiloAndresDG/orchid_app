import { useMemo, useSyncExternalStore } from "react";
import { API } from "./shared";
import { currentLang, langHeaders } from "./i18n";

// Browser session. With a real account it carries the API token (the field is stored on the server).
// Guest mode has no token: everything stays in this browser only. The password is never stored here.
export type Session = { name: string; email: string; createdAt: string; token?: string };

export const SESSION_KEY = "orchid.session.v1";
const EVENT = "orchid-session";
// Local notebook keys; cleared when an account session ends so two people's data never mix.
export const PLOT_KEY = "orchid.plot.v1";
export const ECON_KEY = "orchid.econ.us.v1";
export const NASS_KEY = "orchid.nassKey.v1";

// The project used to be called Field Shift: old keys are migrated to the new ones once.
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

// undefined = we don't know yet (server or first paint); null = no session.
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
    r = await fetch(`${API}${path}`, { method: "POST", headers: langHeaders({ "content-type": "application/json" }), body: JSON.stringify(body) });
  } catch {
    throw new Error(
      currentLang() === "en"
        ? "We couldn't reach the server. Check your connection and try again."
        : "No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.",
    );
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    // FastAPI's 422 carries a list of errors; the others, a text.
    throw new Error(
      typeof j.detail === "string" ? j.detail : currentLang() === "en" ? "Check your details and try again." : "Revisa los datos e intenta de nuevo.",
    );
  }
  startSession(j.user.email, j.user.name, j.token);
}

export const login = (email: string, password: string) => authCall("/auth/login", { email, password });
export const register = (name: string, email: string, password: string) => authCall("/auth/register", { name, email, password });
