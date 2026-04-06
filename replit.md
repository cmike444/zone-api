# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: SQLite via `better-sqlite3`
- **Validation**: Zod
- **Build**: esbuild (ESM bundle via `build.mjs`)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — build all packages
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/api-server run build` — build API server only

## Artifacts

### `artifacts/api-server` — zone-api (Supply & Demand Intelligence Service)

Express 5 API server providing supply/demand zone detection over three transports.

**Transports**
- HTTP REST — default mode (requires `PORT`)
- WebSocket — attached to the HTTP server; clients subscribe to real-time zone/price events
- MCP stdio — started with `--mcp` flag; no `PORT` needed

**Authentication**
All routes (except `GET /api/healthz`) require `Authorization: Bearer <INTERNAL_API_TOKEN>`.
WebSocket upgrades accept the token via header or `?token=` query param.
Uses `crypto.timingSafeEqual` to prevent timing attacks.

**REST Routes**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/healthz` | Health probe (no auth) |
| GET | `/api/symbols` | List monitored symbols + current price + zone count |
| POST | `/api/symbols/:symbol` | Start monitoring a symbol (detects zones, schedules refresh, subscribes to price) |
| DELETE | `/api/symbols/:symbol` | Stop monitoring, clear zones from DB |
| GET | `/api/zones/top` | Top N zones by confidence (`?limit=10&direction=supply\|demand`) |
| GET | `/api/zones/active` | Zones where price is currently inside the zone |
| GET | `/api/zones/:symbol` | All zones for a symbol (`?timeframe=1d\|60m\|15m`) |
| GET | `/api/zones/:symbol/confluent` | Multi-timeframe confluent zones for a symbol |
| GET | `/api/price/:symbol` | Current price for a monitored symbol |
| GET | `/api/scan/:symbol` | Market metrics proxied from symbol-universe service |
| GET | `/api/chart/:symbol` | ECharts candlestick + zone overlay HTML page |

**MCP Tools** (6 total)
- `monitor_symbol` — start zone monitoring for a symbol
- `get_confluent_zones` — multi-TF confluence zones for a symbol
- `get_top_zones` — top N zones across all symbols
- `get_active_zones` — zones currently containing price
- `scan_symbol` — market metrics from symbol-universe
- `get_chart_url` — URL for the live chart page

**Database**
SQLite at `artifacts/data/zones.db` (configurable via `ZONES_DB_PATH`).
Tables: `zones`, `confluent_zones`, `zone_touches`.

**Key Dependencies**
- `@cmike444/supply-and-demand-zones` — zone detection (broken package.json; aliased in `build.mjs` to `dist/lib/index.js`)
- `better-sqlite3` — native SQLite (in `onlyBuiltDependencies` in `pnpm-workspace.yaml`)
- `ws` — WebSocket server
- `@modelcontextprotocol/sdk` — MCP stdio server
- `zod` — input validation

**Environment Variables**
| Variable | Required | Description |
|----------|----------|-------------|
| `INTERNAL_API_TOKEN` | Always | Symmetric bearer token for service auth |
| `PORT` | HTTP mode only | Port to listen on |
| `SYMBOL_UNIVERSE_URL` | For scan/price | URL of symbol-universe service |
| `ZONE_REFRESH_INTERVAL_MINUTES` | No (default 60) | How often to re-detect zones |
| `ZONES_DB_PATH` | No | Override SQLite file path |

**Source Structure**
```
src/
  index.ts              — Entry point (fail-fast validation, HTTP/MCP mode)
  app.ts                — Express app setup
  types.ts              — Shared TypeScript types
  vendor.d.ts           — Ambient module declaration for broken @cmike444 package
  lib/
    logger.ts           — Pino logger
  middlewares/
    internalAuth.ts     — timing-safe bearer token middleware + WS upgrade auth
  db/
    schema.ts           — SQLite schema + initDb()
    zoneRepo.ts         — Zone CRUD queries
  services/
    zoneService.ts      — Zone detection + confluence computation + refresh scheduling
    priceService.ts     — Price stream tracking per symbol
    universeClient.ts   — HTTP client for symbol-universe (injects auth headers)
  routes/
    index.ts            — Route mount + auth middleware
    health.ts           — /healthz
    symbols.ts          — /symbols
    zones.ts            — /zones
    price.ts            — /price
    scan.ts             — /scan
    chart.ts            — /chart
  websocket/
    server.ts           — WS server (upgrade auth + event broadcasting)
  mcp/
    server.ts           — MCP stdio server bootstrap
    tools.ts            — 6 MCP tool registrations
```

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
