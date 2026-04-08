import { create } from "zustand";
import type { ConfluentZone, MonitoredSymbol } from "./types";

export type View = "dashboard" | "scanner" | "settings";

export const TIMEFRAMES = ["1m", "5m", "15m", "60m", "1d", "1w", "1M", "3M", "6M"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export interface AppSettings {
  defaultTimeframe: Timeframe;
}

const SETTINGS_KEY = "zoneapi:settings";

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      return {
        defaultTimeframe: (TIMEFRAMES as readonly string[]).includes(parsed.defaultTimeframe ?? "")
          ? (parsed.defaultTimeframe as Timeframe)
          : "60m",
      };
    }
  } catch {}
  return { defaultTimeframe: "60m" };
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}

export interface SymbolQuote {
  price: number;
  bid?: number;
  ask?: number;
  ts: number;
}

interface AppState {
  view: View;
  selectedSymbol: string | null;
  symbols: MonitoredSymbol[];
  quotes: Record<string, SymbolQuote>;
  activeZoneIds: Set<number>;
  apiConnected: boolean | null;
  chartTimeframe: Timeframe;
  settings: AppSettings;

  setView: (v: View) => void;
  setSelectedSymbol: (sym: string | null) => void;
  setSymbols: (symbols: MonitoredSymbol[]) => void;
  updateQuote: (symbol: string, price: number, bid?: number, ask?: number) => void;
  addSymbol: (symbol: MonitoredSymbol) => void;
  removeSymbol: (symbol: string) => void;
  setActiveZoneIds: (ids: Set<number>) => void;
  markZoneActive: (id: number) => void;
  markZoneInactive: (id: number) => void;
  setApiConnected: (ok: boolean) => void;
  navigateToDashboard: (symbol: string, timeframe?: Timeframe) => void;
  setSymbolZoneCount: (symbol: string, count: number) => void;
  setChartTimeframe: (tf: Timeframe) => void;
  updateSettings: (settings: AppSettings) => void;
}

const initialSettings = loadSettings();

export const useStore = create<AppState>((set) => ({
  view: "dashboard",
  selectedSymbol: null,
  symbols: [],
  quotes: {},
  activeZoneIds: new Set(),
  apiConnected: null,
  chartTimeframe: initialSettings.defaultTimeframe,
  settings: initialSettings,

  setView: (v) => set({ view: v }),

  setSelectedSymbol: (sym) => set({ selectedSymbol: sym }),

  setSymbols: (symbols) => {
    const quotes: Record<string, SymbolQuote> = {};
    for (const s of symbols) {
      if (s.currentPrice != null) {
        quotes[s.symbol] = { price: s.currentPrice, ts: Date.now() };
      }
    }
    set((state) => ({ symbols, quotes: { ...state.quotes, ...quotes } }));
  },

  updateQuote: (symbol, price, bid, ask) =>
    set((state) => ({
      quotes: {
        ...state.quotes,
        [symbol]: { price, bid, ask, ts: Date.now() },
      },
    })),

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

  navigateToDashboard: (symbol, timeframe) =>
    set((state) => ({
      view: "dashboard",
      selectedSymbol: symbol,
      chartTimeframe: timeframe ?? state.chartTimeframe,
    })),

  setSymbolZoneCount: (symbol, count) =>
    set((state) => ({
      symbols: state.symbols.map((s) =>
        s.symbol === symbol ? { ...s, zoneCount: count } : s,
      ),
    })),

  setChartTimeframe: (tf) => set({ chartTimeframe: tf }),

  updateSettings: (settings) => {
    saveSettings(settings);
    set({ settings, chartTimeframe: settings.defaultTimeframe });
  },
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
