import { CandleType } from "@tastytrade/api";
import { getTastytradeClient } from "./tastytradeClient.js";
import type { Candle } from "../types.js";
import { logger } from "../lib/logger.js";

interface DxFeedCandleEvent {
  eventType?: string;
  eventSymbol?: string;
  time?: number;
  sequence?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  count?: number;
}

const TF_CONFIG: Record<
  string,
  { period: number; type: CandleType; daysBack: number }
> = {
  "15m": { period: 15, type: CandleType.Minute, daysBack: 10 },
  "60m": { period: 60, type: CandleType.Minute, daysBack: 30 },
  "1d": { period: 1, type: CandleType.Day, daysBack: 365 },
};

const CANDLE_TIMEOUT_MS = 12_000;

const streamerSymbolCache = new Map<string, string>();

const FUTURES_ROOT_SYMBOLS = new Set([
  "ES", "MES", "NQ", "MNQ", "YM", "MYM", "RTY", "M2K",
  "GC", "MGC", "SI", "SIL", "CL", "MCL", "NG", "RB",
  "ZB", "ZN", "ZF", "ZT", "HG", "PL", "PA",
  "6E", "6J", "6B", "6C", "VX",
]);

function isFutures(symbol: string): boolean {
  return FUTURES_ROOT_SYMBOLS.has(symbol.toUpperCase());
}

async function resolveStreamerSymbol(symbol: string): Promise<string | null> {
  const cached = streamerSymbolCache.get(symbol);
  if (cached !== undefined) return cached || null;

  if (!isFutures(symbol)) {
    streamerSymbolCache.set(symbol, symbol);
    return symbol;
  }

  const client = await getTastytradeClient();
  if (!client) return null;

  try {
    const result = await client.instrumentsService.getFutures({
      "product-code": symbol.toUpperCase(),
    } as Record<string, unknown>);

    const items: Record<string, unknown>[] = Array.isArray(result)
      ? result
      : ((result as Record<string, unknown>)?.["data"] as Record<string, unknown>)?.["items"] as Record<string, unknown>[] ?? [];

    const activeItems = items.filter(
      (it) => it["is-closing-only"] !== true && it["status"] !== "Expired",
    );

    if (!activeItems || activeItems.length === 0) {
      logger.warn(
        { symbol },
        "tastytradeCandles: no active futures contracts found, falling back to /SYMBOL",
      );
      const fallback = `/${symbol.toUpperCase()}`;
      streamerSymbolCache.set(symbol, fallback);
      return fallback;
    }

    const frontMonth = activeItems.sort((a, b) => {
      const aExp = ((a["expiration-date"] ?? a["expires-at"] ?? "") as string);
      const bExp = ((b["expiration-date"] ?? b["expires-at"] ?? "") as string);
      return aExp.localeCompare(bExp);
    })[0];

    const streamerSym =
      (frontMonth["streamer-symbol"] as string) ??
      (frontMonth["symbol"] as string) ??
      `/${symbol.toUpperCase()}`;

    logger.info(
      {
        symbol,
        streamerSym,
        expiresAt: frontMonth["expiration-date"] ?? frontMonth["expires-at"],
      },
      "tastytradeCandles: resolved futures streamer symbol",
    );

    streamerSymbolCache.set(symbol, streamerSym);
    return streamerSym;
  } catch (err) {
    logger.error({ err, symbol }, "tastytradeCandles: futures streamer symbol lookup failed");
    streamerSymbolCache.set(symbol, "");
    return null;
  }
}

export function clearStreamerSymbolCache(): void {
  streamerSymbolCache.clear();
}

export async function fetchCandlesViaDxLink(
  symbol: string,
  timeframe: string,
): Promise<Candle[] | null> {
  const tf = TF_CONFIG[timeframe];
  if (!tf) {
    logger.warn({ symbol, timeframe }, "tastytradeCandles: unsupported timeframe");
    return null;
  }

  const client = await getTastytradeClient();
  if (!client) return null;

  const streamerSymbol = await resolveStreamerSymbol(symbol);
  if (!streamerSymbol) {
    logger.warn({ symbol }, "tastytradeCandles: could not resolve streamer symbol");
    return null;
  }

  try {
    if (!(client.quoteStreamer as unknown as { isConnected?: boolean }).isConnected) {
      await client.quoteStreamer.connect();
    }
  } catch (err) {
    logger.error({ err, symbol }, "tastytradeCandles: DXLink connect failed");
    return null;
  }

  const collectedEvents: DxFeedCandleEvent[] = [];

  const listener = (events: DxFeedCandleEvent[]) => {
    for (const e of events) {
      if (e.eventType === "Candle" || e.open !== undefined) {
        collectedEvents.push(e);
      }
    }
  };

  client.quoteStreamer.addEventListener(
    listener as Parameters<typeof client.quoteStreamer.addEventListener>[0],
  );

  const fromTime = Date.now() - tf.daysBack * 86_400_000;

  try {
    client.quoteStreamer.subscribeCandles(
      streamerSymbol,
      fromTime,
      tf.period,
      tf.type,
    );
  } catch (err) {
    client.quoteStreamer.removeEventListener(
      listener as Parameters<typeof client.quoteStreamer.removeEventListener>[0],
    );
    logger.error({ err, symbol, timeframe }, "tastytradeCandles: subscribeCandles failed");
    return null;
  }

  await new Promise((resolve) => setTimeout(resolve, CANDLE_TIMEOUT_MS));

  client.quoteStreamer.removeEventListener(
    listener as Parameters<typeof client.quoteStreamer.removeEventListener>[0],
  );

  if (collectedEvents.length === 0) {
    logger.warn(
      { symbol, timeframe, streamerSymbol },
      "tastytradeCandles: no candle events received within timeout",
    );
    return null;
  }

  const candles: Candle[] = collectedEvents
    .filter(
      (e) =>
        e.time != null &&
        e.open != null &&
        e.high != null &&
        e.low != null &&
        e.close != null &&
        e.close > 0,
    )
    .map((e) => ({
      timestamp: e.time!,
      open: e.open!,
      high: e.high!,
      low: e.low!,
      close: e.close!,
      volume: e.volume,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  logger.info(
    { symbol, timeframe, streamerSymbol, count: candles.length },
    "tastytradeCandles: fetched via DXLink",
  );

  return candles;
}
