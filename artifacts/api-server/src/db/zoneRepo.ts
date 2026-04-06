import { getDb } from "./schema.js";
import type { Zone, ConfluentZone } from "../types.js";
import { ZoneDirection } from "../types.js";

interface ZoneRow {
  id: number;
  symbol: string;
  timeframe: string;
  direction: number;
  type: number;
  proximal: number;
  distal: number;
  confidence: number;
  entry_price: number | null;
  stop_price: number | null;
  target_price: number | null;
  start_ts: number;
  end_ts: number;
  detected_at: number;
  is_fresh: number;
}

interface ConfluentZoneRow {
  id: number;
  symbol: string;
  timeframes: string;
  direction: number;
  proximal: number;
  distal: number;
  combined_confidence: number;
  entry_price: number | null;
  stop_price: number | null;
  target_price: number | null;
  price_inside: number;
  computed_at: number;
}

function rowToZone(row: ZoneRow): Zone {
  return {
    id: row.id,
    symbol: row.symbol,
    timeframe: row.timeframe,
    direction: row.direction,
    type: row.type,
    proximal: row.proximal,
    distal: row.distal,
    confidence: row.confidence,
    entryPrice: row.entry_price ?? undefined,
    stopPrice: row.stop_price ?? undefined,
    targetPrice: row.target_price ?? undefined,
    startTs: row.start_ts,
    endTs: row.end_ts,
    detectedAt: row.detected_at,
    isFresh: row.is_fresh === 1,
  };
}

function rowToConfluentZone(row: ConfluentZoneRow): ConfluentZone {
  return {
    id: row.id,
    symbol: row.symbol,
    timeframes: JSON.parse(row.timeframes) as string[],
    direction: row.direction,
    proximal: row.proximal,
    distal: row.distal,
    combinedConfidence: row.combined_confidence,
    entryPrice: row.entry_price ?? undefined,
    stopPrice: row.stop_price ?? undefined,
    targetPrice: row.target_price ?? undefined,
    priceInside: row.price_inside === 1,
    computedAt: row.computed_at,
  };
}

export function upsertZone(zone: Zone): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO zones
      (symbol, timeframe, direction, type, proximal, distal, confidence,
       entry_price, stop_price, target_price, start_ts, end_ts, detected_at, is_fresh)
    VALUES
      (@symbol, @timeframe, @direction, @type, @proximal, @distal, @confidence,
       @entry_price, @stop_price, @target_price, @start_ts, @end_ts, @detected_at, @is_fresh)
    ON CONFLICT DO NOTHING
  `);
  const result = stmt.run({
    symbol: zone.symbol,
    timeframe: zone.timeframe,
    direction: zone.direction,
    type: zone.type,
    proximal: zone.proximal,
    distal: zone.distal,
    confidence: zone.confidence,
    entry_price: zone.entryPrice ?? null,
    stop_price: zone.stopPrice ?? null,
    target_price: zone.targetPrice ?? null,
    start_ts: zone.startTs,
    end_ts: zone.endTs,
    detected_at: zone.detectedAt,
    is_fresh: zone.isFresh ? 1 : 0,
  });
  return result.lastInsertRowid as number;
}

export function getZonesBySymbol(
  symbol: string,
  timeframe?: string,
): Zone[] {
  const db = getDb();
  if (timeframe) {
    const rows = db
      .prepare(
        "SELECT * FROM zones WHERE symbol = ? AND timeframe = ? AND is_fresh = 1 ORDER BY confidence DESC",
      )
      .all(symbol, timeframe) as ZoneRow[];
    return rows.map(rowToZone);
  }
  const rows = db
    .prepare(
      "SELECT * FROM zones WHERE symbol = ? AND is_fresh = 1 ORDER BY confidence DESC",
    )
    .all(symbol) as ZoneRow[];
  return rows.map(rowToZone);
}

export function markZoneStale(id: number): void {
  const db = getDb();
  db.prepare("UPDATE zones SET is_fresh = 0 WHERE id = ?").run(id);
}

export function deleteZonesBySymbol(symbol: string): void {
  const db = getDb();
  db.prepare("DELETE FROM zones WHERE symbol = ?").run(symbol);
}

export function upsertConfluentZone(zone: ConfluentZone): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO confluent_zones
      (symbol, timeframes, direction, proximal, distal, combined_confidence,
       entry_price, stop_price, target_price, price_inside, computed_at)
    VALUES
      (@symbol, @timeframes, @direction, @proximal, @distal, @combined_confidence,
       @entry_price, @stop_price, @target_price, @price_inside, @computed_at)
  `);
  const result = stmt.run({
    symbol: zone.symbol,
    timeframes: JSON.stringify(zone.timeframes),
    direction: zone.direction,
    proximal: zone.proximal,
    distal: zone.distal,
    combined_confidence: zone.combinedConfidence,
    entry_price: zone.entryPrice ?? null,
    stop_price: zone.stopPrice ?? null,
    target_price: zone.targetPrice ?? null,
    price_inside: zone.priceInside ? 1 : 0,
    computed_at: zone.computedAt,
  });
  return result.lastInsertRowid as number;
}

export function getConfluentZones(symbol: string): ConfluentZone[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM confluent_zones WHERE symbol = ? ORDER BY combined_confidence DESC",
    )
    .all(symbol) as ConfluentZoneRow[];
  return rows.map(rowToConfluentZone);
}

export function getTopZones(limit: number, direction?: ZoneDirection): ConfluentZone[] {
  const db = getDb();
  if (direction !== undefined) {
    const rows = db
      .prepare(
        "SELECT * FROM confluent_zones WHERE direction = ? ORDER BY combined_confidence DESC LIMIT ?",
      )
      .all(direction, limit) as ConfluentZoneRow[];
    return rows.map(rowToConfluentZone);
  }
  const rows = db
    .prepare(
      "SELECT * FROM confluent_zones ORDER BY combined_confidence DESC LIMIT ?",
    )
    .all(limit) as ConfluentZoneRow[];
  return rows.map(rowToConfluentZone);
}

export function getActiveZones(): ConfluentZone[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM confluent_zones WHERE price_inside = 1 ORDER BY combined_confidence DESC",
    )
    .all() as ConfluentZoneRow[];
  return rows.map(rowToConfluentZone);
}

export function markPriceInside(id: number, inside: boolean): void {
  const db = getDb();
  db.prepare("UPDATE confluent_zones SET price_inside = ? WHERE id = ?").run(
    inside ? 1 : 0,
    id,
  );
}

export function markZoneBreached(id: number): void {
  const db = getDb();
  db.prepare(
    "UPDATE confluent_zones SET price_inside = 0 WHERE id = ?",
  ).run(id);
  db.prepare(
    "UPDATE zones SET is_fresh = 0 WHERE symbol = (SELECT symbol FROM confluent_zones WHERE id = ?)",
  ).run(id);
}

export function deleteConfluentZonesBySymbol(symbol: string): void {
  const db = getDb();
  db.prepare("DELETE FROM confluent_zones WHERE symbol = ?").run(symbol);
}

export function getConfluentZoneById(id: number): ConfluentZone | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM confluent_zones WHERE id = ?")
    .get(id) as ConfluentZoneRow | undefined;
  return row ? rowToConfluentZone(row) : null;
}

export function getZoneCount(symbol: string): number {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT COUNT(*) as count FROM confluent_zones WHERE symbol = ?",
    )
    .get(symbol) as { count: number };
  return row.count;
}
