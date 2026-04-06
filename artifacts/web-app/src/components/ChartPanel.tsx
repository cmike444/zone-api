import { useEffect, useRef, useState, useCallback } from "react";
import * as echarts from "echarts";
import type { ECharts } from "echarts";
import { api } from "@/lib/api";
import { wsClient } from "@/lib/wsClient";
import type { Candle, ConfluentZone, ZoneEvent } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";

const TIMEFRAMES = ["1d", "60m", "15m", "5m", "1m"] as const;
type TF = (typeof TIMEFRAMES)[number];

interface Props {
  symbol: string;
}

function fmtDate(ts: number, tf: TF): string {
  const d = new Date(ts);
  if (tf === "1d") return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function findNearestCandleLabel(
  ts: number,
  candles: Candle[],
  tf: TF,
): string | undefined {
  if (candles.length === 0) return undefined;
  let best = candles[0]!;
  let bestDelta = Math.abs(best.timestamp - ts);
  for (const c of candles) {
    const delta = Math.abs(c.timestamp - ts);
    if (delta < bestDelta) {
      best = c;
      bestDelta = delta;
    }
  }
  return fmtDate(best.timestamp, tf);
}

function buildZoneMarkArea(zone: ConfluentZone, candles: Candle[], tf: TF) {
  const isSupply = zone.direction === "supply";
  const xStart =
    zone.startTimestamp != null
      ? findNearestCandleLabel(zone.startTimestamp, candles, tf)
      : undefined;

  const startPoint: Record<string, unknown> = {
    yAxis: zone.distalLine,
    itemStyle: {
      color: isSupply ? "rgba(248,81,73,0.12)" : "rgba(63,185,80,0.12)",
      borderColor: isSupply ? "#f85149" : "#3fb950",
      borderWidth: 1,
    },
  };
  if (xStart !== undefined) startPoint["xAxis"] = xStart;

  return {
    name: `${isSupply ? "Supply" : "Demand"} ${zone.id}`,
    type: "line" as const,
    markArea: {
      silent: true,
      data: [[startPoint, { yAxis: zone.proximalLine }]],
    },
    data: [],
  };
}

function buildYBounds(candles: Candle[], zones: ConfluentZone[]): { yMin: number; yMax: number } {
  const prices: number[] = [
    ...candles.map((c) => c.high),
    ...candles.map((c) => c.low),
    ...zones.flatMap((z) => [z.proximalLine, z.distalLine]),
  ];
  if (prices.length === 0) return { yMin: 0, yMax: 1 };
  const raw = { min: Math.min(...prices), max: Math.max(...prices) };
  const pad = (raw.max - raw.min) * 0.025;
  return { yMin: raw.min - pad, yMax: raw.max + pad };
}

function buildOptions(
  symbol: string,
  candles: Candle[],
  zones: ConfluentZone[],
  tf: TF,
) {
  const xs = candles.map((c) => fmtDate(c.timestamp, tf));
  const ys = candles.map((c) => [c.open, c.close, c.low, c.high]);
  const zoneSeries = zones.map((z) => buildZoneMarkArea(z, candles, tf));
  const { yMin, yMax } = buildYBounds(candles, zones);

  return {
    backgroundColor: "#0d1117",
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
      backgroundColor: "#161b22",
      borderColor: "#21262d",
      textStyle: { color: "#e6edf3", fontSize: 12 },
      formatter: (params: unknown[]) => {
        const p = (params as { name: string; value: unknown[] }[])[0];
        if (!p?.value) return "";
        const [o, c, l, h] = p.value as number[];
        const color = c >= o ? "#3fb950" : "#f85149";
        return `<div style="font-family: monospace; line-height:1.7">
          <strong style="color:${color}">${p.name}</strong><br/>
          O:${o?.toFixed(2)} H:${h?.toFixed(2)} L:${l?.toFixed(2)} C:${c?.toFixed(2)}
        </div>`;
      },
    },
    grid: { left: 12, right: 12, top: 8, bottom: 40, containLabel: true },
    xAxis: {
      type: "category",
      data: xs,
      axisLine: { lineStyle: { color: "#21262d" } },
      axisLabel: { color: "#8b949e", fontSize: 11 },
      splitLine: { show: false },
      boundaryGap: true,
    },
    yAxis: {
      min: yMin,
      max: yMax,
      axisLine: { lineStyle: { color: "#21262d" } },
      axisLabel: {
        color: "#8b949e",
        fontSize: 11,
        formatter: (v: number) => `$${v.toFixed(v < 10 ? 3 : 0)}`,
      },
      splitLine: { lineStyle: { color: "#21262d", type: "dashed" } },
      splitArea: { show: false },
    },
    dataZoom: [
      { type: "inside", start: 0, end: 100, filterMode: "none" },
      { type: "slider", height: 24, bottom: 0, start: 0, end: 100, fillerColor: "rgba(88,166,255,0.12)", handleStyle: { color: "#58a6ff" }, dataBackground: { areaStyle: { color: "rgba(88,166,255,0.06)" } }, textStyle: { color: "#8b949e" } },
    ],
    series: [
      {
        name: symbol,
        type: "candlestick",
        data: ys,
        itemStyle: {
          color: "#3fb950",
          color0: "#f85149",
          borderColor: "#3fb950",
          borderColor0: "#f85149",
        },
      },
      ...zoneSeries,
    ],
  };
}

export function ChartPanel({ symbol }: Props) {
  const { setSymbolZoneCount } = useStore();
  const chartRef = useRef<HTMLDivElement>(null);
  const echartsRef = useRef<ECharts | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  const zonesRef = useRef<Map<number, ConfluentZone>>(new Map());
  const [timeframe, setTimeframe] = useState<TF>("60m");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentTfRef = useRef(timeframe);
  currentTfRef.current = timeframe;

  const renderChart = useCallback(() => {
    if (!echartsRef.current) return;
    const zones = Array.from(zonesRef.current.values());
    echartsRef.current.setOption(
      buildOptions(symbol, candlesRef.current, zones, currentTfRef.current),
      true,
    );
  }, [symbol]);

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const chart = echarts.init(el, undefined, { renderer: "canvas" });
    echartsRef.current = chart;

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.dispose();
      echartsRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    candlesRef.current = [];
    zonesRef.current = new Map();

    async function load() {
      try {
        const [candles, zones] = await Promise.all([
          api.getCandles(symbol, timeframe),
          api.getConfluentZones(symbol),
        ]);
        if (cancelled) return;
        candlesRef.current = candles;
        zonesRef.current = new Map(zones.map((z) => [z.id, z]));
        setSymbolZoneCount(symbol, zones.length);
        renderChart();
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load chart");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe, renderChart]);

  useEffect(() => {
    const unsub = wsClient.subscribe((event: ZoneEvent) => {
      if (event.type === "candle" && event.symbol === symbol && event.timeframe === timeframe) {
        const c = event.candle;
        const arr = candlesRef.current;
        if (arr.length > 0 && arr[arr.length - 1].timestamp === c.timestamp) {
          arr[arr.length - 1] = c;
        } else {
          arr.push(c);
          if (arr.length > 500) arr.shift();
        }
        renderChart();
      } else if (
        (event.type === "zone_created" || event.type === "zone_updated") &&
        event.symbol === symbol
      ) {
        zonesRef.current.set(event.zone.id, event.zone);
        renderChart();
      } else if (event.type === "zone_expired" && event.symbol === symbol) {
        zonesRef.current.delete(event.zone.id);
        renderChart();
      } else if (event.type === "zone_breached" && event.symbol === symbol) {
        zonesRef.current.delete(event.zone.id);
        renderChart();
      }
    });
    return unsub;
  }, [symbol, timeframe, renderChart]);

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-background">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={cn(
              "px-2.5 py-1 text-xs rounded font-medium transition-colors",
              tf === timeframe
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent",
            )}
          >
            {tf}
          </button>
        ))}
        {loading && (
          <span className="ml-auto text-xs text-muted-foreground animate-pulse">
            Loading…
          </span>
        )}
        {error && (
          <span className="ml-auto text-xs text-destructive truncate max-w-xs">
            {error}
          </span>
        )}
      </div>
      <div ref={chartRef} className="flex-1 min-h-0" />
    </div>
  );
}
