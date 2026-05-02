import type { RouteDocCategory } from "./route-doc.js";
import type { RouteRegistry } from "./register.js";

export const category: RouteDocCategory = {
  id: "market",
  title: "Market Data",
  description: "Live price and market-metric lookups.",
  order: 30,
};

export const ROUTES = {
  getCurrentPrice: {
    method: "GET" as const,
    routerPath: "/:symbol",
    fullPath: "/api/price/:symbol",
    summary: "Get current price",
    description: "Returns the latest cached price for a monitored symbol.",
    auth: true,
    params: [
      { name: "symbol", in: "path" as const, required: true, type: "string", description: "Stock ticker." },
    ],
    exampleResponse: { symbol: "SPY", price: 528.14 },
  },
} satisfies RouteRegistry;
