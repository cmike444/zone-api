import type { RouteDocCategory } from "./route-doc.js";
import type { RouteRegistry } from "./register.js";

export const category: RouteDocCategory = {
  id: "visualization",
  title: "Visualization",
  description: "Chart endpoints that render interactive ECharts views with zone overlays.",
  order: 40,
};

export const ROUTES = {
  getChart: {
    method: "GET" as const,
    routerPath: "/:symbol",
    fullPath: "/api/chart/:symbol",
    summary: "Get chart for symbol",
    description:
      "Returns an HTML page containing an interactive ECharts candlestick chart with supply/demand zone overlays. Open in a browser for visual analysis.",
    auth: true,
    responseContentType: "text/html",
    params: [
      { name: "symbol", in: "path" as const, required: true, type: "string", description: "Stock ticker." },
    ],
    exampleResponse: "<!-- HTML page with embedded ECharts candlestick chart -->",
  },
} satisfies RouteRegistry;
