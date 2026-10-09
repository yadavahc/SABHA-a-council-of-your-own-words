import type { AppState, ConstellationPoint, Memory } from "./types";

/** REST calls are same-origin: FastAPI serves the export in production, `next dev` proxies them in development. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

const post = <T = unknown>(path: string, body?: unknown) =>
  request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export const api = {
  state: () => request<AppState>("/api/state"),
  memories: (q = "", k = 12) =>
    request<Memory[]>(q ? `/api/memories?q=${encodeURIComponent(q)}&k=${k}` : "/api/memories"),
  constellation: () => request<ConstellationPoint[]>("/api/constellation"),
  speech: (text: string, source = "typed") => post("/api/speech", { text, source }),
  seal: (id: string, sealed: boolean) => post<Memory>(`/api/memories/${id}/seal`, { sealed }),
  outcome: (decision_id: string, chosen: string, good: boolean) =>
    post("/api/outcome", { decision_id, chosen, good }),
  reset: () => post("/api/reset"),
  simulate: (scenario: string) => request(`/simulate?scenario=${encodeURIComponent(scenario)}`),
};

/** The dev server (:3000) can't proxy WebSockets reliably, so in dev we talk to the Python server directly. */
export function wsUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SABHA_WS;
  if (explicit) return explicit;
  const secure = location.protocol === "https:";
  if (process.env.NODE_ENV === "development") return `ws://${location.hostname}:8765/ws`;
  return `${secure ? "wss" : "ws"}://${location.host}/ws`;
}
