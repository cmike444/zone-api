import { useEffect, useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import type { Zone, ZoneEvent } from "@/lib/types";
import { wsClient } from "@/lib/wsClient";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

interface Props {
  symbol: string;
}

function fmt(n: number | undefined) {
  if (n == null) return "—";
  return n < 10 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`;
}

export function ZoneDetailPanel({ symbol }: Props) {
  const { chartTimeframe } = useStore();
  const [zones, setZones] = useState<Zone[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);

  const loadZones = useCallback(async (sym: string, tf: string) => {
    try {
      const z = await api.getZones(sym, tf);
      setZones(z);
    } catch {}
  }, []);

  useEffect(() => {
    setZones([]);
    void loadZones(symbol, chartTimeframe);
  }, [symbol, chartTimeframe, loadZones]);

  useEffect(() => {
    return wsClient.subscribe((event: ZoneEvent) => {
      if (event.symbol !== symbol) return;
      if (
        event.type === "zone_created" ||
        event.type === "zone_updated" ||
        event.type === "zone_expired" ||
        event.type === "zone_breached"
      ) {
        void loadZones(symbol, chartTimeframe);
      }
    });
  }, [symbol, chartTimeframe, loadZones]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await api.refreshZones(symbol);
      await loadZones(symbol, chartTimeframe);
      setLastRefresh(Date.now());
    } catch {}
    setRefreshing(false);
  }

  const supply = zones.filter((z) => z.direction === "supply");
  const demand = zones.filter((z) => z.direction === "demand");

  return (
    <aside className="w-52 min-w-[13rem] border-l border-border bg-sidebar flex flex-col">
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Zones
          </span>
          <span className="ml-1.5 text-xs text-muted-foreground/60">
            {chartTimeframe}
          </span>
        </div>
        <button
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          title="Re-detect zones"
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto text-xs">
        {zones.length === 0 && !refreshing && (
          <p className="px-3 py-4 text-muted-foreground text-center">
            No zones for {chartTimeframe}.
            <br />
            <button
              onClick={() => void handleRefresh()}
              className="mt-2 text-primary hover:underline text-xs"
            >
              Detect now
            </button>
          </p>
        )}
        {refreshing && (
          <p className="px-3 py-4 text-muted-foreground text-center animate-pulse">
            Detecting zones…
          </p>
        )}
        {supply.length > 0 && (
          <div className="px-2 pt-2">
            <div className="text-xs font-medium text-red-400 px-1 mb-1">Supply</div>
            {supply.map((z, i) => (
              <ZoneRow key={z.id ?? i} zone={z} />
            ))}
          </div>
        )}
        {demand.length > 0 && (
          <div className="px-2 pt-2">
            <div className="text-xs font-medium text-green-400 px-1 mb-1">Demand</div>
            {demand.map((z, i) => (
              <ZoneRow key={z.id ?? i} zone={z} />
            ))}
          </div>
        )}
      </div>

      {lastRefresh != null && (
        <div className="px-3 py-1.5 border-t border-border text-xs text-muted-foreground/60 text-center">
          Updated {new Date(lastRefresh).toLocaleTimeString()}
        </div>
      )}
    </aside>
  );
}

function ZoneRow({ zone }: { zone: Zone }) {
  const isSupply = zone.direction === "supply";

  return (
    <div className="px-2 py-1.5 mb-0.5 rounded text-xs bg-accent/50">
      <div className="flex justify-between items-center">
        <span className="text-muted-foreground uppercase text-[10px]">
          {zone.pattern}
        </span>
        <span className={cn("font-mono", isSupply ? "text-red-400" : "text-green-400")}>
          {zone.confidence.toFixed(2)}
        </span>
      </div>
      <div className="font-mono text-foreground mt-0.5">
        {fmt(zone.proximalLine)} – {fmt(zone.distalLine)}
      </div>
    </div>
  );
}
