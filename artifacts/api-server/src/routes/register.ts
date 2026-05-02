/**
 * Route registration with docs as a first-class part of the route definition.
 *
 * Every route is declared as a RouteEntry — a single object containing both
 * the Express routing info (method, routerPath) AND the documentation
 * (summary, description, params, exampleResponse, etc.).
 *
 * registerRoutes() consumes a RouteRegistry and registers each entry on the
 * Express router. TypeScript enforces that every declared route has a handler
 * and vice versa, so docs and implementation cannot diverge.
 *
 * Workflow:
 *   Add endpoint → add RouteEntry to *.meta.ts + handler to registerRoutes call
 *   Add route file → create yourfile.meta.ts + yourfile.ts + register in index.ts
 *   (codegen auto-discovers *.meta.ts files — no other files to touch)
 */

import type { Router, Request, Response, NextFunction, RequestHandler } from "express";

export interface RouteParam {
  name: string;
  in: "path" | "query" | "header";
  required: boolean;
  type: string;
  description: string;
}

export interface RouteEntry {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Path relative to the router's mount point, e.g. "/top" or "/:symbol/refresh". */
  routerPath: string;
  /** Absolute documented path for the docs page, e.g. "/api/zones/top". */
  fullPath: string;
  summary: string;
  description: string;
  auth: boolean;
  params: RouteParam[];
  exampleResponse: unknown;
  successCode?: number;
  responseContentType?: string;
}

export type RouteRegistry = Record<string, RouteEntry>;

/**
 * Handler type that uses Record<string, string> for req.params.
 * This avoids the @types/express@5 ParamsDictionary widening to string | string[].
 */
export type RouteHandlerFn = (
  req: Request<Record<string, string>>,
  res: Response,
  next: NextFunction,
) => void | Promise<void>;

/** Maps every key of a route registry to a route handler. */
export type HandlersFor<R extends RouteRegistry> = {
  [K in keyof R]: RouteHandlerFn;
};

/**
 * Registers every route in the registry onto the given Express router.
 * Object key insertion order is preserved by V8 — place more-specific paths
 * (e.g. "/top", "/active") before catch-all paths (e.g. "/:symbol").
 */
export function registerRoutes<R extends RouteRegistry>(
  router: Router,
  registry: R,
  handlers: HandlersFor<R>,
): void {
  for (const [key, def] of Object.entries(registry)) {
    const method = def.method.toLowerCase() as "get" | "post" | "put" | "patch" | "delete";
    router[method](def.routerPath, handlers[key as keyof R] as unknown as RequestHandler);
  }
}
