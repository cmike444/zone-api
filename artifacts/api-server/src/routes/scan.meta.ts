import type { RouteDocCategory } from "./route-doc.js";
import type { RouteRegistry } from "./register.js";

export const category: RouteDocCategory = {
  id: "market",
  title: "Market Data",
  description: "Live price and market-metric lookups.",
  order: 30,
};

export const ROUTES = {
  scanSymbol: {
    method: "GET" as const,
    routerPath: "/:symbol",
    fullPath: "/api/scan/:symbol",
    summary: "Scan symbol metrics",
    description:
      "Fetches live market metrics from the symbol-universe service: IV rank, IVx, upcoming earnings date, and related data useful for position sizing.",
    auth: true,
    params: [
      { name: "symbol", in: "path" as const, required: true, type: "string", description: "Stock ticker." },
    ],
    exampleResponse: {
      symbol: "AAPL", ivRank: 42.3, ivx: 28.1, earningsDate: "2024-10-31", sectorIvRank: 38.7,
    },
  },
} satisfies RouteRegistry;
