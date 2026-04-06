import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AppShell } from "@/components/AppShell";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api";
import Dashboard from "@/pages/Dashboard";
import Scanner from "@/pages/Scanner";

const queryClient = new QueryClient();

function AppContent() {
  const { view, setSymbols, setApiConnected } = useStore();

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
