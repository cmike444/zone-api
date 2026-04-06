import { create } from "zustand";
import type { ConfluentZone, MonitoredSymbol } from "./types";

export type View = "dashboard" | "scanner";

interface AppState {
  view: View;
  selectedSymbol: string | null;
  symbols: MonitoredSymbol[];
  prices: Record<string, number>;
  activeZoneIds: Set<number>;
  apiConnected: boolean | null;

  setView: (v: View) => void;
  setSelectedSymbol: (sym: string | null) => void;
  setSymbols: (symbols: MonitoredSymbol[]) => void;
  updatePrice: (symbol: string, price: number) => void;
  addSymbol: (symbol: MonitoredSymbol) => void;
  removeSymbol: (symbol: string) => void;
  setActiveZoneIds: (ids: Set<number>) => void;
  markZoneActive: (id: number) => void;
  markZoneInactive: (id: number) => void;
  setApiConnected: (ok: boolean) => void;

  navigateToDashboard: (symbol: string) => void;
}

export const useStore = create<AppState>((set) => ({
  view: "dashboard",
  selectedSymbol: null,
  symbols: [],
  prices: {},
  activeZoneIds: new Set(),
  apiConnected: null,

  setView: (v) => set({ view: v }),

  setSelectedSymbol: (sym) => set({ selectedSymbol: sym }),

  setSymbols: (symbols) => {
    const prices: Record<string, number> = {};
    for (const s of symbols) {
      if (s.currentPrice != null) prices[s.symbol] = s.currentPrice;
    }
    set((state) => ({ symbols, prices: { ...state.prices, ...prices } }));
  },

  updatePrice: (symbol, price) =>
    set((state) => ({ prices: { ...state.prices, [symbol]: price } })),

  addSymbol: (sym) =>
    set((state) => ({
      symbols: state.symbols.some((s) => s.symbol === sym.symbol)
        ? state.symbols
        : [...state.symbols, sym],
    })),

  removeSymbol: (symbol) =>
    set((state) => ({
      symbols: state.symbols.filter((s) => s.symbol !== symbol),
    })),

  setActiveZoneIds: (ids) => set({ activeZoneIds: ids }),

  markZoneActive: (id) =>
    set((state) => {
      const next = new Set(state.activeZoneIds);
      next.add(id);
      return { activeZoneIds: next };
    }),

  markZoneInactive: (id) =>
    set((state) => {
      const next = new Set(state.activeZoneIds);
      next.delete(id);
      return { activeZoneIds: next };
    }),

  setApiConnected: (ok) => set({ apiConnected: ok }),

  navigateToDashboard: (symbol) =>
    set({ view: "dashboard", selectedSymbol: symbol }),
}));

export function hasActiveZoneForSymbol(
  zones: ConfluentZone[],
  activeIds: Set<number>,
  symbol: string,
): boolean {
  return zones.some(
    (z) => z.symbol === symbol && z.id != null && activeIds.has(z.id),
  );
}
