import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AppShell } from "@/components/AppShell";
import { useStore } from "@/lib/store";
import { api, getWsUrl } from "@/lib/api";
import { wsClient } from "@/lib/wsClient";
import type { ZoneEvent } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import Dashboard from "@/pages/Dashboard";
import Scanner from "@/pages/Scanner";

const queryClient = new QueryClient();

function AppContent() {
  const { view, setSymbols, setApiConnected, updateQuote } = useStore();
  const { toast } = useToast();

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    async function ping() {
      try {
        await api.healthz();
        setApiConnected(true);
      } catch {
        setApiConnected(false);
      }
    }

    async function loadSymbols() {
      try {
        const syms = await api.listSymbols();
        setSymbols(syms);
      } catch {
      }
    }

    ping();
    loadSymbols();
    interval = setInterval(ping, 15_000);

    return () => clearInterval(interval);
  }, [setSymbols, setApiConnected]);

  useEffect(() => {
    wsClient.connect(getWsUrl);
    return () => wsClient.disconnect();
  }, []);

  useEffect(() => {
    const unsub = wsClient.subscribe((event: ZoneEvent) => {
      if (event.type === "price") {
        updateQuote(event.symbol, event.price, event.bid, event.ask);
        return;
      }
      if (event.type === "zone_entered") {
        toast({
          title: `Zone entered — ${event.symbol}`,
          description: `Price $${event.price.toFixed(2)} entered ${
            event.zone.direction === "supply" ? "supply" : "demand"
          } zone $${event.zone.proximalLine.toFixed(2)} – $${event.zone.distalLine.toFixed(2)}`,
        });
        return;
      }
      if (event.type === "zone_exited") {
        toast({
          title: `Zone exited — ${event.symbol}`,
          description: `Price $${event.price.toFixed(2)} left ${
            event.zone.direction === "supply" ? "supply" : "demand"
          } zone $${event.zone.proximalLine.toFixed(2)} – $${event.zone.distalLine.toFixed(2)}`,
        });
        return;
      }
      if (event.type === "zone_breached") {
        toast({
          title: `Zone breached — ${event.symbol}`,
          description: `Price $${event.price.toFixed(2)} broke through ${
            event.zone.direction === "supply" ? "supply" : "demand"
          } zone at $${event.zone.proximalLine.toFixed(2)}`,
          variant: "destructive",
        });
      }
    });
    return unsub;
  }, [updateQuote, toast]);

  return (
    <AppShell>
      {view === "dashboard" ? <Dashboard /> : <Scanner />}
    </AppShell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
