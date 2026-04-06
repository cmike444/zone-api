import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { ConfluentZone } from "@/lib/types";
import { wsClient } from "@/lib/wsClient";
import type { ZoneEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  symbol: string;
}

type ZoneStatus = {
  state: "entered" | "breached";
  price: number;
  at: number;
};

function fmt(n: number | undefined) {
  if (n == null) return "—";
  return n < 10 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`;
}

function relativeTime(ts: number): string {
  const sec = Math.round((Date.now() - ts) / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  return `${Math.round(sec / 60)}m ago`;
}

export function ZoneDetailPanel({ symbol }: Props) {
  const [zones, setZones] = useState<ConfluentZone[]>([]);
  const [statuses, setStatuses] = useState<Map<number, ZoneStatus>>(new Map());
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    let cancelled = false;
    api.getConfluentZones(symbol).then((z) => {
      if (!cancelled) setZones(z);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [symbol]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

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
        return;
      }

      if (event.type === "zone_entered") {
        setStatuses((prev) =>
          new Map(prev).set(event.zone.id, {
            state: "entered",
            price: event.price,
            at: Date.now(),
          }),
        );
        setZones((prev) =>
          prev.map((z) => (z.id === event.zone.id ? { ...z, priceInside: true } : z)),
        );
        return;
      }

      if (event.type === "zone_exited") {
        setStatuses((prev) => {
          const next = new Map(prev);
          next.delete(event.zone.id);
          return next;
        });
        setZones((prev) =>
          prev.map((z) => (z.id === event.zone.id ? { ...z, priceInside: false } : z)),
        );
        return;
      }

      if (event.type === "zone_breached") {
        setStatuses((prev) =>
          new Map(prev).set(event.zone.id, {
            state: "breached",
            price: event.price,
            at: Date.now(),
          }),
        );
        const t = setTimeout(() => {
          setZones((prev) => prev.filter((z) => z.id !== event.zone.id));
          setStatuses((prev) => {
            const next = new Map(prev);
            next.delete(event.zone.id);
            return next;
          });
          timersRef.current.delete(event.zone.id);
        }, 2500);
        timersRef.current.set(event.zone.id, t);
        return;
      }

      if (event.type === "zone_expired") {
        setZones((prev) => prev.filter((z) => z.id !== event.zone.id));
        setStatuses((prev) => {
          const next = new Map(prev);
          next.delete(event.zone.id);
          return next;
        });
      }
    });
  }, [symbol]);

  const supply = zones.filter((z) => z.direction === "supply");
  const demand = zones.filter((z) => z.direction === "demand");

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
              <ZoneRow key={z.id ?? i} zone={z} status={statuses.get(z.id)} />
            ))}
          </div>
        )}
        {demand.length > 0 && (
          <div className="px-2 pt-2">
            <div className="text-xs font-medium text-green-400 px-1 mb-1">Demand</div>
            {demand.map((z, i) => (
              <ZoneRow key={z.id ?? i} zone={z} status={statuses.get(z.id)} />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function ZoneRow({ zone, status }: { zone: ConfluentZone; status?: ZoneStatus }) {
  const isEntered = status?.state === "entered";
  const isBreached = status?.state === "breached";

  return (
    <div
      className={cn(
        "px-2 py-1.5 mb-0.5 rounded text-xs transition-colors duration-300",
        isBreached
          ? "bg-red-500/10 ring-1 ring-red-500/50"
          : isEntered
            ? "bg-amber-500/10 ring-1 ring-amber-400/50"
            : "bg-accent/50",
      )}
    >
      <div className="flex justify-between">
        <span className="text-muted-foreground">
          {Array.isArray(zone.timeframes) ? zone.timeframes.join(",") : "—"}
        </span>
        <span className={cn(
          "font-mono",
          isBreached ? "text-red-400" : isEntered ? "text-amber-400" : "text-primary",
        )}>
          {zone.combinedConfidence.toFixed(2)}
        </span>
      </div>

      <div className="font-mono text-foreground mt-0.5">
        {fmt(zone.proximalLine)} – {fmt(zone.distalLine)}
      </div>

      {isEntered && (
        <div className="flex items-center gap-1 mt-1 text-amber-400">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-400" />
          </span>
          <span>Inside {fmt(status.price)}</span>
          <span className="text-amber-400/50 ml-auto">{relativeTime(status.at)}</span>
        </div>
      )}

      {isBreached && (
        <div className="flex items-center gap-1 mt-1 text-red-400">
          <span className="text-red-400">✕</span>
          <span>Breached {fmt(status.price)}</span>
        </div>
      )}
    </div>
  );
}
