import type { RouteDocCategory } from "./route-doc.js";
import type { RouteRegistry } from "./register.js";

export const category: RouteDocCategory = {
  id: "system",
  title: "System",
  description: "Health and liveness endpoints.",
  order: 50,
};

export const ROUTES = {
  healthCheck: {
    method: "GET" as const,
    routerPath: "/healthz",
    fullPath: "/api/healthz",
    summary: "Health check",
    description: "Returns 200 OK when the API server process is running. No authentication required.",
    auth: false,
    params: [],
    exampleResponse: { status: "ok" },
  },
} satisfies RouteRegistry;
