import { getDb } from "./schema.js";
import type { Zone, ConfluentZone, ZoneDirection } from "../types.js";

interface ZoneRow {
  id: number;
  symbol: string;
  timeframe: string;
  direction: string;
  pattern: string;
  proximal_line: number;
  distal_line: number;
  confidence: number;
  rr_score: number | null;
  entry_price: number | null;
  stop_price: number | null;
  target_price: number | null;
  start_timestamp: number;
  end_timestamp: number;
  detected_at: number;
  is_fresh: number;
}

interface ConfluentZoneRow {
  id: number;
  symbol: string;
  timeframes: string;
  direction: string;
  proximal_line: number;
  distal_line: number;
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
    timeframe: row.timeframe as Zone["timeframe"],
    direction: row.direction as ZoneDirection,
    pattern: row.pattern as Zone["pattern"],
    proximalLine: row.proximal_line,
    distalLine: row.distal_line,
    confidence: row.confidence,
    rrScore: row.rr_score ?? undefined,
    entryPrice: row.entry_price ?? undefined,
    stopPrice: row.stop_price ?? undefined,
    targetPrice: row.target_price ?? undefined,
    startTimestamp: row.start_timestamp,
    endTimestamp: row.end_timestamp,
    detectedAt: row.detected_at,
    isFresh: row.is_fresh === 1,
  };
}

function rowToConfluentZone(row: ConfluentZoneRow): ConfluentZone {
  return {
    id: row.id,
    symbol: row.symbol,
    timeframes: JSON.parse(row.timeframes) as ConfluentZone["timeframes"],
    direction: row.direction as ZoneDirection,
    proximalLine: row.proximal_line,
    distalLine: row.distal_line,
    combinedConfidence: row.combined_confidence,
    entryPrice: row.entry_price ?? undefined,
    stopPrice: row.stop_price ?? undefined,
    targetPrice: row.target_price ?? undefined,
    priceInside: row.price_inside === 1,
    computedAt: row.computed_at,
  };
}

export function markZonesStaleBySymbolTimeframe(
  symbol: string,
  timeframe: string,
): void {
  const db = getDb();
  db.prepare(
    "UPDATE zones SET is_fresh = 0 WHERE symbol = ? AND timeframe = ? AND is_fresh = 1",
  ).run(symbol, timeframe);
}

export function upsertZone(zone: Zone): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO zones
      (symbol, timeframe, direction, pattern, proximal_line, distal_line, confidence,
       rr_score, entry_price, stop_price, target_price,
       start_timestamp, end_timestamp, detected_at, is_fresh)
    VALUES
      (@symbol, @timeframe, @direction, @pattern, @proximal_line, @distal_line, @confidence,
       @rr_score, @entry_price, @stop_price, @target_price,
       @start_timestamp, @end_timestamp, @detected_at, @is_fresh)
    ON CONFLICT(symbol, timeframe, direction, start_timestamp) DO UPDATE SET
      proximal_line = excluded.proximal_line,
      distal_line   = excluded.distal_line,
      confidence    = excluded.confidence,
      end_timestamp = excluded.end_timestamp,
      detected_at   = excluded.detected_at,
      is_fresh      = 1
  `);
  const result = stmt.run({
    symbol: zone.symbol,
    timeframe: zone.timeframe,
    direction: zone.direction,
    pattern: zone.pattern,
    proximal_line: zone.proximalLine,
    distal_line: zone.distalLine,
    confidence: zone.confidence,
    rr_score: zone.rrScore ?? null,
    entry_price: zone.entryPrice ?? null,
    stop_price: zone.stopPrice ?? null,
    target_price: zone.targetPrice ?? null,
    start_timestamp: zone.startTimestamp,
    end_timestamp: zone.endTimestamp,
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
      (symbol, timeframes, direction, proximal_line, distal_line, combined_confidence,
       entry_price, stop_price, target_price, price_inside, computed_at)
    VALUES
      (@symbol, @timeframes, @direction, @proximal_line, @distal_line, @combined_confidence,
       @entry_price, @stop_price, @target_price, @price_inside, @computed_at)
  `);
  const result = stmt.run({
    symbol: zone.symbol,
    timeframes: JSON.stringify(zone.timeframes),
    direction: zone.direction,
    proximal_line: zone.proximalLine,
    distal_line: zone.distalLine,
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

export function getTopZones(
  limit: number,
  direction?: ZoneDirection,
): ConfluentZone[] {
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
  db.prepare(`
    UPDATE zones SET is_fresh = 0
    WHERE symbol = (SELECT symbol FROM confluent_zones WHERE id = ?)
      AND direction = (SELECT direction FROM confluent_zones WHERE id = ?)
      AND is_fresh = 1
      AND MIN(proximal_line, distal_line) <= (SELECT MAX(proximal_line, distal_line) FROM confluent_zones WHERE id = ?)
      AND MAX(proximal_line, distal_line) >= (SELECT MIN(proximal_line, distal_line) FROM confluent_zones WHERE id = ?)
  `).run(id, id, id, id);
}

export function deleteConfluentZonesBySymbol(symbol: string): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare(
      "DELETE FROM zone_touches WHERE zone_id IN (SELECT id FROM confluent_zones WHERE symbol = ?)",
    ).run(symbol);
    db.prepare("DELETE FROM confluent_zones WHERE symbol = ?").run(symbol);
  })();
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
