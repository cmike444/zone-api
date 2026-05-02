import type { RouteDocCategory } from "./route-doc.js";
import type { RouteRegistry } from "./register.js";

export const category: RouteDocCategory = {
  id: "zones",
  title: "Zones",
  description: "Supply and demand zone queries. All zone objects share a common shape.",
  order: 10,
};

// More-specific paths (top, active) are declared before the /:symbol catch-all
// so registerRoutes preserves insertion order when registering on Express.
export const ROUTES = {
  getTop: {
    method: "GET" as const,
    routerPath: "/top",
    fullPath: "/api/zones/top",
    summary: "Get top zones",
    description:
      "Returns the highest-confidence zones across all monitored symbols, ranked by combined_confidence descending.",
    auth: true,
    params: [
      { name: "limit",     in: "query" as const, required: false, type: "integer",                description: "Max zones to return (default 10)." },
      { name: "direction", in: "query" as const, required: false, type: "\"supply\" | \"demand\"", description: "Filter by zone direction." },
    ],
    exampleResponse: [
      {
        id: 42, symbol: "SPY", direction: "supply", timeframe: "1d",
        proximalLine: 528.5, distalLine: 531.2, combinedConfidence: 0.91,
        priceInside: false, active: true,
      },
    ],
  },
  getActive: {
    method: "GET" as const,
    routerPath: "/active",
    fullPath: "/api/zones/active",
    summary: "Get active zones",
    description: "Returns all zones where the current price is currently inside the zone boundary (price_inside=true).",
    auth: true,
    params: [],
    exampleResponse: [
      {
        id: 7, symbol: "AAPL", direction: "demand", timeframe: "60m",
        proximalLine: 183.0, distalLine: 181.4, combinedConfidence: 0.78,
        priceInside: true, active: true,
      },
    ],
  },
  getConfluentBySymbol: {
    method: "GET" as const,
    routerPath: "/:symbol/confluent",
    fullPath: "/api/zones/:symbol/confluent",
    summary: "Get confluent zones for a symbol",
    description:
      "Returns multi-timeframe confluence zones — zones where at least two timeframes agree. Filtered to only actionable zones relative to current price.",
    auth: true,
    params: [
      { name: "symbol", in: "path" as const, required: true, type: "string", description: "Stock ticker, e.g. SPY." },
    ],
    exampleResponse: [
      {
        id: 18, symbol: "SPY", direction: "demand", timeframes: ["60m", "15m"],
        proximalLine: 519.8, distalLine: 518.1, combinedConfidence: 0.88, priceInside: false,
      },
    ],
  },
  refreshBySymbol: {
    method: "POST" as const,
    routerPath: "/:symbol/refresh",
    fullPath: "/api/zones/:symbol/refresh",
    summary: "Refresh zones for a symbol",
    description:
      "Triggers a fresh zone detection run for the given symbol across all timeframes and returns the updated zone count.",
    auth: true,
    params: [
      { name: "symbol", in: "path" as const, required: true, type: "string", description: "Stock ticker to refresh." },
    ],
    exampleResponse: { ok: true, count: 12 },
  },
  getBySymbol: {
    method: "GET" as const,
    routerPath: "/:symbol",
    fullPath: "/api/zones/:symbol",
    summary: "Get zones for a symbol",
    description: "Returns all zones for a specific symbol, optionally filtered by timeframe.",
    auth: true,
    params: [
      { name: "symbol",    in: "path" as const,  required: true,  type: "string", description: "Stock ticker, e.g. AAPL." },
      { name: "timeframe", in: "query" as const, required: false, type: "string", description: "Filter by timeframe, e.g. 60m, 1d." },
    ],
    exampleResponse: [
      {
        id: 3, symbol: "AAPL", direction: "supply", timeframe: "1d",
        proximalLine: 191.0, distalLine: 193.5, combinedConfidence: 0.85,
        priceInside: false, active: true,
      },
    ],
  },
} satisfies RouteRegistry;
