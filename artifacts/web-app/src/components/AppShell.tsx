import { useEffect, useState } from "react";
import { BarChart2, Scan, Wifi, WifiOff, Loader2 } from "lucide-react";
import { useStore, type View } from "@/lib/store";
import { wsStatus, type StatusType } from "@/lib/wsClient";
import { cn } from "@/lib/utils";

const NAV: { id: View; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: "dashboard", label: "Dashboard", Icon: BarChart2 },
  { id: "scanner", label: "Scanner", Icon: Scan },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { view, setView, apiConnected, selectedSymbol } = useStore();
  const [wsState, setWsState] = useState<StatusType>("idle");

  useEffect(() => {
    return wsStatus.subscribe(setWsState);
  }, []);

  const statusIcon =
    wsState === "connected" ? (
      <Wifi className="h-3.5 w-3.5 text-demand" />
    ) : wsState === "reconnecting" ? (
      <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
    ) : (
      <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
    );

  const apiStatusDot =
    apiConnected === null ? (
      <span className="h-2 w-2 rounded-full bg-muted-foreground" />
    ) : apiConnected ? (
      <span className="h-2 w-2 rounded-full bg-demand" />
    ) : (
      <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
    );

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <header className="flex items-center gap-4 px-4 py-2 border-b border-border bg-sidebar shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-primary flex items-center justify-center">
            <BarChart2 className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <span className="font-semibold text-sm text-foreground tracking-tight">
            zone<span className="text-primary">api</span>
          </span>
        </div>

        <nav className="flex items-center gap-0.5">
          {NAV.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors",
                view === id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </nav>

        {view === "dashboard" && selectedSymbol && (
          <span className="text-sm font-semibold text-primary ml-1">
            {selectedSymbol}
          </span>
        )}

        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            {apiStatusDot}
            <span>API</span>
          </span>
          <span className="flex items-center gap-1.5">
            {statusIcon}
            <span className="capitalize">{wsState === "idle" ? "—" : wsState}</span>
          </span>
        </div>
      </header>

      {apiConnected === false && (
        <div className="bg-destructive/10 border-b border-destructive/30 px-4 py-2 text-xs text-destructive text-center shrink-0">
          API server is unreachable. Check that the api-server workflow is running.
        </div>
      )}

      <main className="flex-1 min-h-0 flex overflow-hidden">{children}</main>
    </div>
  );
}
