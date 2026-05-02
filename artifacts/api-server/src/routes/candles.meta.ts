import type { RouteDocCategory } from "./route-doc.js";
import type { RouteRegistry } from "./register.js";

export const category: RouteDocCategory = {
  id: "market",
  title: "Market Data",
  description: "Live price and market-metric lookups.",
  order: 30,
};

export const ROUTES = {
  getCandles: {
    method: "GET" as const,
    routerPath: "/:symbol/:timeframe",
    fullPath: "/api/candles/:symbol/:timeframe",
    summary: "Get OHLCV candles for a symbol",
    description:
      "Fetches historical OHLCV (open, high, low, close, volume) candle data for a symbol and timeframe from the symbol-universe service. Used to render the candlestick chart.",
    auth: true,
    params: [
      { name: "symbol",    in: "path" as const, required: true, type: "string", description: "Stock ticker, e.g. AAPL." },
      { name: "timeframe", in: "path" as const, required: true, type: "string", description: "Candle timeframe. Allowed: 1m, 5m, 15m, 60m, 1d, 1w, 1M, 3M, 6M." },
    ],
    exampleResponse: [
      { timestamp: 1714000000000, open: 183.0, high: 184.5, low: 182.8, close: 183.9, volume: 12345678 },
    ],
  },
} satisfies RouteRegistry;
