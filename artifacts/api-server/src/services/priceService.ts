import { subscribePrice, type CandleTick } from "./universeClient.js";
import {
  getConfluentZones,
  markPriceInside,
  markZoneBreached,
} from "../db/zoneRepo.js";
import { logZoneTouch } from "../db/eventLogRepo.js";
import { broadcastEvent } from "../websocket/server.js";
import type { ConfluentZone } from "../types.js";
import { logger } from "../lib/logger.js";

interface SymbolState {
  unsubscribe: () => void;
  priceInsideZones: Set<number>;
  currentPrice: number;
}

const symbolStates = new Map<string, SymbolState>();

function isInsideZone(price: number, zone: ConfluentZone): boolean {
  return price >= zone.distalLine && price <= zone.proximalLine;
}

function isBreachingZone(price: number, zone: ConfluentZone): boolean {
  if (zone.direction === "supply") {
    return price > zone.proximalLine;
  }
  return price < zone.distalLine;
}

export function subscribePriceForSymbol(symbol: string): void {
  if (symbolStates.has(symbol)) {
    logger.debug({ symbol }, "priceService: already subscribed");
    return;
  }

  const state: SymbolState = {
    unsubscribe: () => {},
    priceInsideZones: new Set(),
    currentPrice: 0,
  };

  function onCandle(candle: CandleTick): void {
    broadcastEvent(symbol, {
      type: "candle",
      symbol,
      timeframe: candle.timeframe,
      candle: {
        timestamp: candle.timestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      },
    });
  }

  const unsubscribe = subscribePrice(symbol, (tick) => {
    state.currentPrice = tick.price;
    const price = tick.price;
    const zones = getConfluentZones(symbol);

    broadcastEvent(symbol, {
      type: "price",
      symbol,
      price,
      bid: tick.bid,
      ask: tick.ask,
      timestamp: tick.timestamp,
    });

    for (const zone of zones) {
      if (!zone.id) continue;
      const id = zone.id;
      const wasInside = state.priceInsideZones.has(id);

      if (isBreachingZone(price, zone)) {
        if (wasInside || zone.priceInside) {
          state.priceInsideZones.delete(id);
          markZoneBreached(id);
          broadcastEvent(symbol, { type: "zone_breached", symbol, zone, price, timestamp: Date.now() });
          logZoneTouch({ zoneId: id, symbol, price, event: "zone_breached" });
          logger.debug({ symbol, zoneId: id, price }, "priceService: zone breached");
        }
      } else if (isInsideZone(price, zone)) {
        if (!wasInside) {
          state.priceInsideZones.add(id);
          markPriceInside(id, true);
          broadcastEvent(symbol, { type: "zone_entered", symbol, zone, price, timestamp: Date.now() });
          logZoneTouch({ zoneId: id, symbol, price, event: "zone_entered" });
          logger.debug({ symbol, zoneId: id, price }, "priceService: zone entered");
        }
      } else {
        if (wasInside) {
          state.priceInsideZones.delete(id);
          markPriceInside(id, false);
          broadcastEvent(symbol, { type: "zone_exited", symbol, zone, price, timestamp: Date.now() });
          logZoneTouch({ zoneId: id, symbol, price, event: "zone_exited" });
          logger.debug({ symbol, zoneId: id, price }, "priceService: zone exited");
        }
      }
    }
  }, undefined, onCandle);

  state.unsubscribe = unsubscribe;
  symbolStates.set(symbol, state);
  logger.info({ symbol }, "priceService: subscribed");
}

export function unsubscribePriceForSymbol(symbol: string): void {
  const state = symbolStates.get(symbol);
  if (state) {
    state.unsubscribe();
    symbolStates.delete(symbol);
    logger.info({ symbol }, "priceService: unsubscribed");
  }
}

export function getCurrentPrice(symbol: string): number | undefined {
  return symbolStates.get(symbol)?.currentPrice;
}

export function getMonitoredSymbols(): string[] {
  return Array.from(symbolStates.keys());
}
