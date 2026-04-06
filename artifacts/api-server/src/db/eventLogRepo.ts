import { getDb } from "./schema.js";

export type ZoneTouchEvent =
  | "zone_created"
  | "zone_updated"
  | "zone_expired"
  | "zone_entered"
  | "zone_exited"
  | "zone_breached";

export interface ZoneTouchRecord {
  zoneId: number | null;
  symbol: string;
  price: number;
  event: ZoneTouchEvent;
  outcome?: string;
}

export function logZoneTouch(record: ZoneTouchRecord): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO zone_touches (zone_id, symbol, price, event, outcome, touched_at)
    VALUES (@zone_id, @symbol, @price, @event, @outcome, @touched_at)
  `).run({
    zone_id: record.zoneId,
    symbol: record.symbol,
    price: record.price,
    event: record.event,
    outcome: record.outcome ?? null,
    touched_at: Date.now(),
  });
}
