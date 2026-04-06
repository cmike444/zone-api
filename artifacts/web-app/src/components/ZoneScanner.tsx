import { useEffect, useState, useMemo } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { ConfluentZone } from "@/lib/types";
import { cn } from "@/lib/utils";

type SortKey = "symbol" | "combinedConfidence" | "proximalLine" | "distalLine" | "computedAt";
type Dir = "asc" | "desc";

const REFRESH_MS = 30_000;
const STALE_MS = 5 * 60 * 1000;

function fmt(n: number) {
  return n < 10 ? n.toFixed(3) : n.toFixed(2);
}

function SortIcon({ col, active, dir }: { col: string; active: string; dir: Dir }) {
  if (active !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
  return dir === "asc" ? (
    <ArrowUp className="h-3 w-3 text-primary" />
  ) : (
    <ArrowDown className="h-3 w-3 text-primary" />
  );
}

function zoneStatus(zone: ConfluentZone, activeIds: Set<number>): "active" | "stale" | "fresh" {
  if (zone.priceInside || activeIds.has(zone.id)) return "active";
  const age = Date.now() - zone.computedAt;
  if (age > STALE_MS) return "stale";
  return "fresh";
}

export function ZoneScanner() {
  const { navigateToDashboard, activeZoneIds } = useStore();
  const [zones, setZones] = useState<ConfluentZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [filterDir, setFilterDir] = useState<"all" | "supply" | "demand">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "stale" | "fresh">("all");
  const [minConf, setMinConf] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("combinedConfidence");
  const [sortDir, setSortDir] = useState<Dir>("desc");

  async function load() {
    setLoading(true);
    try {
      const [top, active] = await Promise.all([
        api.getTopZones(200),
        api.getActiveZones(),
      ]);
      const activeIds = new Set<number>(active.map((z) => z.id));
      useStore.getState().setActiveZoneIds(activeIds);

      const merged = new Map<number, ConfluentZone>();
      for (const z of top) merged.set(z.id, z);
      for (const z of active) {
        merged.set(z.id, { ...merged.get(z.id), ...z, priceInside: true });
      }
      setZones(Array.from(merged.values()));
      setLastRefresh(new Date());
    } catch {
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  function toggleSort(key: SortKey) {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return key;
      }
      setSortDir("desc");
      return key;
    });
  }

  const filtered = useMemo(() => {
    let list = zones;
    if (filterDir !== "all") {
      list = list.filter((z) => z.direction === filterDir);
    }
    if (filterStatus !== "all") {
      list = list.filter((z) => zoneStatus(z, activeZoneIds) === filterStatus);
    }
    if (minConf > 0) {
      list = list.filter((z) => z.combinedConfidence >= minConf);
    }
    return [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === "string" && typeof bv === "string"
          ? av.localeCompare(bv)
          : ((av as number) ?? 0) - ((bv as number) ?? 0);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [zones, filterDir, filterStatus, minConf, sortKey, sortDir, activeZoneIds]);

  const Th = ({
    label,
    col,
    className,
  }: {
    label: string;
    col: SortKey;
    className?: string;
  }) => (
    <th
      onClick={() => toggleSort(col)}
      className={cn(
        "text-left text-xs text-muted-foreground font-medium px-3 py-2 cursor-pointer select-none hover:text-foreground whitespace-nowrap",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <SortIcon col={col} active={sortKey} dir={sortDir} />
      </span>
    </th>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-background">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border flex-wrap">
        <div className="flex items-center gap-1">
          {(["all", "supply", "demand"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setFilterDir(d)}
              className={cn(
                "px-2.5 py-1 text-xs rounded font-medium transition-colors capitalize",
                filterDir === d
                  ? d === "all"
                    ? "bg-primary text-primary-foreground"
                    : d === "supply"
                    ? "bg-red-500/80 text-white"
                    : "bg-green-600/80 text-white"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent",
              )}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {(["all", "active", "stale", "fresh"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={cn(
                "px-2.5 py-1 text-xs rounded font-medium transition-colors capitalize",
                filterStatus === s
                  ? s === "active"
                    ? "bg-primary/80 text-primary-foreground"
                    : s === "stale"
                    ? "bg-yellow-600/80 text-white"
                    : "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent",
              )}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-1 min-w-[12rem]">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            Min confidence: <strong className="text-foreground">{minConf.toFixed(1)}</strong>
          </span>
          <input
            type="range"
            min={0}
            max={3}
            step={0.1}
            value={minConf}
            onChange={(e) => setMinConf(Number(e.target.value))}
            className="flex-1 accent-primary"
          />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {lastRefresh && (
            <span className="text-xs text-muted-foreground">
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-card border-b border-border z-10">
            <tr>
              <Th label="Symbol" col="symbol" />
              <th className="text-left text-xs text-muted-foreground font-medium px-3 py-2 whitespace-nowrap">
                Direction
              </th>
              <th className="text-left text-xs text-muted-foreground font-medium px-3 py-2 whitespace-nowrap">
                Timeframes
              </th>
              <Th label="Proximal" col="proximalLine" />
              <Th label="Distal" col="distalLine" />
              <Th label="Confidence" col="combinedConfidence" className="text-right" />
              <th className="text-left text-xs text-muted-foreground font-medium px-3 py-2 whitespace-nowrap">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="text-center text-muted-foreground text-sm py-12"
                >
                  {loading ? "Loading zones…" : "No zones match the current filters."}
                </td>
              </tr>
            )}
            {filtered.map((z, i) => {
              const isSupply = z.direction === "supply";
              const status = zoneStatus(z, activeZoneIds);

              return (
                <tr
                  key={z.id ?? i}
                  onClick={() => navigateToDashboard(z.symbol)}
                  className={cn(
                    "border-b border-border cursor-pointer transition-colors hover:bg-accent",
                    status === "active" && "active-zone-row",
                  )}
                >
                  <td className="px-3 py-2.5 font-semibold text-foreground">
                    {z.symbol}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        "text-xs font-medium px-1.5 py-0.5 rounded",
                        isSupply
                          ? "bg-red-500/10 text-red-400"
                          : "bg-green-500/10 text-green-400",
                      )}
                    >
                      {isSupply ? "Supply" : "Demand"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                    {Array.isArray(z.timeframes) ? z.timeframes.join(", ") : "—"}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-foreground">
                    ${fmt(z.proximalLine)}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-foreground">
                    ${fmt(z.distalLine)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="font-mono text-xs text-primary">
                      {z.combinedConfidence.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {status === "active" && (
                      <span className="text-xs font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                        ● Active
                      </span>
                    )}
                    {status === "stale" && (
                      <span className="text-xs font-medium text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded">
                        Stale
                      </span>
                    )}
                    {status === "fresh" && (
                      <span className="text-xs text-muted-foreground">
                        Fresh
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
        {filtered.length} zones • refreshes every 30s
      </div>
    </div>
  );
}
