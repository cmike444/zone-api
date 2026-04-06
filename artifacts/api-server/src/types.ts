export type {
  Candle,
  Timeframe,
  Quote,
  MarketMetrics,
  ZoneDirection,
  ZonePattern,
  ZoneEventType,
  AlgorithmZone,
  SupplyZone,
  DemandZone,
  Zone,
  ZoneEvent,
} from "hf-types";

import type { ConfluentZone as BaseConfluentZone } from "hf-types";
export type ConfluentZone = BaseConfluentZone & { startTimestamp?: number };

export interface MonitoredSymbol {
  symbol: string;
  currentPrice?: number;
  zoneCount: number;
}

export interface PriceEvent {
  type: "price";
  symbol: string;
  price: number;
  bid?: number;
  ask?: number;
  timestamp: number;
}

export interface CandleEvent {
  type: "candle";
  symbol: string;
  timeframe: string;
  candle: import("hf-types").Candle;
}

export type StreamEvent =
  | import("hf-types").ZoneEvent
  | PriceEvent
  | CandleEvent;
