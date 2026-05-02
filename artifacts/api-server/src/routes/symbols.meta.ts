import type { RouteDocCategory } from "./route-doc.js";
import type { RouteRegistry } from "./register.js";

export const category: RouteDocCategory = {
  id: "symbols",
  title: "Symbols",
  description: "Manage the set of monitored symbols. Adding a symbol starts zone detection and live price streaming.",
  order: 20,
};

// listSymbols "/" is declared before "/:symbol" to match first.
export const ROUTES = {
  listSymbols: {
    method: "GET" as const,
    routerPath: "/",
    fullPath: "/api/symbols",
    summary: "List monitored symbols",
    description: "Returns all symbols currently being monitored along with their latest price and zone count.",
    auth: true,
    params: [],
    exampleResponse: [
      { symbol: "SPY",  currentPrice: 528.14, zoneCount: 9 },
      { symbol: "AAPL", currentPrice: 183.45, zoneCount: 6 },
    ],
  },
  startMonitoring: {
    method: "POST" as const,
    routerPath: "/:symbol",
    fullPath: "/api/symbols/:symbol",
    summary: "Start monitoring a symbol",
    description:
      "Adds a symbol to the monitored set, detects zones, schedules periodic refresh, and subscribes to the live price stream. Returns 201 on success.",
    auth: true,
    successCode: 201,
    params: [
      { name: "symbol", in: "path" as const, required: true, type: "string", description: "Stock ticker to start monitoring." },
    ],
    exampleResponse: { symbol: "AAPL", status: "monitoring" },
  },
  stopMonitoring: {
    method: "DELETE" as const,
    routerPath: "/:symbol",
    fullPath: "/api/symbols/:symbol",
    summary: "Stop monitoring a symbol",
    description:
      "Removes a symbol from monitoring, cancels refresh jobs, unsubscribes from the price stream, and deletes all stored zones.",
    auth: true,
    params: [
      { name: "symbol", in: "path" as const, required: true, type: "string", description: "Stock ticker to stop monitoring." },
    ],
    exampleResponse: { symbol: "AAPL", status: "stopped" },
  },
} satisfies RouteRegistry;
