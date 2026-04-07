import { WebSocket } from "ws";
import { getInternalAuthHeaders } from "../middlewares/internalAuth.js";
import type { Candle, MarketMetrics } from "../types.js";
import { logger } from "../lib/logger.js";

function getBaseUrl(): string {
  return (
    process.env["SYMBOL_UNIVERSE_URL"] ?? "http://localhost:3005"
  ).replace(/\/$/, "");
}

function getCandleBaseUrl(): string {
  return (
    process.env["CANDLE_UNIVERSE_URL"] ?? getBaseUrl()
  ).replace(/\/$/, "");
}

function getWsBaseUrl(): string {
  const base = getBaseUrl()
    .replace(/^https?/, (p) => (p === "https" ? "wss" : "ws"));
  return base;
}

async function fetchJson<T>(baseUrl: string, path: string): Promise<T> {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, { headers: getInternalAuthHeaders() });
  if (!res.ok) {
    throw new Error(`universe-client: ${url} responded ${res.status}`);
  }
  return res.json() as Promise<T>;
}

type RawCandle = {
  timestamp?: number;
  time?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

function normalizeCandle(raw: RawCandle): Candle {
  return {
    timestamp: raw.timestamp ?? raw.time ?? 0,
    open: raw.open,
    high: raw.high,
    low: raw.low,
    close: raw.close,
    volume: raw.volume,
  };
}

export async function fetchCandles(
  symbol: string,
  timeframe: string,
): Promise<Candle[]> {
  const candleUrl = getCandleBaseUrl();
  const raw = await fetchJson<RawCandle[]>(
    candleUrl,
    `/candles/${encodeURIComponent(symbol)}/${encodeURIComponent(timeframe)}`,
  );
  const candles = raw.map(normalizeCandle).filter(
    (c) => c.timestamp > 0 && (c.high > 0 || c.close > 0),
  );
  if (candles.length === 0) {
    logger.warn(
      { symbol, timeframe, candleUrl },
      "universeClient: fetchCandles returned 0 candles — zone detection will be skipped",
    );
  }
  return candles;
}

export async function fetchMetrics(symbol: string): Promise<MarketMetrics> {
  return fetchJson<MarketMetrics>(getBaseUrl(), `/metrics/${encodeURIComponent(symbol)}`);
}

export interface PriceTick {
  price: number;
  bid?: number;
  ask?: number;
  timestamp: number;
}

export interface CandleTick {
  timeframe: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 30000;

export function subscribePrice(
  symbol: string,
  onTick: (tick: PriceTick) => void,
  onClose?: () => void,
  onCandle?: (candle: CandleTick) => void,
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
        const msg = JSON.parse(data.toString()) as {
          type: string;
          price?: number;
          bid?: number;
          ask?: number;
          timestamp?: number;
          timeframe?: string;
          open?: number;
          high?: number;
          low?: number;
          close?: number;
          volume?: number;
        };
        if (msg.type === "price" && msg.price != null && msg.timestamp != null) {
          onTick({ price: msg.price, bid: msg.bid, ask: msg.ask, timestamp: msg.timestamp });
        } else if (msg.type === "candle" && onCandle && msg.timeframe && msg.timestamp != null) {
          onCandle({
            timeframe: msg.timeframe,
            timestamp: msg.timestamp,
            open: msg.open ?? 0,
            high: msg.high ?? 0,
            low: msg.low ?? 0,
            close: msg.close ?? 0,
            volume: msg.volume,
          });
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
