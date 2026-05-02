import type { WsStream } from "./types.js";

const ZONE_EXAMPLE = {
  id: 7,
  symbol: "AAPL",
  direction: "demand",
  timeframes: ["60m", "15m"],
  proximalLine: 183.0,
  distalLine: 181.4,
  combinedConfidence: 0.82,
  priceInside: false,
};

export const WS_STREAMS: WsStream[] = [
  {
    path: "/stream  (alias: /api/stream)",
    description:
      "Global stream. Receives price updates and zone events for ALL monitored symbols. The server accepts both `/stream` and `/api/stream` — they are equivalent aliases.",
    auth: true,
    events: [
      {
        type: "price",
        description: "Emitted on every price tick for a monitored symbol.",
        payload: { type: "price", symbol: "SPY", price: 528.14, bid: 528.13, ask: 528.15, timestamp: 1714000000000 },
      },
      {
        type: "candle",
        description: "Emitted when a new OHLCV candle closes for a monitored symbol.",
        payload: {
          type: "candle",
          symbol: "SPY",
          timeframe: "60m",
          candle: { timestamp: 1714000000000, open: 527.0, high: 529.5, low: 526.8, close: 528.14, volume: 3400000 },
        },
      },
      {
        type: "zone_created",
        description: "A new confluent zone has been detected for the symbol.",
        payload: { type: "zone_created", symbol: "AAPL", zone: ZONE_EXAMPLE, timestamp: 1714000000000 },
      },
      {
        type: "zone_updated",
        description: "An existing confluent zone has been re-detected with an updated confidence score.",
        payload: { type: "zone_updated", symbol: "AAPL", zone: ZONE_EXAMPLE, timestamp: 1714000000000 },
      },
      {
        type: "zone_entered",
        description: "Current price has moved inside a zone boundary.",
        payload: { type: "zone_entered", symbol: "AAPL", zone: ZONE_EXAMPLE, price: 182.5, timestamp: 1714000000000 },
      },
      {
        type: "zone_exited",
        description: "Current price has moved back outside a zone boundary.",
        payload: { type: "zone_exited", symbol: "AAPL", zone: ZONE_EXAMPLE, price: 184.0, timestamp: 1714000000000 },
      },
      {
        type: "zone_breached",
        description: "Price has closed beyond the distal line, invalidating the zone.",
        payload: { type: "zone_breached", symbol: "AAPL", zone: ZONE_EXAMPLE, price: 180.9, timestamp: 1714000000000 },
      },
      {
        type: "zone_expired",
        description: "A previously detected zone has been removed during a zone refresh cycle.",
        payload: { type: "zone_expired", symbol: "AAPL", zone: ZONE_EXAMPLE, timestamp: 1714000000000 },
      },
    ],
  },
  {
    path: "/stream/:symbol  (alias: /api/stream/:symbol)",
    description:
      "Symbol-scoped stream. Receives all event types listed above but only for the subscribed symbol. Both `/stream/:symbol` and `/api/stream/:symbol` are accepted.",
    auth: true,
    events: [
      {
        type: "(same 8 event types as global stream)",
        description: "price, candle, zone_created, zone_updated, zone_entered, zone_exited, zone_breached, zone_expired — filtered to the subscribed symbol.",
        payload: { type: "price", symbol: "AAPL", price: 183.45, bid: 183.44, ask: 183.46, timestamp: 1714000000000 },
      },
    ],
  },
];
