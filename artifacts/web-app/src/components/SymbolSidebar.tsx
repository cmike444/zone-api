import { useState, useEffect, useRef } from "react";
import { TrendingUp, Plus, Trash2, Zap } from "lucide-react";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Props {
  activeZoneSymbols: Set<string>;
}

export function SymbolSidebar({ activeZoneSymbols }: Props) {
  const { symbols, selectedSymbol, prices, setSelectedSymbol, addSymbol, removeSymbol } =
    useStore();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(t);
  }, [error]);

  async function handleAdd() {
    const sym = input.trim().toUpperCase();
    if (!sym) return;
    if (symbols.some((s) => s.symbol === sym)) {
      setSelectedSymbol(sym);
      setInput("");
      return;
    }
    setLoading(sym);
    setError(null);
    try {
      await api.addSymbol(sym);
      addSymbol({ symbol: sym, zoneCount: 0 });
      setSelectedSymbol(sym);
      setInput("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add symbol");
    } finally {
      setLoading(null);
    }
  }

  async function handleRemove(sym: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await api.deleteSymbol(sym);
      removeSymbol(sym);
      if (selectedSymbol === sym) setSelectedSymbol(null);
    } catch {
    }
  }

  return (
    <aside className="flex flex-col w-56 min-w-[13rem] border-r border-border bg-sidebar h-full">
      <div className="flex items-center gap-2 px-3 py-3 border-b border-border">
        <TrendingUp className="h-4 w-4 text-primary shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Watchlist
        </span>
      </div>

      <div className="px-2 py-2 border-b border-border">
        <div className="flex gap-1">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Add symbol…"
            className="flex-1 min-w-0 bg-input text-sm px-2 py-1.5 rounded text-foreground placeholder:text-muted-foreground outline-none ring-0 focus:ring-1 focus:ring-primary border border-border"
          />
          <button
            onClick={handleAdd}
            disabled={!input.trim() || loading != null}
            className="px-2 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {error && (
          <p className="text-xs text-destructive mt-1 truncate">{error}</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {symbols.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            No symbols yet.<br />Type a ticker above.
          </div>
        )}
        {symbols.map((s) => {
          const price = prices[s.symbol];
          const isActive = activeZoneSymbols.has(s.symbol);
          const isSelected = selectedSymbol === s.symbol;
          const isLoading = loading === s.symbol;

          return (
            <button
              key={s.symbol}
              onClick={() => setSelectedSymbol(s.symbol)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors group hover:bg-accent",
                isSelected && "bg-accent",
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-foreground">
                    {s.symbol}
                  </span>
                  {isActive && (
                    <Zap className="h-3 w-3 text-primary shrink-0" aria-label="Price in active zone" />
                  )}
                  {isLoading && (
                    <span className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-primary font-mono">
                    {price != null ? `$${price.toFixed(2)}` : "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {s.zoneCount > 0 ? `${s.zoneCount}z` : ""}
                  </span>
                </div>
              </div>
              <button
                onClick={(e) => handleRemove(s.symbol, e)}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-destructive transition-all"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
