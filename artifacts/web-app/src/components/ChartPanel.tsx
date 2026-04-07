import { useEffect, useRef, useState, useCallback } from "react";
import * as echarts from "echarts";
import type { ECharts } from "echarts";
import { api } from "@/lib/api";
import { wsClient } from "@/lib/wsClient";
import type { Candle, Zone, ZoneEvent } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useStore, TIMEFRAMES, type Timeframe } from "@/lib/store";

interface Props {
  symbol: string;
}

const DEFAULT_VISIBLE_CANDLES = 120;

function fmtDate(ts: number, tf: Timeframe): string {
  const d = new Date(ts);
  if (tf === "1M" || tf === "3M" || tf === "6M") {
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }
  if (tf === "1w" || tf === "1d") {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function findNearestCandleLabel(ts: number, candles: Candle[], tf: Timeframe): string | undefined {
  if (candles.length === 0) return undefined;
  let best = candles[0]!;
  let bestDelta = Math.abs(best.timestamp - ts);
  for (const c of candles) {
    const delta = Math.abs(c.timestamp - ts);
    if (delta < bestDelta) { best = c; bestDelta = delta; }
  }
  return fmtDate(best.timestamp, tf);
}

function buildMarkAreaData(zones: Zone[], candles: Candle[], tf: Timeframe) {
  return zones.map((zone) => {
    const isSupply = zone.direction === "supply";
    const xStart =
      zone.startTimestamp != null
        ? findNearestCandleLabel(zone.startTimestamp, candles, tf)
        : undefined;
    const p0: Record<string, unknown> = {
      yAxis: zone.distalLine,
      itemStyle: {
        color: isSupply ? "rgba(248,81,73,0.13)" : "rgba(63,185,80,0.13)",
        borderColor: isSupply ? "rgba(248,81,73,0.55)" : "rgba(63,185,80,0.55)",
        borderWidth: 1,
      },
    };
    if (xStart !== undefined) p0["xAxis"] = xStart;
    return [p0, { yAxis: zone.proximalLine }];
  });
}

const priceFormatter = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  if (n >= 10000) return `$${(n / 1000).toFixed(1)}k`;
  if (n >= 100) return `$${n.toFixed(0)}`;
  if (n >= 10) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(3)}`;
};

function calcYBounds(candles: Candle[], startPct: number, endPct: number) {
  const n = candles.length;
  if (n === 0) return null;
  const lo = Math.max(0, Math.floor((startPct / 100) * n));
  const hi = Math.min(n - 1, Math.ceil((endPct / 100) * n));
  const slice = candles.slice(lo, hi + 1);
  if (slice.length === 0) return null;
  let yMin = Infinity, yMax = -Infinity;
  for (const c of slice) {
    if (c.low < yMin) yMin = c.low;
    if (c.high > yMax) yMax = c.high;
  }
  const pad = (yMax - yMin) * 0.08 || yMax * 0.01;
  return { min: yMin - pad, max: yMax + pad };
}

function applyYAxis(chart: ECharts, candles: Candle[]) {
  const opt = chart.getOption() as { dataZoom?: { start?: number; end?: number }[] };
  const dz = opt.dataZoom?.[0];
  const startPct = dz?.start ?? 0;
  const endPct = dz?.end ?? 100;
  const bounds = calcYBounds(candles, startPct, endPct);
  if (bounds) {
    chart.setOption({ yAxis: [{ min: bounds.min, max: bounds.max }] }, false);
  }
}

function defaultZoomStart(n: number) {
  return n > DEFAULT_VISIBLE_CANDLES
    ? Math.round((1 - DEFAULT_VISIBLE_CANDLES / n) * 100)
    : 0;
}

function buildFullOptions(
  symbol: string,
  candles: Candle[],
  zones: Zone[],
  tf: Timeframe,
) {
  const xs = candles.map((c) => fmtDate(c.timestamp, tf));
  const ys = candles.map((c) => [c.open, c.close, c.low, c.high]);
  const start = defaultZoomStart(candles.length);
  const markAreaData = buildMarkAreaData(zones, candles, tf);
  const bounds = calcYBounds(candles, start, 100);

  return {
    backgroundColor: "#0d1117",
    animation: false,
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross", crossStyle: { color: "#444c56" } },
      backgroundColor: "#161b22",
      borderColor: "#30363d",
      textStyle: { color: "#e6edf3", fontSize: 12 },
      formatter: (params: unknown[]) => {
        const p = (params as { name: string; value: unknown[] }[])[0];
        if (!p?.value) return "";
        const [o, c, l, h] = p.value as number[];
        const bullish = (c ?? 0) >= (o ?? 0);
        const color = bullish ? "#3fb950" : "#f85149";
        const sign = bullish ? "▲" : "▼";
        const chg = ((c ?? 0) - (o ?? 0)).toFixed(2);
        const pct = (((c ?? 0) - (o ?? 0)) / (o ?? 1) * 100).toFixed(2);
        return [
          `<div style="font-family:monospace;font-size:12px;line-height:1.8;min-width:160px">`,
          `<div style="color:#8b949e;margin-bottom:2px">${p.name}</div>`,
          `<div style="display:grid;grid-template-columns:auto auto;gap:0 12px">`,
          `<span style="color:#8b949e">O</span><span>${priceFormatter(o ?? 0)}</span>`,
          `<span style="color:#8b949e">H</span><span>${priceFormatter(h ?? 0)}</span>`,
          `<span style="color:#8b949e">L</span><span>${priceFormatter(l ?? 0)}</span>`,
          `<span style="color:#8b949e">C</span><span>${priceFormatter(c ?? 0)}</span>`,
          `<span style="color:#8b949e">Chg</span><span style="color:${color}">${sign} ${chg} (${pct}%)</span>`,
          `</div></div>`,
        ].join("");
      },
    },
    grid: { left: 8, right: 8, top: 12, bottom: 52, containLabel: true },
    xAxis: {
      type: "category",
      data: xs,
      axisLine: { lineStyle: { color: "#30363d" } },
      axisTick: { lineStyle: { color: "#30363d" } },
      axisLabel: { color: "#8b949e", fontSize: 11, hideOverlap: true },
      splitLine: { show: false },
      boundaryGap: true,
    },
    yAxis: {
      min: bounds?.min,
      max: bounds?.max,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: "#8b949e",
        fontSize: 11,
        formatter: priceFormatter,
      },
      splitLine: { lineStyle: { color: "#21262d", type: "dashed" } },
      splitArea: { show: false },
    },
    dataZoom: [
      {
        type: "inside",
        start,
        end: 100,
        filterMode: "none",
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        preventDefaultMouseMove: false,
      },
      {
        type: "slider",
        height: 28,
        bottom: 4,
        start,
        end: 100,
        filterMode: "none",
        fillerColor: "rgba(88,166,255,0.10)",
        borderColor: "#30363d",
        handleStyle: { color: "#58a6ff", borderColor: "#58a6ff" },
        moveHandleStyle: { color: "#58a6ff" },
        dataBackground: {
          lineStyle: { color: "#30363d" },
          areaStyle: { color: "rgba(88,166,255,0.04)" },
        },
        selectedDataBackground: {
          lineStyle: { color: "#58a6ff" },
          areaStyle: { color: "rgba(88,166,255,0.08)" },
        },
        textStyle: { color: "#8b949e", fontSize: 10 },
        showDetail: false,
      },
    ],
    series: [
      {
        name: symbol,
        type: "candlestick" as const,
        data: ys,
        itemStyle: {
          color: "#3fb950",
          color0: "#f85149",
          borderColor: "#3fb950",
          borderColor0: "#f85149",
        },
        barMaxWidth: 12,
        markArea: {
          silent: true,
          data: markAreaData,
        },
      },
    ],
  };
}

function buildSeriesUpdate(symbol: string, candles: Candle[], zones: Zone[], tf: Timeframe) {
  const ys = candles.map((c) => [c.open, c.close, c.low, c.high]);
  const markAreaData = buildMarkAreaData(zones, candles, tf);
  return {
    series: [
      {
        name: symbol,
        type: "candlestick",
        data: ys,
        markArea: { silent: true, data: markAreaData },
      },
    ],
  };
}

export function ChartPanel({ symbol }: Props) {
  const { setSymbolZoneCount, chartTimeframe, setChartTimeframe } = useStore();
  const timeframe = chartTimeframe;
  const chartRef = useRef<HTMLDivElement>(null);
  const echartsRef = useRef<ECharts | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  const zonesRef = useRef<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentTfRef = useRef(timeframe);
  currentTfRef.current = timeframe;

  const renderFull = useCallback(() => {
    const chart = echartsRef.current;
    if (!chart) return;
    chart.setOption(
      buildFullOptions(symbol, candlesRef.current, zonesRef.current, currentTfRef.current),
      true,
    );
  }, [symbol]);

  const renderSeriesOnly = useCallback(() => {
    const chart = echartsRef.current;
    if (!chart) return;
    chart.setOption(
      buildSeriesUpdate(symbol, candlesRef.current, zonesRef.current, currentTfRef.current),
      false,
    );
    applyYAxis(chart, candlesRef.current);
  }, [symbol]);

  const reloadZones = useCallback(async (sym: string, tf: Timeframe) => {
    try {
      const zones = await api.getZones(sym, tf);
      if (currentTfRef.current !== tf) return;
      zonesRef.current = zones;
      setSymbolZoneCount(sym, zones.length);
      renderSeriesOnly();
    } catch {}
  }, [renderSeriesOnly, setSymbolZoneCount]);

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const chart = echarts.init(el, undefined, { renderer: "canvas" });
    echartsRef.current = chart;

    chart.on("datazoom", () => applyYAxis(chart, candlesRef.current));

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
    zonesRef.current = [];

    async function load() {
      try {
        const [candles, zones] = await Promise.all([
          api.getCandles(symbol, timeframe),
          api.getZones(symbol, timeframe),
        ]);
        if (cancelled) return;
        candlesRef.current = candles;
        zonesRef.current = zones;
        setSymbolZoneCount(symbol, zones.length);
        renderFull();
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load chart");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [symbol, timeframe, renderFull, setSymbolZoneCount]);

  useEffect(() => {
    const unsub = wsClient.subscribe((event: ZoneEvent) => {
      if (event.type === "candle" && event.symbol === symbol && event.timeframe === timeframe) {
        const c = event.candle;
        const arr = candlesRef.current;
        if (arr.length > 0 && arr[arr.length - 1]!.timestamp === c.timestamp) {
          arr[arr.length - 1] = c;
        } else {
          arr.push(c);
          if (arr.length > 500) arr.shift();
        }
        renderSeriesOnly();
      } else if (
        (event.type === "zone_created" || event.type === "zone_updated" ||
          event.type === "zone_expired" || event.type === "zone_breached") &&
        event.symbol === symbol
      ) {
        void reloadZones(symbol, currentTfRef.current);
      }
    });
    return unsub;
  }, [symbol, timeframe, renderSeriesOnly, reloadZones]);

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-background">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            onClick={() => setChartTimeframe(tf)}
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
