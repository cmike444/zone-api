import { getDb } from "./schema.js";

export function persistSymbol(symbol: string): void {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO monitored_symbols (symbol) VALUES (?)`,
    )
    .run(symbol);
}

export function removePersistedSymbol(symbol: string): void {
  getDb()
    .prepare(`DELETE FROM monitored_symbols WHERE symbol = ?`)
    .run(symbol);
}

export function getPersistedSymbols(): string[] {
  const rows = getDb()
    .prepare(`SELECT symbol FROM monitored_symbols ORDER BY added_at ASC`)
    .all() as { symbol: string }[];
  return rows.map((r) => r.symbol);
}
