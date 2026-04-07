import {
  identifyZones,
  filterFreshZones,
} from "@cmike444/supply-and-demand-zones";
import { fetchCandles } from "./universeClient.js";
import { getCurrentPrice } from "./priceService.js";
import {
  upsertZone,
  upsertConfluentZone,
  deleteConfluentZonesBySymbol,
  getConfluentZones,
  markZonesStaleBySymbolTimeframe,
} from "../db/zoneRepo.js";
import { logZoneTouch } from "../db/eventLogRepo.js";
import { broadcastEvent } from "../websocket/server.js";
import type {
  Candle,
  ConfluentZone,
  Zone,
  ZoneDirection,
  ZonePattern,
} from "../types.js";
import { logger } from "../lib/logger.js";

const ZONE_DIRECTION = { SUPPLY: 0, DEMAND: 1 } as const;
const ZONE_TYPE = { DROP_BASE_DROP: 0, RALLY_BASE_RALLY: 1, DROP_BASE_RALLY: 2, RALLY_BASE_DROP: 3 } as const;

const TIMEFRAMES = ["1d", "60m", "15m"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

const refreshTimers = new Map<string, NodeJS.Timeout>();

function getRefreshIntervalMs(): number {
  const minutes = parseInt(
    process.env["ZONE_REFRESH_INTERVAL_MINUTES"] ?? "60",
    10,
  );
  return (isNaN(minutes) ? 60 : minutes) * 60 * 1000;
}

function sdkDirectionToString(dir: number): ZoneDirection {
  return dir === ZONE_DIRECTION.SUPPLY ? "supply" : "demand";
}

type SdkCandle = { timestamp: number; open: number; high: number; low: number; close: number };

function computeIsFresh(
  sdkZone: Record<string, unknown>,
  sdkCandles: SdkCandle[],
): boolean {
  const proximalLine = sdkZone["proximalLine"] as number;
  const endTimestamp = sdkZone["endTimestamp"] as number;
  const isSupply = (sdkZone["direction"] as number) === ZONE_DIRECTION.SUPPLY;
  const postCandles = sdkCandles.filter((c) => c.timestamp > endTimestamp);

  if (isSupply) {
    if (postCandles.some((c) => c.high >= proximalLine)) return false;
    if (postCandles.length === 0) {
      const last = sdkCandles[sdkCandles.length - 1];
      if (last && last.close >= proximalLine) return false;
    }
  } else {
    if (postCandles.some((c) => c.low <= proximalLine)) return false;
    if (postCandles.length === 0) {
      const last = sdkCandles[sdkCandles.length - 1];
      if (last && last.close <= proximalLine) return false;
    }
  }
  return true;
}

function sdkTypeToPattern(type: number): ZonePattern {
  switch (type) {
    case ZONE_TYPE.RALLY_BASE_DROP:
      return "RBD";
    case ZONE_TYPE.DROP_BASE_DROP:
      return "DBD";
    case ZONE_TYPE.DROP_BASE_RALLY:
      return "DBR";
    case ZONE_TYPE.RALLY_BASE_RALLY:
      return "RBR";
    default:
      return "RBD";
  }
}

function zonesOverlap(
  proximalA: number,
  distalA: number,
  proximalB: number,
  distalB: number,
): boolean {
  return proximalA >= distalB && distalA <= proximalB;
}

function computeConfluentZones(
  symbol: string,
  zonesByTf: Map<Timeframe, Zone[]>,
): ConfluentZone[] {
  const allZones: (Zone & { timeframe: Timeframe })[] = [];
  for (const [tf, zones] of zonesByTf) {
    for (const z of zones) {
      allZones.push({ ...z, timeframe: tf });
    }
  }

  const confluent: ConfluentZone[] = [];
  const used = new Set<number>();

  for (let i = 0; i < allZones.length; i++) {
    if (used.has(i)) continue;
    const seed = allZones[i]!;
    const grouped: (Zone & { timeframe: Timeframe })[] = [seed];
    used.add(i);

    for (let j = i + 1; j < allZones.length; j++) {
      if (used.has(j)) continue;
      const candidate = allZones[j]!;
      if (candidate.direction !== seed.direction) continue;

      if (
        zonesOverlap(
          seed.proximalLine,
          seed.distalLine,
          candidate.proximalLine,
          candidate.distalLine,
        )
      ) {
        grouped.push(candidate);
        used.add(j);
      }
    }

    const timeframes = [...new Set(grouped.map((z) => z.timeframe))];
    const avgConfidence =
      grouped.reduce((sum, z) => sum + z.confidence, 0) / grouped.length;
    const tfBonus = Math.max(0, timeframes.length - 1) * 0.1;
    const combinedConfidence = Math.min(1, avgConfidence + tfBonus);

    const proximalLine = Math.max(...grouped.map((z) => z.proximalLine));
    const distalLine = Math.min(...grouped.map((z) => z.distalLine));

    const startTimestamp = Math.min(...grouped.map((z) => z.startTimestamp));

    confluent.push({
      id: 0,
      symbol,
      timeframes: timeframes as Timeframe[],
      direction: seed.direction,
      proximalLine,
      distalLine,
      combinedConfidence,
      priceInside: false,
      computedAt: Date.now(),
      startTimestamp,
    });
  }

  return confluent.sort((a, b) => b.combinedConfidence - a.combinedConfidence);
}

function safeNum(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function safeNumOpt(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function sdkZoneToInternal(
  sdkZone: Record<string, unknown>,
  symbol: string,
  timeframe: Timeframe,
): Zone {
  const direction = sdkDirectionToString(sdkZone["direction"] as number);
  const pattern = sdkTypeToPattern(sdkZone["type"] as number);
  const proximalLine = safeNum(sdkZone["proximalLine"], 0);
  const distalLine = safeNum(sdkZone["distalLine"], 0);
  return {
    id: 0,
    symbol,
    timeframe,
    direction,
    pattern,
    proximalLine,
    distalLine,
    confidence: safeNum(sdkZone["confidence"], 0.5),
    rrScore: safeNumOpt(sdkZone["rrScore"]),
    entryPrice: safeNumOpt(sdkZone["entryPrice"]),
    stopPrice: safeNumOpt(sdkZone["stopPrice"]),
    targetPrice: safeNumOpt(sdkZone["targetPrice"]),
    startTimestamp: safeNum(sdkZone["startTimestamp"], Date.now()),
    endTimestamp: safeNum(sdkZone["endTimestamp"], Date.now()),
    detectedAt: Date.now(),
    isFresh: true,
  };
}

export async function detectZones(symbol: string): Promise<void> {
  logger.info({ symbol }, "zoneService: detecting zones");

  const zonesByTf = new Map<Timeframe, Zone[]>();

  for (const tf of TIMEFRAMES) {
    try {
      const candles: Candle[] = await fetchCandles(symbol, tf);
      const sdkCandles = candles.map((c) => ({
        timestamp: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));

      const identified = identifyZones(sdkCandles);
      const filtered = filterFreshZones(
        identified.supplyZones ?? [],
        identified.demandZones ?? [],
      );

      logger.debug(
        {
          symbol,
          tf,
          rawSupply: (identified.supplyZones ?? []).length,
          rawDemand: (identified.demandZones ?? []).length,
          freshSupply: (filtered.supplyZones ?? []).length,
          freshDemand: (filtered.demandZones ?? []).length,
        },
        "zoneService: sdk zone counts",
      );

      const livePrice = getCurrentPrice(symbol);

      const tfZones: Zone[] = [
        ...(filtered.supplyZones ?? [])
          .map((z) =>
            sdkZoneToInternal(z as unknown as Record<string, unknown>, symbol, tf),
          )
          .filter((z) => livePrice === undefined || livePrice < z.proximalLine),
        ...(filtered.demandZones ?? [])
          .map((z) =>
            sdkZoneToInternal(z as unknown as Record<string, unknown>, symbol, tf),
          )
          .filter((z) => livePrice === undefined || livePrice > z.proximalLine),
      ];

      markZonesStaleBySymbolTimeframe(symbol, tf);

      for (const z of tfZones) {
        const id = upsertZone(z);
        z.id = id;
      }

      zonesByTf.set(tf, tfZones);
      logger.debug(
        { symbol, tf, count: tfZones.length },
        "zoneService: tf zones",
      );
    } catch (err) {
      logger.warn(
        { err, symbol, tf },
        "zoneService: failed to fetch/process candles for TF",
      );
    }
  }

  const prevConfluentZones = getConfluentZones(symbol);
  const newConfluentZones = computeConfluentZones(symbol, zonesByTf);

  const newKeySet = new Set(
    newConfluentZones.map(
      (z) => `${z.direction}:${z.proximalLine}:${z.distalLine}`,
    ),
  );

  // Broadcast and log expired events BEFORE deleting — old IDs must still exist in DB
  for (const old of prevConfluentZones) {
    const key = `${old.direction}:${old.proximalLine}:${old.distalLine}`;
    if (!newKeySet.has(key) && old.id) {
      broadcastEvent(symbol, {
        type: "zone_expired",
        symbol,
        zone: old,
        timestamp: Date.now(),
      });
      try {
        logZoneTouch({ zoneId: old.id, symbol, price: 0, event: "zone_expired" });
      } catch {
        // non-critical audit log; do not abort zone detection
      }
    }
  }

  // Now safe to replace confluent zones in DB
  deleteConfluentZonesBySymbol(symbol);

  for (const cz of newConfluentZones) {
    const id = upsertConfluentZone(cz);
    cz.id = id;

    const existed = prevConfluentZones.find(
      (p) =>
        Math.abs(p.proximalLine - cz.proximalLine) < 0.01 &&
        Math.abs(p.distalLine - cz.distalLine) < 0.01 &&
        p.direction === cz.direction,
    );

    if (existed) {
      broadcastEvent(symbol, { type: "zone_updated", symbol, zone: cz, timestamp: Date.now() });
      try {
        logZoneTouch({ zoneId: id, symbol, price: 0, event: "zone_updated" });
      } catch {
        // non-critical audit log; do not abort zone detection
      }
    } else {
      broadcastEvent(symbol, { type: "zone_created", symbol, zone: cz, timestamp: Date.now() });
      try {
        logZoneTouch({ zoneId: id, symbol, price: 0, event: "zone_created" });
      } catch {
        // non-critical audit log; do not abort zone detection
      }
    }
  }

  logger.info(
    { symbol, count: newConfluentZones.length },
    "zoneService: zones detected",
  );
}

export function scheduleRefresh(symbol: string): void {
  if (refreshTimers.has(symbol)) return;

  const interval = getRefreshIntervalMs();
  const timer = setInterval(async () => {
    try {
      await detectZones(symbol);
    } catch (err) {
      logger.error({ err, symbol }, "zoneService: refresh failed");
    }
  }, interval);

  refreshTimers.set(symbol, timer);
  logger.debug(
    { symbol, intervalMs: interval },
    "zoneService: refresh scheduled",
  );
}

export function cancelRefresh(symbol: string): void {
  const timer = refreshTimers.get(symbol);
  if (timer) {
    clearInterval(timer);
    refreshTimers.delete(symbol);
  }
}
