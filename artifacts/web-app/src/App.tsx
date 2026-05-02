import { useEffect } from "react";
import { Router, Route, Switch } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { useStore } from "@/lib/store";
import { api, getWsUrl } from "@/lib/api";
import { wsClient } from "@/lib/wsClient";
import type { ZoneEvent } from "@/lib/types";
import Dashboard from "@/pages/Dashboard";
import Scanner from "@/pages/Scanner";
import Settings from "@/pages/Settings";
import DocsPage from "@/pages/DocsPage";

const queryClient = new QueryClient();

function AppContent() {
  const { setSymbols, setApiConnected, updateQuote, setSelectedSymbol } = useStore();

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

        if (syms.length > 0) {
          const currentSelected = useStore.getState().selectedSymbol;
          if (!currentSelected) {
            const spy = syms.find((s) => s.symbol === "SPY");
            setSelectedSymbol(spy ? spy.symbol : syms[0]!.symbol);
          }
        }

        for (const sym of syms) {
          if (!sym.currentPrice) {
            api.getPrice(sym.symbol)
              .then((r) => updateQuote(r.symbol, r.price))
              .catch(() => {});
          }
        }
      } catch {
      }
    }

    ping();
    loadSymbols();
    interval = setInterval(ping, 15_000);

    return () => clearInterval(interval);
  }, [setSymbols, setApiConnected, updateQuote, setSelectedSymbol]);

  useEffect(() => {
    wsClient.connect(getWsUrl);
    return () => wsClient.disconnect();
  }, []);

  useEffect(() => {
    const unsub = wsClient.subscribe((event: ZoneEvent) => {
      if (event.type === "price") {
        updateQuote(event.symbol, event.price, event.bid, event.ask);
      }
    });
    return unsub;
  }, [updateQuote]);

  return (
    <AppShell>
      <Switch>
        <Route path="/docs" component={DocsPage} />
        <Route path="/scanner" component={Scanner} />
        <Route path="/settings" component={Settings} />
        <Route component={Dashboard} />
      </Switch>
    </AppShell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <AppContent />
      </Router>
    </QueryClientProvider>
  );
}

export default App;
