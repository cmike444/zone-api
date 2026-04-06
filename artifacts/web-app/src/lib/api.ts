const TOKEN: string = import.meta.env.VITE_API_TOKEN as string ?? "";
const API_BASE = "/api";

function authHeaders(): HeadersInit {
  return TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export function getWsUrl(symbol: string): string {
  const origin = window.location.origin
    .replace(/^https/, "wss")
    .replace(/^http/, "ws");
  return `${origin}/stream/${symbol}${TOKEN ? `?token=${TOKEN}` : ""}`;
}

export const api = {
  healthz: () => apiFetch<{ status: string }>("/healthz"),

  listSymbols: () =>
    apiFetch<Array<{ symbol: string; currentPrice?: number; zoneCount: number }>>("/symbols"),

  addSymbol: (symbol: string) =>
    apiFetch<{ symbol: string }>(`/symbols/${symbol}`, { method: "POST" }),

  deleteSymbol: (symbol: string) =>
    apiFetch<void>(`/symbols/${symbol}`, { method: "DELETE" }),

  getConfluentZones: (symbol: string) =>
    apiFetch<import("./types").ConfluentZone[]>(`/zones/${symbol}/confluent`),

  getTopZones: (limit = 100, direction?: "supply" | "demand") => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (direction) params.set("direction", direction);
    return apiFetch<import("./types").ConfluentZone[]>(`/zones/top?${params}`);
  },

  getActiveZones: () =>
    apiFetch<import("./types").ConfluentZone[]>("/zones/active"),

  getZones: (symbol: string, timeframe?: string) => {
    const params = timeframe ? `?timeframe=${timeframe}` : "";
    return apiFetch<import("./types").ConfluentZone[]>(`/zones/${symbol}${params}`);
  },

  getCandles: (symbol: string, timeframe: string) =>
    apiFetch<import("./types").Candle[]>(`/candles/${symbol}/${timeframe}`),

  getPrice: (symbol: string) =>
    apiFetch<{ symbol: string; price: number }>(`/price/${symbol}`),
};
