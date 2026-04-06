import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { wsClient, wsStatus } from "@/lib/wsClient";
import { getWsUrl } from "@/lib/api";
import type { ZoneEvent } from "@/lib/types";
import { SymbolSidebar } from "@/components/SymbolSidebar";
import { ChartPanel } from "@/components/ChartPanel";
import { ZoneDetailPanel } from "@/components/ZoneDetailPanel";
import { useToast } from "@/hooks/use-toast";
import { ZoneDirection } from "@/lib/types";

export default function Dashboard() {
  const { selectedSymbol, updatePrice, markZoneActive, markZoneInactive } = useStore();
  const { toast } = useToast();
  const [activeZoneSymbols, setActiveZoneSymbols] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedSymbol) {
      wsClient.disconnect();
      wsStatus.emit("idle");
      return;
    }
    wsClient.connect(selectedSymbol, getWsUrl);
  }, [selectedSymbol]);

  useEffect(() => {
    const unsub = wsClient.subscribe((event: ZoneEvent) => {
      if (event.type === "price") {
        updatePrice(event.symbol, event.price);
        return;
      }
      if (event.type === "zone_entered") {
        if (event.zone.id != null) markZoneActive(event.zone.id);
        setActiveZoneSymbols((prev) => new Set([...prev, event.symbol]));
        toast({
          title: `Zone entered — ${event.symbol}`,
          description: `Price $${event.price.toFixed(2)} entered ${
            event.zone.direction === ZoneDirection.Supply ? "supply" : "demand"
          } zone $${event.zone.proximal.toFixed(2)} – $${event.zone.distal.toFixed(2)}`,
        });
        return;
      }
      if (event.type === "zone_exited") {
        if (event.zone.id != null) markZoneInactive(event.zone.id);
        setActiveZoneSymbols((prev) => {
          const next = new Set(prev);
          next.delete(event.symbol);
          return next;
        });
        return;
      }
      if (event.type === "zone_breached") {
        toast({
          title: `Zone breached — ${event.symbol}`,
          description: `Price $${event.price.toFixed(2)} broke through ${
            event.zone.direction === ZoneDirection.Supply ? "supply" : "demand"
          } zone at $${event.zone.proximal.toFixed(2)}`,
          variant: "destructive",
        });
      }
    });
    return unsub;
  }, [updatePrice, markZoneActive, markZoneInactive, toast]);

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
