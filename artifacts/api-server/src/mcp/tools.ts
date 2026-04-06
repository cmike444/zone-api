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

export function registerTools(server: McpServer): void {
  server.tool(
    "monitor_symbol",
    "Start monitoring a symbol for supply/demand zones and price action",
    { symbol: z.string().describe("Stock ticker symbol, e.g. AAPL") },
    async ({ symbol }) => {
      const sym = symbol.toUpperCase();
      await detectZones(sym);
      scheduleRefresh(sym);
      subscribePriceForSymbol(sym);
      return {
        content: [{ type: "text", text: `Now monitoring ${sym} for supply/demand zones` }],
      };
    },
  );

  server.tool(
    "get_confluent_zones",
    "Get multi-timeframe confluence supply/demand zones for a symbol",
    { symbol: z.string().describe("Stock ticker symbol") },
    async ({ symbol }) => {
      const zones = getConfluentZones(symbol.toUpperCase());
      return {
        content: [{ type: "text", text: JSON.stringify(zones, null, 2) }],
      };
    },
  );

  server.tool(
    "get_top_zones",
    "Get top N supply/demand zones across all monitored symbols by confidence",
    {
      limit: z.number().int().min(1).max(100).optional().default(10).describe("Max zones to return"),
      direction: z.enum(["supply", "demand"]).optional().describe("Filter by zone direction"),
    },
    async ({ limit, direction }) => {
      let dir: ZoneDirection | undefined;
      if (direction === "supply") dir = ZoneDirection.Supply;
      else if (direction === "demand") dir = ZoneDirection.Demand;
      const zones = getTopZones(limit ?? 10, dir);
      return {
        content: [{ type: "text", text: JSON.stringify(zones, null, 2) }],
      };
    },
  );

  server.tool(
    "get_active_zones",
    "Get all zones where price is currently inside the zone (price_inside=1)",
    {},
    async () => {
      const zones = getActiveZones();
      return {
        content: [{ type: "text", text: JSON.stringify(zones, null, 2) }],
      };
    },
  );

  server.tool(
    "scan_symbol",
    "Get market metrics for a symbol (IV rank, IVx, earnings date) from symbol-universe",
    { symbol: z.string().describe("Stock ticker symbol") },
    async ({ symbol }) => {
      const metrics = await fetchMetrics(symbol.toUpperCase());
      return {
        content: [{ type: "text", text: JSON.stringify(metrics, null, 2) }],
      };
    },
  );

  server.tool(
    "get_chart_url",
    "Get the URL for a live ECharts candlestick + zone overlay chart page",
    { symbol: z.string().describe("Stock ticker symbol") },
    async ({ symbol }) => {
      const port = process.env["PORT"] ?? "3001";
      const url = `http://localhost:${port}/api/chart/${symbol.toUpperCase()}`;
      return {
        content: [{ type: "text", text: url }],
      };
    },
  );
}
