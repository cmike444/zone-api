import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { wsClient } from "@/lib/wsClient";
import { api } from "@/lib/api";
import type { ZoneEvent } from "@/lib/types";
import { SymbolSidebar } from "@/components/SymbolSidebar";
import { ChartPanel } from "@/components/ChartPanel";
import { ZoneDetailPanel } from "@/components/ZoneDetailPanel";

export default function Dashboard() {
  const { selectedSymbol, markZoneActive, markZoneInactive, setActiveZoneIds } = useStore();

  const [activeZonesBySymbol, setActiveZonesBySymbol] = useState<Map<string, Set<number>>>(
    new Map(),
  );

  const activeZoneSymbols = useMemo(
    () =>
      new Set(
        [...activeZonesBySymbol.entries()]
          .filter(([, ids]) => ids.size > 0)
          .map(([sym]) => sym),
      ),
    [activeZonesBySymbol],
  );

  useEffect(() => {
    let cancelled = false;
    api.getActiveZones().then((active) => {
      if (cancelled) return;
      const ids = new Set<number>(
        active.map((z) => z.id).filter((id): id is number => id != null),
      );
      setActiveZoneIds(ids);

      const map = new Map<string, Set<number>>();
      for (const zone of active) {
        if (zone.priceInside) {
          if (!map.has(zone.symbol)) map.set(zone.symbol, new Set());
          if (zone.id != null) map.get(zone.symbol)!.add(zone.id);
        }
      }
      setActiveZonesBySymbol(map);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [setActiveZoneIds]);

  useEffect(() => {
    const unsub = wsClient.subscribe((event: ZoneEvent) => {
      if (event.type === "zone_entered") {
        if (event.zone.id != null) markZoneActive(event.zone.id);
        setActiveZonesBySymbol((prev) => {
          const next = new Map(prev);
          if (!next.has(event.symbol)) next.set(event.symbol, new Set());
          const ids = new Set(next.get(event.symbol)!);
          if (event.zone.id != null) ids.add(event.zone.id);
          next.set(event.symbol, ids);
          return next;
        });
        return;
      }
      if (event.type === "zone_exited") {
        if (event.zone.id != null) markZoneInactive(event.zone.id);
        setActiveZonesBySymbol((prev) => {
          const next = new Map(prev);
          if (next.has(event.symbol) && event.zone.id != null) {
            const ids = new Set(next.get(event.symbol)!);
            ids.delete(event.zone.id);
            next.set(event.symbol, ids);
          }
          return next;
        });
        return;
      }
      if (event.type === "zone_breached") {
        if (event.zone.id != null) markZoneInactive(event.zone.id);
        setActiveZonesBySymbol((prev) => {
          const next = new Map(prev);
          if (next.has(event.symbol) && event.zone.id != null) {
            const ids = new Set(next.get(event.symbol)!);
            ids.delete(event.zone.id);
            next.set(event.symbol, ids);
          }
          return next;
        });
        return;
      }
      if (event.type === "zone_expired") {
        markZoneInactive(event.zone.id);
        setActiveZonesBySymbol((prev) => {
          const next = new Map(prev);
          for (const [sym, ids] of next.entries()) {
            if (ids.has(event.zone.id)) {
              const updated = new Set(ids);
              updated.delete(event.zone.id);
              next.set(sym, updated);
            }
          }
          return next;
        });
      }
    });
    return unsub;
  }, [markZoneActive, markZoneInactive]);

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <SymbolSidebar activeZoneSymbols={activeZoneSymbols} />

      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        {selectedSymbol ? (
          <ChartPanel symbol={selectedSymbol} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p className="text-base font-medium mb-1">No symbol selected</p>
              <p className="text-sm">Add a ticker in the sidebar to get started.</p>
            </div>
          </div>
        )}
      </div>

      {selectedSymbol && <ZoneDetailPanel symbol={selectedSymbol} />}
    </div>
  );
}
