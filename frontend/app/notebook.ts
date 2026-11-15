// Sincroniza el cuaderno (terreno y precios) con la cuenta del servidor.
// Las pantallas siguen leyendo y escribiendo localStorage; este módulo lo copia al servidor y viceversa.
import { ECON_KEY, PLOT_KEY, currentSession } from "./auth";
import { API } from "./shared";

type Notebook = { plot: unknown; econ: Record<string, unknown> };

// Solo se sube después de haber traído el cuaderno de la cuenta; si no, se podría pisar con datos viejos.
let syncedToken: string | null = null;
let lastSent = ""; // evita reenviar lo mismo que ya está en el servidor
let timer: ReturnType<typeof setTimeout> | null = null;

function local(): Notebook {
  const get = (k: string) => {
    try {
      return JSON.parse(localStorage.getItem(k) ?? "null");
    } catch {
      return null;
    }
  };
  return { plot: get(PLOT_KEY), econ: get(ECON_KEY) ?? {} };
}

const isEmpty = (nb: Notebook) => !nb.plot && Object.keys(nb.econ).length === 0;

/**
 * Al entrar: trae el cuaderno de la cuenta y lo deja en localStorage.
 * Si la cuenta está vacía y en este navegador hay un terreno (por ejemplo del modo visitante), lo sube.
 */
export async function pullNotebook(token: string): Promise<"ok" | "unauthorized" | "offline"> {
  syncedToken = null;
  let r: Response;
  try {
    r = await fetch(`${API}/me/notebook`, { headers: { authorization: `Bearer ${token}` } });
  } catch {
    return "offline";
  }
  if (r.status === 401) return "unauthorized";
  if (!r.ok) return "offline";
  const remote: Notebook = await r.json();
  if (isEmpty(remote)) {
    const mine = local();
    if (!isEmpty(mine)) await push(token, mine);
    else lastSent = JSON.stringify(mine);
    syncedToken = token;
    return "ok";
  }
  try {
    if (remote.plot) localStorage.setItem(PLOT_KEY, JSON.stringify(remote.plot));
    else localStorage.removeItem(PLOT_KEY);
    localStorage.setItem(ECON_KEY, JSON.stringify(remote.econ ?? {}));
  } catch {}
  lastSent = JSON.stringify({ plot: remote.plot, econ: remote.econ ?? {} });
  syncedToken = token;
  return "ok";
}

async function push(token: string, nb: Notebook, keepalive = false) {
  const body = JSON.stringify(nb);
  if (body === lastSent) return;
  try {
    const r = await fetch(`${API}/me/notebook`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body,
      keepalive,
    });
    if (r.ok) lastSent = body;
  } catch {
    // Sin conexión: queda en localStorage y se reintenta en el próximo cambio.
  }
}

function flush(keepalive = false) {
  if (timer) clearTimeout(timer);
  timer = null;
  const token = currentSession()?.token;
  if (token && token === syncedToken) void push(token, local(), keepalive);
}

/** Envía ya lo pendiente (antes de cerrar sesión). */
export const flushNotebook = () => flush(true);

/** Llamar después de escribir el terreno o los precios en localStorage. Solo sube si hay cuenta. */
export function notebookChanged() {
  const token = currentSession()?.token;
  if (!token || token !== syncedToken) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, 800);
}

// Si la persona cierra la pestaña antes de que pase el retraso, se envía igual.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => timer && flush(true));
}
