import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getConfluentZones,
  getTopZones,
  getActiveZones,
} from "../db/zoneRepo.js";
import { detectZones, scheduleRefresh } from "../services/zoneService.js";
import { subscribePriceForSymbol } from "../services/priceService.js";
import { fetchMetrics } from "../services/universeClient.js";
import { ZoneDirection } from "../types.js";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const EXTERNAL_READ = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

export function registerTools(server: McpServer): void {
  server.tool(
    "monitor_symbol",
    "Start monitoring a symbol for supply/demand zones and live price action. Detects zones across 1d/60m/15m timeframes, schedules periodic refresh, and subscribes to the price stream. Call this before any zone queries on a new symbol.",
    { symbol: z.string().describe("Stock ticker symbol, e.g. AAPL") },
    WRITE,
    async ({ symbol }) => {
      try {
        const sym = symbol.toUpperCase();
        await detectZones(sym);
        scheduleRefresh(sym);
        subscribePriceForSymbol(sym);
        return {
          content: [{ type: "text", text: `Now monitoring ${sym} for supply/demand zones` }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "get_confluent_zones",
    "Get multi-timeframe confluence supply/demand zones for a symbol. Returns zones where at least two timeframes (1d, 60m, 15m) agree, scored by combined_confidence. Higher confidence = stronger zone. The symbol must already be monitored.",
    { symbol: z.string().describe("Stock ticker symbol, e.g. AAPL") },
    READ_ONLY,
    async ({ symbol }) => {
      try {
        const zones = getConfluentZones(symbol.toUpperCase());
        return {
          content: [{ type: "text", text: JSON.stringify(zones, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "get_top_zones",
    "Get the highest-confidence supply/demand zones across all monitored symbols, ranked by combined_confidence. Optionally filter by direction (supply = resistance overhead, demand = support below).",
    {
      limit: z.number().int().min(1).max(100).optional().default(10).describe("Max number of zones to return (default 10)"),
      direction: z.enum(["supply", "demand"]).optional().describe("Filter by zone direction: supply (overhead resistance) or demand (below support)"),
    },
    READ_ONLY,
    async ({ limit, direction }) => {
      try {
        let dir: ZoneDirection | undefined;
        if (direction === "supply") dir = ZoneDirection.Supply;
        else if (direction === "demand") dir = ZoneDirection.Demand;
        const zones = getTopZones(limit ?? 10, dir);
        return {
          content: [{ type: "text", text: JSON.stringify(zones, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "get_active_zones",
    "Get all supply/demand zones where the current price is inside the zone boundary (price_inside=true). These are the highest-priority zones for trade entries and exits right now.",
    {},
    READ_ONLY,
    async () => {
      try {
        const zones = getActiveZones();
        return {
          content: [{ type: "text", text: JSON.stringify(zones, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "scan_symbol",
    "Get live market metrics for a symbol from the symbol-universe service: IV rank, IVx (implied volatility index), upcoming earnings date, and other key data. Useful for sizing positions and timing entries around volatility events.",
    { symbol: z.string().describe("Stock ticker symbol, e.g. AAPL") },
    EXTERNAL_READ,
    async ({ symbol }) => {
      try {
        const metrics = await fetchMetrics(symbol.toUpperCase());
        return {
          content: [{ type: "text", text: JSON.stringify(metrics, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "get_chart_url",
    "Get the URL for an interactive ECharts candlestick chart with supply/demand zone overlays for a symbol. Open the URL in a browser to see live price action against detected zones. Append ?token=<INTERNAL_API_TOKEN> if the server requires auth.",
    { symbol: z.string().describe("Stock ticker symbol, e.g. AAPL") },
    READ_ONLY,
    async ({ symbol }) => {
      try {
        const port = process.env["PORT"] ?? "3001";
        const url = `http://localhost:${port}/api/chart/${symbol.toUpperCase()}`;
        return {
          content: [{ type: "text", text: url }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    },
  );
}
