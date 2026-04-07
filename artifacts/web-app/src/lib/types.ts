export interface Zone {
  id: number;
  symbol: string;
  timeframe: string;
  direction: ZoneDirection;
  pattern: ZonePattern;
  proximalLine: number;
  distalLine: number;
  confidence: number;
  rrScore?: number;
  entryPrice?: number;
  stopPrice?: number;
  targetPrice?: number;
  startTimestamp: number;
  endTimestamp: number;
  detectedAt: number;
  isFresh: boolean;
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type ZoneDirection = "supply" | "demand";
export type ZonePattern = "RBD" | "DBD" | "DBR" | "RBR";

export interface ConfluentZone {
  id: number;
  symbol: string;
  timeframes: string[];
  direction: ZoneDirection;
  proximalLine: number;
  distalLine: number;
  combinedConfidence: number;
  entryPrice?: number;
  stopPrice?: number;
  targetPrice?: number;
  priceInside: boolean;
  computedAt: number;
  startTimestamp?: number;
}

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
  candle: Candle;
}

export interface ZoneCreatedEvent {
  type: "zone_created";
  symbol: string;
  zone: ConfluentZone;
  timestamp: number;
}

export interface ZoneUpdatedEvent {
  type: "zone_updated";
  symbol: string;
  zone: ConfluentZone;
  timestamp: number;
}

export interface ZoneExpiredEvent {
  type: "zone_expired";
  symbol: string;
  zone: ConfluentZone;
  timestamp: number;
}

export interface ZoneEnteredEvent {
  type: "zone_entered";
  symbol: string;
  zone: ConfluentZone;
  price: number;
  timestamp: number;
}

export interface ZoneExitedEvent {
  type: "zone_exited";
  symbol: string;
  zone: ConfluentZone;
  price: number;
  timestamp: number;
}

export interface ZoneBreachedEvent {
  type: "zone_breached";
  symbol: string;
  zone: ConfluentZone;
  price: number;
  timestamp: number;
}

export type ZoneEvent =
  | ZoneCreatedEvent
  | ZoneUpdatedEvent
  | ZoneExpiredEvent
  | ZoneEnteredEvent
  | ZoneExitedEvent
  | ZoneBreachedEvent
  | PriceEvent
  | CandleEvent;
