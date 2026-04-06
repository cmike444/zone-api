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
  ConfluentZone,
  ZoneEvent,
} from "hf-types";

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
