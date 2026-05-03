import type { McpTool } from "./types.js";

export const MCP_TOOLS: McpTool[] = [
  {
    name: "get_zones",
    description:
      "Get supply/demand zones for a symbol. When no timeframe is given, returns zones grouped by timeframe (e.g. {\"1d\": [...], \"60m\": [...]}). When a timeframe is specified, returns a flat list filtered to that timeframe.",
    params: [
      { name: "symbol", type: "string", required: true, description: "Stock ticker symbol, e.g. AAPL." },
      { name: "timeframe", type: "string", required: false, description: "Filter to a specific timeframe, e.g. 1d, 60m, 15m. Omit for grouped response." },
    ],
    returns: "Grouped Record<timeframe, Zone[]> when no timeframe given; Zone[] array when timeframe specified.",
    hints: { readOnly: true, destructive: false },
  },
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
