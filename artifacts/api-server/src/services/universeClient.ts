import { WebSocket } from "ws";
import { getInternalAuthHeaders } from "../middlewares/internalAuth.js";
import type { Candle, MarketMetrics } from "../types.js";
import { logger } from "../lib/logger.js";

function getBaseUrl(): string {
  return (
    process.env["SYMBOL_UNIVERSE_URL"] ?? "http://localhost:3005"
  ).replace(/\/$/, "");
}

function getWsBaseUrl(): string {
  const base = getBaseUrl()
    .replace(/^https?/, (p) => (p === "https" ? "wss" : "ws"));
  return base;
}

async function fetchJson<T>(path: string): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const res = await fetch(url, { headers: getInternalAuthHeaders() });
  if (!res.ok) {
    throw new Error(`universe-client: ${url} responded ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchCandles(
  symbol: string,
  timeframe: string,
): Promise<Candle[]> {
  return fetchJson<Candle[]>(`/candles/${encodeURIComponent(symbol)}/${encodeURIComponent(timeframe)}`);
}

export async function fetchMetrics(symbol: string): Promise<MarketMetrics> {
  return fetchJson<MarketMetrics>(`/metrics/${encodeURIComponent(symbol)}`);
}

export interface PriceTick {
  price: number;
  bid?: number;
  ask?: number;
  timestamp: number;
}

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 30000;

export function subscribePrice(
  symbol: string,
  onTick: (tick: PriceTick) => void,
  onClose?: () => void,
): () => void {
  let ws: WebSocket | null = null;
  let stopped = false;
  let reconnectDelay = RECONNECT_DELAY_MS;
  let reconnectTimer: NodeJS.Timeout | null = null;

  function connect() {
    if (stopped) return;

    const wsUrl = `${getWsBaseUrl()}/stream/${encodeURIComponent(symbol)}`;
    const authHeaders = getInternalAuthHeaders();

    try {
      ws = new WebSocket(wsUrl, { headers: authHeaders });
    } catch (err) {
      logger.error({ err, symbol }, "universeClient: WS connect error");
      scheduleReconnect();
      return;
    }

    ws.on("open", () => {
      logger.info({ symbol, url: wsUrl }, "universeClient: price stream connected");
      reconnectDelay = RECONNECT_DELAY_MS;
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { type: string; price: number; bid?: number; ask?: number; timestamp: number };
        if (msg.type === "price") {
          onTick({ price: msg.price, bid: msg.bid, ask: msg.ask, timestamp: msg.timestamp });
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on("close", () => {
      logger.warn({ symbol }, "universeClient: price stream closed");
      onClose?.();
      if (!stopped) scheduleReconnect();
    });

    ws.on("error", (err) => {
      logger.error({ err, symbol }, "universeClient: price stream error");
    });
  }

  function scheduleReconnect() {
    if (stopped) return;
    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
      connect();
    }, reconnectDelay);
  }

  connect();

  return function unsubscribe() {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    ws?.close();
    ws = null;
  };
}
