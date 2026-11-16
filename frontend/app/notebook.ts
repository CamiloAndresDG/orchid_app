// Syncs the notebook (field and prices) with the server account.
// Screens keep reading and writing localStorage; this module copies it to the server and back.
import { ECON_KEY, PLOT_KEY, currentSession } from "./auth";
import { API } from "./shared";

type Notebook = { plot: unknown; econ: Record<string, unknown> };

// Only upload after the account's notebook has been fetched; otherwise it could be overwritten with stale data.
let syncedToken: string | null = null;
let lastSent = ""; // avoids resending what's already on the server
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
 * On sign-in: fetches the account's notebook and puts it in localStorage.
 * If the account is empty and this browser has a field (for example from guest mode), it uploads it.
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
    // Offline: it stays in localStorage and is retried on the next change.
  }
}

function flush(keepalive = false) {
  if (timer) clearTimeout(timer);
  timer = null;
  const token = currentSession()?.token;
  if (token && token === syncedToken) void push(token, local(), keepalive);
}

/** Sends anything pending right away (before signing out). */
export const flushNotebook = () => flush(true);

/** Call after writing the field or the prices to localStorage. Only uploads if there's an account. */
export function notebookChanged() {
  const token = currentSession()?.token;
  if (!token || token !== syncedToken) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, 800);
}

// If the person closes the tab before the delay is up, it's sent anyway.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => timer && flush(true));
}
