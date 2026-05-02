/**
 * Auto-discovers all *.meta.ts files in the API server's routes directory and
 * generates lib/api-catalogue/src/generated/categories.ts.
 *
 * Source of truth: artifacts/api-server/src/routes/*.meta.ts
 *   Each file exports:
 *     - ROUTES: RouteRegistry  — combined route+docs objects consumed by both
 *                                the Express router (via registerRoutes) and this codegen.
 *     - category: RouteDocCategory — { id, title, description, order }
 *
 * Because ROUTES is imported by the route .ts files to register handlers, it is
 * impossible to register an Express route without that same entry being picked
 * up here and surfaced on the docs page.
 *
 * HOW IT RUNS:
 *   pnpm --filter @workspace/api-catalogue run codegen
 *   — or automatically before every `dev` / `build` of @workspace/web-app.
 *
 * HOW TO ADD A NEW ENDPOINT:
 *   1. Add a RouteEntry to ROUTES in routes/yourfile.meta.ts
 *   2. Add the matching handler key to registerRoutes() in routes/yourfile.ts
 *      (TypeScript error if a declared route has no handler)
 *   3. On the next dev/build the docs page is automatically updated.
 *
 * HOW TO ADD A NEW ROUTE FILE:
 *   1. Create yourfile.meta.ts (ROUTES + category)
 *   2. Create yourfile.ts (registerRoutes)
 *   3. Register the router in index.ts
 *   No other files to touch — this script auto-discovers *.meta.ts files.
 */

import { readdirSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..", "..", "..");
const routesDir = resolve(root, "artifacts", "api-server", "src", "routes");
const outPath = resolve(__dirname, "..", "src", "generated", "categories.ts");

// ── Discover all *.meta.ts files ─────────────────────────────────────────────

const metaFiles = readdirSync(routesDir)
  .filter((f) => f.endsWith(".meta.ts"))
  .sort();

if (metaFiles.length === 0) {
  console.error(`No *.meta.ts files found in ${routesDir}`);
  process.exit(1);
}

// ── Import each meta file and collect routes ──────────────────────────────────

interface RouteEntry {
  method: string;
  fullPath: string;
  summary: string;
  description: string;
  auth: boolean;
  params: unknown[];
  exampleResponse: unknown;
  successCode?: number;
  responseContentType?: string;
}

interface MetaModule {
  category: { id: string; title: string; description: string; order: number };
  ROUTES: Record<string, RouteEntry>;
}

const categoryMap = new Map<string, {
  id: string; title: string; description: string; order: number;
  endpoints: unknown[];
}>();

for (const file of metaFiles) {
  const filePath = pathToFileURL(resolve(routesDir, file)).href;
  const mod = (await import(filePath)) as MetaModule;

  if (!mod.category || !mod.ROUTES) {
    console.warn(`  skipped ${file} (missing category or ROUTES export)`);
    continue;
  }

  const { id, title, description, order } = mod.category;
  if (!categoryMap.has(id)) {
    categoryMap.set(id, { id, title, description, order, endpoints: [] });
  }

  // Convert ROUTES registry entries into Endpoint objects for the docs page
  for (const entry of Object.values(mod.ROUTES)) {
    categoryMap.get(id)!.endpoints.push({
      method: entry.method,
      path: entry.fullPath,
      summary: entry.summary,
      description: entry.description,
      auth: entry.auth,
      params: entry.params,
      exampleResponse: entry.exampleResponse,
      ...(entry.successCode != null ? { successCode: entry.successCode } : {}),
      ...(entry.responseContentType != null ? { responseContentType: entry.responseContentType } : {}),
    });
  }
}

// Sort categories by their declared order
const categories = [...categoryMap.values()].sort((a, b) => a.order - b.order);

// Strip the internal `order` field before writing to the generated file
const output = categories.map(({ order: _order, ...rest }) => rest);

// ── Write generated TypeScript file ──────────────────────────────────────────

const ts = [
  `// AUTO-GENERATED — do not edit by hand.`,
  `// Source: artifacts/api-server/src/routes/*.meta.ts`,
  `// Regenerate: pnpm --filter @workspace/api-catalogue run codegen`,
  `//   (runs automatically before every dev/build of @workspace/web-app)`,
  ``,
  `import type { Category } from "../types.js";`,
  ``,
  `export const CATEGORIES: Category[] = ${JSON.stringify(output, null, 2)};`,
  ``,
].join("\n");

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, ts, "utf8");

const totalEndpoints = categories.reduce((n, c) => n + c.endpoints.length, 0);
console.log(`✓ Generated ${outPath.replace(root + "/", "")}`);
console.log(`  ${categories.length} categories, ${totalEndpoints} endpoints`);
console.log(`  Source files: ${metaFiles.join(", ")}`);
