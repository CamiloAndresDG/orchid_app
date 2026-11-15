import { useMemo, useSyncExternalStore } from "react";

// Sesión local de demostración: no hay servidor de cuentas todavía.
// Solo se guarda nombre y correo en este navegador; la contraseña nunca se guarda.
export type Session = { name: string; email: string; createdAt: string };

export const SESSION_KEY = "fieldshift.session.v1";
const EVENT = "fieldshift-session";

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

export function startSession(email: string, name: string) {
  const s: Session = { name, email, createdAt: new Date().toISOString() };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export function endSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}
