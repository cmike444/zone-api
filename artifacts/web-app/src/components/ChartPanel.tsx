import { useEffect, useRef, useState, useCallback } from "react";
import * as echarts from "echarts";
import type { ECharts } from "echarts";
import { api } from "@/lib/api";
import { wsClient } from "@/lib/wsClient";
import type { Candle, ConfluentZone, ZoneEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

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

function buildZoneMarkArea(zone: ConfluentZone) {
  const isSupply = zone.direction === "supply";
  return {
    name: `${isSupply ? "Supply" : "Demand"} ${zone.id}`,
    type: "line" as const,
    markArea: {
      silent: true,
      data: [
        [
          {
            yAxis: zone.distalLine,
            itemStyle: {
              color: isSupply ? "rgba(248,81,73,0.12)" : "rgba(63,185,80,0.12)",
              borderColor: isSupply ? "#f85149" : "#3fb950",
              borderWidth: 1,
            },
          },
          { yAxis: zone.proximalLine },
        ],
      ],
    },
    data: [],
  };
}

function buildOptions(
  symbol: string,
  candles: Candle[],
  zones: ConfluentZone[],
  tf: TF,
) {
  const xs = candles.map((c) => fmtDate(c.timestamp, tf));
  const ys = candles.map((c) => [c.open, c.close, c.low, c.high]);
  const zoneSeries = zones.map(buildZoneMarkArea);

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
      scale: true,
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
      { type: "inside", start: 60, end: 100 },
      { type: "slider", height: 24, bottom: 0, fillerColor: "rgba(88,166,255,0.12)", handleStyle: { color: "#58a6ff" }, dataBackground: { areaStyle: { color: "rgba(88,166,255,0.06)" } }, textStyle: { color: "#8b949e" } },
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
