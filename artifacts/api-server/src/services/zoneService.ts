import {
  identifyZones,
  filterFreshZones,
  type SdkZone,
} from "@cmike444/supply-and-demand-zones";
import { fetchCandles } from "./universeClient.js";
import {
  upsertZone,
  upsertConfluentZone,
  deleteConfluentZonesBySymbol,
  getConfluentZones,
  markZonesStaleBySymbolTimeframe,
} from "../db/zoneRepo.js";
import { logZoneTouch } from "../db/eventLogRepo.js";
import { broadcastEvent } from "../websocket/server.js";
import type { Candle, ConfluentZone, Zone } from "../types.js";
import { ZoneDirection } from "../types.js";
import { logger } from "../lib/logger.js";

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
          seed.proximal,
          seed.distal,
          candidate.proximal,
          candidate.distal,
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

    const proximal = Math.max(...grouped.map((z) => z.proximal));
    const distal = Math.min(...grouped.map((z) => z.distal));

    confluent.push({
      symbol,
      timeframes,
      direction: seed.direction,
      proximal,
      distal,
      combinedConfidence,
      priceInside: false,
      computedAt: Date.now(),
    });
  }

  return confluent.sort((a, b) => b.combinedConfidence - a.combinedConfidence);
}

function sdkZoneToInternal(
  sdkZone: SdkZone,
  symbol: string,
  timeframe: string,
  direction: ZoneDirection,
): Zone {
  const raw = sdkZone as unknown as Record<string, unknown>;
  const proximal =
    (raw["proximalLine"] as number | undefined) ??
    (raw["proximal"] as number | undefined) ??
    0;
  const distal =
    (raw["distalLine"] as number | undefined) ??
    (raw["distal"] as number | undefined) ??
    0;
  return {
    symbol,
    timeframe,
    direction,
    type: sdkZone.type,
    proximal,
    distal,
    confidence: sdkZone.confidence ?? 0.5,
    startTs: sdkZone.startTimestamp ?? Date.now(),
    endTs: sdkZone.endTimestamp ?? Date.now(),
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
      const fresh = filterFreshZones(
        identified.supplyZones ?? [],
        identified.demandZones ?? [],
      );

      const tfZones: Zone[] = [
        ...(fresh.supplyZones ?? []).map((z) =>
          sdkZoneToInternal(z, symbol, tf, ZoneDirection.Supply),
        ),
        ...(fresh.demandZones ?? []).map((z) =>
          sdkZoneToInternal(z, symbol, tf, ZoneDirection.Demand),
        ),
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
  deleteConfluentZonesBySymbol(symbol);

  const newConfluentZones = computeConfluentZones(symbol, zonesByTf);

  for (const cz of newConfluentZones) {
    const id = upsertConfluentZone(cz);
    cz.id = id;

    const existed = prevConfluentZones.find(
      (p) =>
        Math.abs(p.proximal - cz.proximal) < 0.01 &&
        Math.abs(p.distal - cz.distal) < 0.01 &&
        p.direction === cz.direction,
    );

    if (existed) {
      broadcastEvent(symbol, { type: "zone_updated", symbol, zone: cz });
      logZoneTouch({ zoneId: id, symbol, price: 0, event: "zone_updated" });
    } else {
      broadcastEvent(symbol, { type: "zone_created", symbol, zone: cz });
      logZoneTouch({ zoneId: id, symbol, price: 0, event: "zone_created" });
    }
  }

  const newProxDistalSet = new Set(
    newConfluentZones.map(
      (z) => `${z.direction}:${z.proximal}:${z.distal}`,
    ),
  );
  for (const old of prevConfluentZones) {
    const key = `${old.direction}:${old.proximal}:${old.distal}`;
    if (!newProxDistalSet.has(key) && old.id) {
      broadcastEvent(symbol, {
        type: "zone_expired",
        symbol,
        zoneId: old.id,
      });
      logZoneTouch({
        zoneId: old.id,
        symbol,
        price: 0,
        event: "zone_expired",
      });
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
