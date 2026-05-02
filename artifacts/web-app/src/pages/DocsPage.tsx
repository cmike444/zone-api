import { useState } from "react";
import { Download, ChevronDown, ChevronRight, Lock, Zap, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Data model ─────────────────────────────────────────────────────────────

type HttpMethod = "GET" | "POST" | "DELETE";

interface Param {
  name: string;
  in: "path" | "query" | "header";
  required: boolean;
  type: string;
  description: string;
}

interface Endpoint {
  method: HttpMethod;
  path: string;
  summary: string;
  description: string;
  params: Param[];
  exampleResponse: unknown;
  auth: boolean;
  successCode?: number;
  responseContentType?: string;
}

interface Category {
  id: string;
  title: string;
  description: string;
  endpoints: Endpoint[];
}

interface WsEvent {
  type: string;
  description: string;
  payload: unknown;
}

interface WsStream {
  path: string;
  description: string;
  auth: boolean;
  events: WsEvent[];
}

interface McpTool {
  name: string;
  description: string;
  params: { name: string; type: string; required: boolean; description: string }[];
  returns: string;
  hints: { readOnly: boolean; destructive: boolean };
}

// ─── Catalogue ───────────────────────────────────────────────────────────────

const CATEGORIES: Category[] = [
  {
    id: "zones",
    title: "Zones",
    description: "Supply and demand zone queries. All zone objects share a common shape.",
    endpoints: [
      {
        method: "GET",
        path: "/api/zones/top",
        summary: "Get top zones",
        description:
          "Returns the highest-confidence zones across all monitored symbols, ranked by combined_confidence descending.",
        auth: true,
        params: [
          { name: "limit", in: "query", required: false, type: "integer", description: "Max zones to return (default 10)." },
          { name: "direction", in: "query", required: false, type: "\"supply\" | \"demand\"", description: "Filter by zone direction." },
        ],
        exampleResponse: [
          {
            id: 42,
            symbol: "SPY",
            direction: "supply",
            timeframe: "1d",
            proximalLine: 528.5,
            distalLine: 531.2,
            combinedConfidence: 0.91,
            priceInside: false,
            active: true,
          },
        ],
      },
      {
        method: "GET",
        path: "/api/zones/active",
        summary: "Get active zones",
        description: "Returns all zones where the current price is currently inside the zone boundary (price_inside=true).",
        auth: true,
        params: [],
        exampleResponse: [
          {
            id: 7,
            symbol: "AAPL",
            direction: "demand",
            timeframe: "60m",
            proximalLine: 183.0,
            distalLine: 181.4,
            combinedConfidence: 0.78,
            priceInside: true,
            active: true,
          },
        ],
      },
      {
        method: "GET",
        path: "/api/zones/:symbol",
        summary: "Get zones for a symbol",
        description: "Returns all zones for a specific symbol, optionally filtered by timeframe.",
        auth: true,
        params: [
          { name: "symbol", in: "path", required: true, type: "string", description: "Stock ticker, e.g. AAPL." },
          { name: "timeframe", in: "query", required: false, type: "string", description: "Filter by timeframe, e.g. 60m, 1d." },
        ],
        exampleResponse: [
          {
            id: 3,
            symbol: "AAPL",
            direction: "supply",
            timeframe: "1d",
            proximalLine: 191.0,
            distalLine: 193.5,
            combinedConfidence: 0.85,
            priceInside: false,
            active: true,
          },
        ],
      },
      {
        method: "GET",
        path: "/api/zones/:symbol/confluent",
        summary: "Get confluent zones for a symbol",
        description:
          "Returns multi-timeframe confluence zones — zones where at least two timeframes agree. Filtered to only actionable zones relative to current price.",
        auth: true,
        params: [
          { name: "symbol", in: "path", required: true, type: "string", description: "Stock ticker, e.g. SPY." },
        ],
        exampleResponse: [
          {
            id: 18,
            symbol: "SPY",
            direction: "demand",
            timeframes: ["60m", "15m"],
            proximalLine: 519.8,
            distalLine: 518.1,
            combinedConfidence: 0.88,
            priceInside: false,
          },
        ],
      },
      {
        method: "POST",
        path: "/api/zones/:symbol/refresh",
        summary: "Refresh zones for a symbol",
        description: "Triggers a fresh zone detection run for the given symbol across all timeframes and returns the updated zone count.",
        auth: true,
        params: [
          { name: "symbol", in: "path", required: true, type: "string", description: "Stock ticker to refresh." },
        ],
        exampleResponse: { ok: true, count: 12 },
      },
    ],
  },
  {
    id: "symbols",
    title: "Symbols",
    description: "Manage the set of monitored symbols. Adding a symbol starts zone detection and live price streaming.",
    endpoints: [
      {
        method: "GET",
        path: "/api/symbols",
        summary: "List monitored symbols",
        description: "Returns all symbols currently being monitored along with their latest price and zone count.",
        auth: true,
        params: [],
        exampleResponse: [
          { symbol: "SPY", currentPrice: 528.14, zoneCount: 9 },
          { symbol: "AAPL", currentPrice: 183.45, zoneCount: 6 },
        ],
      },
      {
        method: "POST",
        path: "/api/symbols/:symbol",
        summary: "Start monitoring a symbol",
        description:
          "Adds a symbol to the monitored set, detects zones, schedules periodic refresh, and subscribes to the live price stream. Returns 201 on success.",
        auth: true,
        successCode: 201,
        params: [
          { name: "symbol", in: "path", required: true, type: "string", description: "Stock ticker to start monitoring." },
        ],
        exampleResponse: { symbol: "AAPL", status: "monitoring" },
      },
      {
        method: "DELETE",
        path: "/api/symbols/:symbol",
        summary: "Stop monitoring a symbol",
        description: "Removes a symbol from monitoring, cancels refresh jobs, unsubscribes from the price stream, and deletes all stored zones.",
        auth: true,
        params: [
          { name: "symbol", in: "path", required: true, type: "string", description: "Stock ticker to stop monitoring." },
        ],
        exampleResponse: { symbol: "AAPL", status: "stopped" },
      },
    ],
  },
  {
    id: "market",
    title: "Market Data",
    description: "Live price and market-metric lookups.",
    endpoints: [
      {
        method: "GET",
        path: "/api/price/:symbol",
        summary: "Get current price",
        description: "Returns the latest cached price for a monitored symbol.",
        auth: true,
        params: [
          { name: "symbol", in: "path", required: true, type: "string", description: "Stock ticker." },
        ],
        exampleResponse: { symbol: "SPY", price: 528.14 },
      },
      {
        method: "GET",
        path: "/api/candles/:symbol/:timeframe",
        summary: "Get OHLCV candles for a symbol",
        description:
          "Fetches historical OHLCV (open, high, low, close, volume) candle data for a symbol and timeframe from the symbol-universe service. Used to render the candlestick chart.",
        auth: true,
        params: [
          { name: "symbol", in: "path", required: true, type: "string", description: "Stock ticker, e.g. AAPL." },
          {
            name: "timeframe",
            in: "path",
            required: true,
            type: "string",
            description: "Candle timeframe. Allowed: 1m, 5m, 15m, 60m, 1d, 1w, 1M, 3M, 6M.",
          },
        ],
        exampleResponse: [
          { timestamp: 1714000000000, open: 183.0, high: 184.5, low: 182.8, close: 183.9, volume: 12345678 },
        ],
      },
      {
        method: "GET",
        path: "/api/scan/:symbol",
        summary: "Scan symbol metrics",
        description:
          "Fetches live market metrics from the symbol-universe service: IV rank, IVx, upcoming earnings date, and related data useful for position sizing.",
        auth: true,
        params: [
          { name: "symbol", in: "path", required: true, type: "string", description: "Stock ticker." },
        ],
        exampleResponse: {
          symbol: "AAPL",
          ivRank: 42.3,
          ivx: 28.1,
          earningsDate: "2024-10-31",
          sectorIvRank: 38.7,
        },
      },
    ],
  },
  {
    id: "visualization",
    title: "Visualization",
    description: "Chart endpoints that render interactive ECharts views with zone overlays.",
    endpoints: [
      {
        method: "GET",
        path: "/api/chart/:symbol",
        summary: "Get chart for symbol",
        description:
          "Returns an HTML page containing an interactive ECharts candlestick chart with supply/demand zone overlays. Open in a browser for visual analysis.",
        auth: true,
        responseContentType: "text/html",
        params: [
          { name: "symbol", in: "path", required: true, type: "string", description: "Stock ticker." },
        ],
        exampleResponse: "<!-- HTML page with embedded ECharts candlestick chart -->",
      },
    ],
  },
  {
    id: "system",
    title: "System",
    description: "Health and liveness endpoints.",
    endpoints: [
      {
        method: "GET",
        path: "/api/healthz",
        summary: "Health check",
        description: "Returns 200 OK when the API server process is running. No authentication required.",
        auth: false,
        params: [],
        exampleResponse: { status: "ok" },
      },
    ],
  },
];

const ZONE_EXAMPLE = {
  id: 7,
  symbol: "AAPL",
  direction: "demand",
  timeframes: ["60m", "15m"],
  proximalLine: 183.0,
  distalLine: 181.4,
  combinedConfidence: 0.82,
  priceInside: false,
};

const WS_STREAMS: WsStream[] = [
  {
    path: "/stream  (alias: /api/stream)",
    description:
      "Global stream. Receives price updates and zone events for ALL monitored symbols. The server accepts both `/stream` and `/api/stream` — they are equivalent aliases.",
    auth: true,
    events: [
      {
        type: "price",
        description: "Emitted on every price tick for a monitored symbol.",
        payload: { type: "price", symbol: "SPY", price: 528.14, bid: 528.13, ask: 528.15, timestamp: 1714000000000 },
      },
      {
        type: "candle",
        description: "Emitted when a new OHLCV candle closes for a monitored symbol.",
        payload: {
          type: "candle",
          symbol: "SPY",
          timeframe: "60m",
          candle: { timestamp: 1714000000000, open: 527.0, high: 529.5, low: 526.8, close: 528.14, volume: 3400000 },
        },
      },
      {
        type: "zone_created",
        description: "A new confluent zone has been detected for the symbol.",
        payload: { type: "zone_created", symbol: "AAPL", zone: ZONE_EXAMPLE, timestamp: 1714000000000 },
      },
      {
        type: "zone_updated",
        description: "An existing confluent zone has been re-detected with an updated confidence score.",
        payload: { type: "zone_updated", symbol: "AAPL", zone: ZONE_EXAMPLE, timestamp: 1714000000000 },
      },
      {
        type: "zone_entered",
        description: "Current price has moved inside a zone boundary.",
        payload: { type: "zone_entered", symbol: "AAPL", zone: ZONE_EXAMPLE, price: 182.5, timestamp: 1714000000000 },
      },
      {
        type: "zone_exited",
        description: "Current price has moved back outside a zone boundary.",
        payload: { type: "zone_exited", symbol: "AAPL", zone: ZONE_EXAMPLE, price: 184.0, timestamp: 1714000000000 },
      },
      {
        type: "zone_breached",
        description: "Price has closed beyond the distal line, invalidating the zone.",
        payload: { type: "zone_breached", symbol: "AAPL", zone: ZONE_EXAMPLE, price: 180.9, timestamp: 1714000000000 },
      },
      {
        type: "zone_expired",
        description: "A previously detected zone has been removed during a zone refresh cycle.",
        payload: { type: "zone_expired", symbol: "AAPL", zone: ZONE_EXAMPLE, timestamp: 1714000000000 },
      },
    ],
  },
  {
    path: "/stream/:symbol  (alias: /api/stream/:symbol)",
    description:
      "Symbol-scoped stream. Receives all event types listed above but only for the subscribed symbol. Both `/stream/:symbol` and `/api/stream/:symbol` are accepted.",
    auth: true,
    events: [
      {
        type: "(same 8 event types as global stream)",
        description: "price, candle, zone_created, zone_updated, zone_entered, zone_exited, zone_breached, zone_expired — filtered to the subscribed symbol.",
        payload: { type: "price", symbol: "AAPL", price: 183.45, bid: 183.44, ask: 183.46, timestamp: 1714000000000 },
      },
    ],
  },
];

const MCP_TOOLS: McpTool[] = [
  {
    name: "monitor_symbol",
    description:
      "Start monitoring a symbol for supply/demand zones and live price action. Detects zones across 1d/60m/15m timeframes, schedules periodic refresh, and subscribes to the price stream. Call this before any zone queries on a new symbol.",
    params: [{ name: "symbol", type: "string", required: true, description: "Stock ticker symbol, e.g. AAPL." }],
    returns: 'Confirmation text: "Now monitoring {SYMBOL} for supply/demand zones"',
    hints: { readOnly: false, destructive: false },
  },
  {
    name: "get_confluent_zones",
    description:
      "Get multi-timeframe confluence supply/demand zones for a symbol. Returns zones where at least two timeframes agree, scored by combined_confidence. Higher confidence = stronger zone.",
    params: [{ name: "symbol", type: "string", required: true, description: "Stock ticker symbol." }],
    returns: "JSON array of confluent zone objects.",
    hints: { readOnly: true, destructive: false },
  },
  {
    name: "get_top_zones",
    description:
      "Get the highest-confidence supply/demand zones across all monitored symbols, ranked by combined_confidence. Optionally filter by direction.",
    params: [
      { name: "limit", type: "integer (1–100)", required: false, description: "Max zones to return (default 10)." },
      { name: "direction", type: "\"supply\" | \"demand\"", required: false, description: "Filter by zone direction." },
    ],
    returns: "JSON array of zone objects, sorted by combined_confidence descending.",
    hints: { readOnly: true, destructive: false },
  },
  {
    name: "get_active_zones",
    description:
      "Get all supply/demand zones where the current price is currently inside the zone boundary. These are highest-priority zones for trade entries and exits.",
    params: [],
    returns: "JSON array of active zone objects.",
    hints: { readOnly: true, destructive: false },
  },
  {
    name: "scan_symbol",
    description:
      "Get live market metrics for a symbol from the symbol-universe service: IV rank, IVx, upcoming earnings date, and other key data.",
    params: [{ name: "symbol", type: "string", required: true, description: "Stock ticker symbol." }],
    returns: "JSON object with ivRank, ivx, earningsDate, and related metrics.",
    hints: { readOnly: true, destructive: false },
  },
  {
    name: "get_chart_url",
    description:
      "Get the URL for an interactive ECharts candlestick chart with supply/demand zone overlays for a symbol. Open in a browser to visualize zones against live price action.",
    params: [{ name: "symbol", type: "string", required: true, description: "Stock ticker symbol." }],
    returns: "URL string pointing to the chart endpoint.",
    hints: { readOnly: true, destructive: false },
  },
];

// ─── OpenAPI generator ───────────────────────────────────────────────────────

function buildOpenApiSpec(): object {
  const paths: Record<string, unknown> = {};

  for (const cat of CATEGORIES) {
    for (const ep of cat.endpoints) {
      const key = ep.path.replace(/:([a-zA-Z]+)/g, "{$1}");
      if (!paths[key]) paths[key] = {};
      const pathParams = ep.params
        .filter((p) => p.in === "path")
        .map((p) => ({
          name: p.name,
          in: "path",
          required: p.required,
          description: p.description,
          schema: { type: p.type === "integer" ? "integer" : "string" },
        }));
      const queryParams = ep.params
        .filter((p) => p.in === "query")
        .map((p) => ({
          name: p.name,
          in: "query",
          required: p.required,
          description: p.description,
          schema: { type: p.type === "integer" ? "integer" : "string" },
        }));

      const security = ep.auth ? [{ bearerAuth: [] }] : undefined;
      const statusCode = String(ep.successCode ?? 200);
      const contentType = ep.responseContentType ?? "application/json";

      (paths[key] as Record<string, unknown>)[ep.method.toLowerCase()] = {
        tags: [cat.title],
        summary: ep.summary,
        description: ep.description,
        parameters: [...pathParams, ...queryParams],
        ...(security ? { security } : {}),
        responses: {
          [statusCode]: {
            description: "Success",
            content: {
              [contentType]: contentType === "application/json"
                ? { example: ep.exampleResponse }
                : { schema: { type: "string" } },
            },
          },
          ...(ep.auth
            ? { "401": { description: "Unauthorized — missing or invalid INTERNAL_API_TOKEN" } }
            : {}),
        },
      };
    }
  }

  return {
    openapi: "3.0.3",
    info: {
      title: "Zones API",
      version: "1.0.0",
      description:
        "Supply/demand zone intelligence API. Provides zone detection, live price streaming, market metrics, and MCP tool access for AI agents.",
    },
    servers: [{ url: "/", description: "API server (base URL)" }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "Set INTERNAL_API_TOKEN on the API server. Pass the same value as a Bearer token in the Authorization header.",
        },
      },
    },
    paths,
  };
}

// ─── Markdown generator ──────────────────────────────────────────────────────

function buildMarkdown(): string {
  const lines: string[] = [];

  lines.push("# Zones API Reference\n");
  lines.push(
    "> All REST endpoints require an `Authorization: Bearer <INTERNAL_API_TOKEN>` header unless marked **No auth required**.\n",
  );

  lines.push("## REST Endpoints\n");

  for (const cat of CATEGORIES) {
    lines.push(`### ${cat.title}\n`);
    lines.push(`${cat.description}\n`);

    for (const ep of cat.endpoints) {
      lines.push(`#### \`${ep.method} ${ep.path}\`\n`);
      lines.push(`${ep.description}\n`);
      if (!ep.auth) lines.push("**Authentication:** No auth required.\n");

      if (ep.params.length > 0) {
        lines.push("**Parameters:**\n");
        lines.push("| Name | In | Required | Type | Description |");
        lines.push("|------|----|----------|------|-------------|");
        for (const p of ep.params) {
          lines.push(`| \`${p.name}\` | ${p.in} | ${p.required ? "Yes" : "No"} | \`${p.type}\` | ${p.description} |`);
        }
        lines.push("");
      }

      lines.push("**Example response:**\n");
      lines.push("```json");
      lines.push(JSON.stringify(ep.exampleResponse, null, 2));
      lines.push("```\n");
    }
  }

  lines.push("---\n");
  lines.push("## WebSocket Streams\n");
  lines.push(
    "All WebSocket connections require authentication. Pass the token either as `Authorization: Bearer <token>` in the upgrade request headers, or as a `token` query parameter.\n",
  );

  for (const ws of WS_STREAMS) {
    lines.push(`### \`${ws.path}\`\n`);
    lines.push(`${ws.description}\n`);
    lines.push("**Events:**\n");
    for (const ev of ws.events) {
      lines.push(`#### \`${ev.type}\`\n`);
      lines.push(`${ev.description}\n`);
      lines.push("```json");
      lines.push(JSON.stringify(ev.payload, null, 2));
      lines.push("```\n");
    }
  }

  lines.push("---\n");
  lines.push("## MCP Interface\n");
  lines.push(
    "The MCP server is accessible at `POST /api/mcp`. Requires `Authorization: Bearer <INTERNAL_API_TOKEN>`. Use an MCP-compatible client or AI agent to call the following tools.\n",
  );

  for (const tool of MCP_TOOLS) {
    lines.push(`### \`${tool.name}\`\n`);
    lines.push(`${tool.description}\n`);
    if (tool.params.length > 0) {
      lines.push("**Parameters:**\n");
      lines.push("| Name | Type | Required | Description |");
      lines.push("|------|------|----------|-------------|");
      for (const p of tool.params) {
        lines.push(`| \`${p.name}\` | \`${p.type}\` | ${p.required ? "Yes" : "No"} | ${p.description} |`);
      }
      lines.push("");
    }
    lines.push(`**Returns:** ${tool.returns}\n`);
    lines.push(
      `**Hints:** read-only=${tool.hints.readOnly}, destructive=${tool.hints.destructive}\n`,
    );
  }

  return lines.join("\n");
}

// ─── Download helpers ────────────────────────────────────────────────────────

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

const METHOD_STYLES: Record<HttpMethod, string> = {
  GET: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
  POST: "bg-green-500/15 text-green-400 border border-green-500/30",
  DELETE: "bg-red-500/15 text-red-400 border border-red-500/30",
};

function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <span className={cn("px-2 py-0.5 rounded text-xs font-mono font-bold uppercase", METHOD_STYLES[method])}>
      {method}
    </span>
  );
}

function EndpointCard({ ep }: { ep: Endpoint }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-card hover:bg-accent/30 transition-colors text-left"
      >
        <MethodBadge method={ep.method} />
        <code className="text-sm font-mono text-foreground flex-1">{ep.path}</code>
        <span className="text-sm text-muted-foreground hidden sm:block">{ep.summary}</span>
        {ep.auth && (
          <Lock className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" aria-label="Requires authentication" />
        )}
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-3 bg-card/50 border-t border-border space-y-4">
          <p className="text-sm text-muted-foreground">{ep.description}</p>

          {ep.params.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Parameters</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-1 pr-4 font-medium">Name</th>
                      <th className="pb-1 pr-4 font-medium">In</th>
                      <th className="pb-1 pr-4 font-medium">Required</th>
                      <th className="pb-1 pr-4 font-medium">Type</th>
                      <th className="pb-1 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ep.params.map((p) => (
                      <tr key={p.name} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5 pr-4 font-mono text-foreground">{p.name}</td>
                        <td className="py-1.5 pr-4 text-muted-foreground">{p.in}</td>
                        <td className="py-1.5 pr-4">
                          {p.required ? (
                            <span className="text-supply text-xs font-medium">required</span>
                          ) : (
                            <span className="text-muted-foreground/60 text-xs">optional</span>
                          )}
                        </td>
                        <td className="py-1.5 pr-4 font-mono text-muted-foreground">{p.type}</td>
                        <td className="py-1.5 text-muted-foreground">{p.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Example Response</h4>
            <pre className="bg-background rounded-md p-3 text-xs font-mono text-muted-foreground overflow-x-auto border border-border">
              {JSON.stringify(ep.exampleResponse, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function CategorySection({ cat }: { cat: Category }) {
  const [open, setOpen] = useState(true);

  return (
    <section>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full text-left mb-3"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <h2 className="text-base font-semibold text-foreground">{cat.title}</h2>
        <span className="text-xs text-muted-foreground bg-accent/50 px-2 py-0.5 rounded-full">
          {cat.endpoints.length} endpoint{cat.endpoints.length !== 1 ? "s" : ""}
        </span>
      </button>
      {open && (
        <>
          <p className="text-sm text-muted-foreground mb-3 ml-6">{cat.description}</p>
          <div className="ml-6 space-y-2">
            {cat.endpoints.map((ep) => (
              <EndpointCard key={`${ep.method}${ep.path}`} ep={ep} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function WsSection({ stream }: { stream: WsStream }) {
  const [open, setOpen] = useState(true);

  return (
    <section className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-card hover:bg-accent/30 transition-colors text-left"
      >
        <span className="bg-purple-500/15 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded text-xs font-bold uppercase font-mono">
          WS
        </span>
        <code className="text-sm font-mono text-foreground flex-1">{stream.path}</code>
        {stream.auth && (
          <Lock className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" aria-label="Requires token" />
        )}
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-3 bg-card/50 border-t border-border space-y-4">
          <p className="text-sm text-muted-foreground">{stream.description}</p>

          <div>
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Event Types</h4>
            <div className="space-y-3">
              {stream.events.map((ev) => (
                <div key={ev.type} className="border border-border/50 rounded-md p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Zap className="h-3.5 w-3.5 text-yellow-400" />
                    <code className="text-sm font-mono text-yellow-400">{ev.type}</code>
                  </div>
                  <p className="text-xs text-muted-foreground">{ev.description}</p>
                  <pre className="bg-background rounded-md p-3 text-xs font-mono text-muted-foreground overflow-x-auto border border-border">
                    {JSON.stringify(ev.payload, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function McpToolCard({ tool }: { tool: McpTool }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-card hover:bg-accent/30 transition-colors text-left"
      >
        <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <code className="text-sm font-mono text-foreground flex-1">{tool.name}</code>
        {tool.hints.readOnly ? (
          <span className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded hidden sm:block">
            read-only
          </span>
        ) : (
          <span className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded hidden sm:block">
            write
          </span>
        )}
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-3 bg-card/50 border-t border-border space-y-4">
          <p className="text-sm text-muted-foreground">{tool.description}</p>

          {tool.params.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Parameters</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-1 pr-4 font-medium">Name</th>
                      <th className="pb-1 pr-4 font-medium">Type</th>
                      <th className="pb-1 pr-4 font-medium">Required</th>
                      <th className="pb-1 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tool.params.map((p) => (
                      <tr key={p.name} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5 pr-4 font-mono text-foreground">{p.name}</td>
                        <td className="py-1.5 pr-4 font-mono text-muted-foreground">{p.type}</td>
                        <td className="py-1.5 pr-4">
                          {p.required ? (
                            <span className="text-supply text-xs font-medium">required</span>
                          ) : (
                            <span className="text-muted-foreground/60 text-xs">optional</span>
                          )}
                        </td>
                        <td className="py-1.5 text-muted-foreground">{p.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-1">Returns</h4>
            <p className="text-sm text-muted-foreground">{tool.returns}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function DocsPage() {
  function handleDownloadOpenApi() {
    const spec = buildOpenApiSpec();
    downloadFile("openapi.json", JSON.stringify(spec, null, 2), "application/json");
  }

  function handleDownloadMarkdown() {
    const md = buildMarkdown();
    downloadFile("zones-api.md", md, "text/markdown");
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-10">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">API Reference</h1>
            <p className="mt-1 text-sm text-muted-foreground max-w-xl">
              Complete reference for the Zones API — REST endpoints, WebSocket streams, and MCP tools.
              All endpoints require an{" "}
              <code className="text-xs font-mono bg-accent/50 px-1 py-0.5 rounded">Authorization: Bearer</code> token
              unless otherwise noted.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={handleDownloadOpenApi}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium bg-accent hover:bg-accent/80 text-foreground transition-colors border border-border"
            >
              <Download className="h-3.5 w-3.5" />
              OpenAPI JSON
            </button>
            <button
              onClick={handleDownloadMarkdown}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium bg-accent hover:bg-accent/80 text-foreground transition-colors border border-border"
            >
              <Download className="h-3.5 w-3.5" />
              Markdown
            </button>
          </div>
        </div>

        {/* Authentication callout */}
        <div className="flex items-start gap-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-4 py-3">
          <Lock className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
          <div className="text-sm">
            <span className="font-semibold text-yellow-400">Authentication</span>
            <span className="text-muted-foreground">
              {" "}— Set the{" "}
              <code className="font-mono bg-accent/50 px-1 py-0.5 rounded text-xs">INTERNAL_API_TOKEN</code> environment
              variable on the API server. For REST requests, pass the same value as{" "}
              <code className="font-mono bg-accent/50 px-1 py-0.5 rounded text-xs">Authorization: Bearer &lt;token&gt;</code>.
              For WebSocket connections, pass it as{" "}
              <code className="font-mono bg-accent/50 px-1 py-0.5 rounded text-xs">Authorization: Bearer &lt;token&gt;</code>{" "}
              in the upgrade request headers, or as the{" "}
              <code className="font-mono bg-accent/50 px-1 py-0.5 rounded text-xs">token</code> query parameter.
            </span>
          </div>
        </div>

        {/* REST endpoints */}
        <div className="space-y-8">
          <div className="flex items-center gap-3 border-b border-border pb-2">
            <h2 className="text-lg font-bold text-foreground">REST Endpoints</h2>
            <span className="text-xs text-muted-foreground">Base path: /api</span>
          </div>
          {CATEGORIES.map((cat) => (
            <CategorySection key={cat.id} cat={cat} />
          ))}
        </div>

        {/* WebSocket streams */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 border-b border-border pb-2">
            <h2 className="text-lg font-bold text-foreground">WebSocket Streams</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Connect using a standard WebSocket client. Authenticate by passing{" "}
            <code className="font-mono bg-accent/50 px-1 py-0.5 rounded text-xs">Authorization: Bearer &lt;token&gt;</code>{" "}
            in the upgrade request headers, or append{" "}
            <code className="font-mono bg-accent/50 px-1 py-0.5 rounded text-xs">?token=&lt;token&gt;</code> to the URL.
            Messages are JSON-encoded{" "}
            <code className="font-mono bg-accent/50 px-1 py-0.5 rounded text-xs">StreamEvent</code> objects.
          </p>
          <div className="space-y-3">
            {WS_STREAMS.map((ws) => (
              <WsSection key={ws.path} stream={ws} />
            ))}
          </div>
        </div>

        {/* MCP interface */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 border-b border-border pb-2">
            <h2 className="text-lg font-bold text-foreground">MCP Interface</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            The Model Context Protocol server is accessible at{" "}
            <code className="font-mono bg-accent/50 px-1 py-0.5 rounded text-xs">POST /api/mcp</code>. Requires{" "}
            <code className="font-mono bg-accent/50 px-1 py-0.5 rounded text-xs">Authorization: Bearer &lt;token&gt;</code>.
            Use an MCP-compatible AI agent or client to call the tools below.
          </p>
          <div className="space-y-2">
            {MCP_TOOLS.map((tool) => (
              <McpToolCard key={tool.name} tool={tool} />
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-border text-xs text-muted-foreground text-center">
          Zones API — generated from source. Use the download buttons above to export the full spec.
        </div>
      </div>
    </div>
  );
}
