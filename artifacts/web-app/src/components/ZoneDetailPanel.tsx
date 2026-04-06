import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ConfluentZone } from "@/lib/types";
import { ZoneDirection } from "@/lib/types";
import { wsClient } from "@/lib/wsClient";
import type { ZoneEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  symbol: string;
}

function fmt(n: number | undefined) {
  if (n == null) return "—";
  return n < 10 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`;
}

export function ZoneDetailPanel({ symbol }: Props) {
  const [zones, setZones] = useState<ConfluentZone[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.getConfluentZones(symbol).then((z) => {
      if (!cancelled) setZones(z);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [symbol]);

  useEffect(() => {
    return wsClient.subscribe((event: ZoneEvent) => {
      if (event.symbol !== symbol) return;
      if (event.type === "zone_created" || event.type === "zone_updated") {
        setZones((prev) => {
          const idx = prev.findIndex((z) => z.id === event.zone.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = event.zone;
            return next;
          }
          return [...prev, event.zone];
        });
      } else if (event.type === "zone_entered") {
        setZones((prev) =>
          prev.map((z) => (z.id === event.zone.id ? { ...z, priceInside: true } : z)),
        );
      } else if (event.type === "zone_exited") {
        setZones((prev) =>
          prev.map((z) => (z.id === event.zone.id ? { ...z, priceInside: false } : z)),
        );
      } else if (event.type === "zone_expired" || event.type === "zone_breached") {
        setZones((prev) => prev.filter((z) => z.id !== (event.type === "zone_expired" ? event.zoneId : event.zone?.id)));
      }
    });
  }, [symbol]);

  const supply = zones.filter((z) => z.direction === ZoneDirection.Supply);
  const demand = zones.filter((z) => z.direction === ZoneDirection.Demand);

  return (
    <aside className="w-52 min-w-[13rem] border-l border-border bg-sidebar flex flex-col">
      <div className="px-3 py-3 border-b border-border">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Zones
        </span>
      </div>
      <div className="flex-1 overflow-y-auto text-xs">
        {zones.length === 0 && (
          <p className="px-3 py-4 text-muted-foreground text-center">No zones detected yet.</p>
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
    </aside>
  );
}

function ZoneRow({ zone }: { zone: ConfluentZone }) {
  return (
    <div
      className={cn(
        "px-2 py-1.5 mb-0.5 rounded text-xs",
        zone.priceInside
          ? "bg-primary/10 border border-primary/30"
          : "bg-accent/50",
      )}
    >
      <div className="flex justify-between">
        <span className="text-muted-foreground">
          {Array.isArray(zone.timeframes) ? zone.timeframes.join(",") : "—"}
        </span>
        <span className="text-primary font-mono">
          {zone.combinedConfidence.toFixed(2)}
        </span>
      </div>
      <div className="font-mono text-foreground mt-0.5">
        {fmt(zone.proximal)} – {fmt(zone.distal)}
      </div>
      {zone.priceInside && (
        <div className="text-primary text-xs mt-0.5">● Price inside</div>
      )}
    </div>
  );
}
