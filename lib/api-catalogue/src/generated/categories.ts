// AUTO-GENERATED — do not edit by hand.
// Source: artifacts/api-server/src/routes/*.meta.ts
// Regenerate: pnpm --filter @workspace/api-catalogue run codegen
//   (runs automatically before every dev/build of @workspace/web-app)

import type { Category } from "../types.js";

export const CATEGORIES: Category[] = [
  {
    "id": "zones",
    "title": "Zones",
    "description": "Supply and demand zone queries. All zone objects share a common shape.",
    "endpoints": [
      {
        "method": "GET",
        "path": "/api/zones/top",
        "summary": "Get top zones",
        "description": "Returns the highest-confidence zones across all monitored symbols, ranked by combined_confidence descending.",
        "auth": true,
        "params": [
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "type": "integer",
            "description": "Max zones to return (default 10)."
          },
          {
            "name": "direction",
            "in": "query",
            "required": false,
            "type": "\"supply\" | \"demand\"",
            "description": "Filter by zone direction."
          }
        ],
        "exampleResponse": [
          {
            "id": 42,
            "symbol": "SPY",
            "direction": "supply",
            "timeframe": "1d",
            "proximalLine": 528.5,
            "distalLine": 531.2,
            "combinedConfidence": 0.91,
            "priceInside": false,
            "active": true
          }
        ]
      },
      {
        "method": "GET",
        "path": "/api/zones/active",
        "summary": "Get active zones",
        "description": "Returns all zones where the current price is currently inside the zone boundary (price_inside=true).",
        "auth": true,
        "params": [],
        "exampleResponse": [
          {
            "id": 7,
            "symbol": "AAPL",
            "direction": "demand",
            "timeframe": "60m",
            "proximalLine": 183,
            "distalLine": 181.4,
            "combinedConfidence": 0.78,
            "priceInside": true,
            "active": true
          }
        ]
      },
      {
        "method": "GET",
        "path": "/api/zones/:symbol/confluent",
        "summary": "Get confluent zones for a symbol",
        "description": "Returns multi-timeframe confluence zones — zones where at least two timeframes agree. Filtered to only actionable zones relative to current price.",
        "auth": true,
        "params": [
          {
            "name": "symbol",
            "in": "path",
            "required": true,
            "type": "string",
            "description": "Stock ticker, e.g. SPY."
          }
        ],
        "exampleResponse": [
          {
            "id": 18,
            "symbol": "SPY",
            "direction": "demand",
            "timeframes": [
              "60m",
              "15m"
            ],
            "proximalLine": 519.8,
            "distalLine": 518.1,
            "combinedConfidence": 0.88,
            "priceInside": false
          }
        ]
      },
      {
        "method": "POST",
        "path": "/api/zones/:symbol/refresh",
        "summary": "Refresh zones for a symbol",
        "description": "Triggers a fresh zone detection run for the given symbol across all timeframes and returns the updated zone count.",
        "auth": true,
        "params": [
          {
            "name": "symbol",
            "in": "path",
            "required": true,
            "type": "string",
            "description": "Stock ticker to refresh."
          }
        ],
        "exampleResponse": {
          "ok": true,
          "count": 12
        }
      },
      {
        "method": "GET",
        "path": "/api/zones/:symbol",
        "summary": "Get zones for a symbol",
        "description": "Returns all zones for a specific symbol, optionally filtered by timeframe.",
        "auth": true,
        "params": [
          {
            "name": "symbol",
            "in": "path",
            "required": true,
            "type": "string",
            "description": "Stock ticker, e.g. AAPL."
          },
          {
            "name": "timeframe",
            "in": "query",
            "required": false,
            "type": "string",
            "description": "Filter by timeframe, e.g. 60m, 1d."
          }
        ],
        "exampleResponse": [
          {
            "id": 3,
            "symbol": "AAPL",
            "direction": "supply",
            "timeframe": "1d",
            "proximalLine": 191,
            "distalLine": 193.5,
            "combinedConfidence": 0.85,
            "priceInside": false,
            "active": true
          }
        ]
      }
    ]
  },
  {
    "id": "symbols",
    "title": "Symbols",
    "description": "Manage the set of monitored symbols. Adding a symbol starts zone detection and live price streaming.",
    "endpoints": [
      {
        "method": "GET",
        "path": "/api/symbols",
        "summary": "List monitored symbols",
        "description": "Returns all symbols currently being monitored along with their latest price and zone count.",
        "auth": true,
        "params": [],
        "exampleResponse": [
          {
            "symbol": "SPY",
            "currentPrice": 528.14,
            "zoneCount": 9
          },
          {
            "symbol": "AAPL",
            "currentPrice": 183.45,
            "zoneCount": 6
          }
        ]
      },
      {
        "method": "POST",
        "path": "/api/symbols/:symbol",
        "summary": "Start monitoring a symbol",
        "description": "Adds a symbol to the monitored set, detects zones, schedules periodic refresh, and subscribes to the live price stream. Returns 201 on success.",
        "auth": true,
        "params": [
          {
            "name": "symbol",
            "in": "path",
            "required": true,
            "type": "string",
            "description": "Stock ticker to start monitoring."
          }
        ],
        "exampleResponse": {
          "symbol": "AAPL",
          "status": "monitoring"
        },
        "successCode": 201
      },
      {
        "method": "DELETE",
        "path": "/api/symbols/:symbol",
        "summary": "Stop monitoring a symbol",
        "description": "Removes a symbol from monitoring, cancels refresh jobs, unsubscribes from the price stream, and deletes all stored zones.",
        "auth": true,
        "params": [
          {
            "name": "symbol",
            "in": "path",
            "required": true,
            "type": "string",
            "description": "Stock ticker to stop monitoring."
          }
        ],
        "exampleResponse": {
          "symbol": "AAPL",
          "status": "stopped"
        }
      }
    ]
  },
  {
    "id": "market",
    "title": "Market Data",
    "description": "Live price and market-metric lookups.",
    "endpoints": [
      {
        "method": "GET",
        "path": "/api/candles/:symbol/:timeframe",
        "summary": "Get OHLCV candles for a symbol",
        "description": "Fetches historical OHLCV (open, high, low, close, volume) candle data for a symbol and timeframe from the symbol-universe service. Used to render the candlestick chart.",
        "auth": true,
        "params": [
          {
            "name": "symbol",
            "in": "path",
            "required": true,
            "type": "string",
            "description": "Stock ticker, e.g. AAPL."
          },
          {
            "name": "timeframe",
            "in": "path",
            "required": true,
            "type": "string",
            "description": "Candle timeframe. Allowed: 1m, 5m, 15m, 60m, 1d, 1w, 1M, 3M, 6M."
          }
        ],
        "exampleResponse": [
          {
            "timestamp": 1714000000000,
            "open": 183,
            "high": 184.5,
            "low": 182.8,
            "close": 183.9,
            "volume": 12345678
          }
        ]
      },
      {
        "method": "GET",
        "path": "/api/price/:symbol",
        "summary": "Get current price",
        "description": "Returns the latest cached price for a monitored symbol.",
        "auth": true,
        "params": [
          {
            "name": "symbol",
            "in": "path",
            "required": true,
            "type": "string",
            "description": "Stock ticker."
          }
        ],
        "exampleResponse": {
          "symbol": "SPY",
          "price": 528.14
        }
      },
      {
        "method": "GET",
        "path": "/api/scan/:symbol",
        "summary": "Scan symbol metrics",
        "description": "Fetches live market metrics from the symbol-universe service: IV rank, IVx, upcoming earnings date, and related data useful for position sizing.",
        "auth": true,
        "params": [
          {
            "name": "symbol",
            "in": "path",
            "required": true,
            "type": "string",
            "description": "Stock ticker."
          }
        ],
        "exampleResponse": {
          "symbol": "AAPL",
          "ivRank": 42.3,
          "ivx": 28.1,
          "earningsDate": "2024-10-31",
          "sectorIvRank": 38.7
        }
      }
    ]
  },
  {
    "id": "visualization",
    "title": "Visualization",
    "description": "Chart endpoints that render interactive ECharts views with zone overlays.",
    "endpoints": [
      {
        "method": "GET",
        "path": "/api/chart/:symbol",
        "summary": "Get chart for symbol",
        "description": "Returns an HTML page containing an interactive ECharts candlestick chart with supply/demand zone overlays. Open in a browser for visual analysis.",
        "auth": true,
        "params": [
          {
            "name": "symbol",
            "in": "path",
            "required": true,
            "type": "string",
            "description": "Stock ticker."
          }
        ],
        "exampleResponse": "<!-- HTML page with embedded ECharts candlestick chart -->",
        "responseContentType": "text/html"
      }
    ]
  },
  {
    "id": "system",
    "title": "System",
    "description": "Health and liveness endpoints.",
    "endpoints": [
      {
        "method": "GET",
        "path": "/api/healthz",
        "summary": "Health check",
        "description": "Returns 200 OK when the API server process is running. No authentication required.",
        "auth": false,
        "params": [],
        "exampleResponse": {
          "status": "ok"
        }
      }
    ]
  }
];
