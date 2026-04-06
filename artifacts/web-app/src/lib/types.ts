export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export enum ZoneDirection {
  Supply = 0,
  Demand = 1,
}

export interface ConfluentZone {
  id?: number;
  symbol: string;
  timeframes: string[];
  direction: ZoneDirection;
  proximal: number;
  distal: number;
  combinedConfidence: number;
  entryPrice?: number;
  stopPrice?: number;
  targetPrice?: number;
  priceInside: boolean;
  computedAt: number;
}

export interface MonitoredSymbol {
  symbol: string;
  currentPrice?: number;
  zoneCount: number;
}

export type ZoneEventType =
  | "zone_created"
  | "zone_updated"
  | "zone_expired"
  | "zone_entered"
  | "zone_exited"
  | "zone_breached"
  | "price"
  | "candle";

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
}

export interface ZoneUpdatedEvent {
  type: "zone_updated";
  symbol: string;
  zone: ConfluentZone;
}

export interface ZoneExpiredEvent {
  type: "zone_expired";
  symbol: string;
  zoneId: number;
}

export interface ZoneEnteredEvent {
  type: "zone_entered";
  symbol: string;
  zone: ConfluentZone;
  price: number;
}

export interface ZoneExitedEvent {
  type: "zone_exited";
  symbol: string;
  zone: ConfluentZone;
  price: number;
}

export interface ZoneBreachedEvent {
  type: "zone_breached";
  symbol: string;
  zone: ConfluentZone;
  price: number;
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
