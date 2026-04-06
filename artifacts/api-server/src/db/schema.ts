import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { logger } from "../lib/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH =
  process.env["ZONES_DB_PATH"] ??
  path.resolve(__dirname, "../../data/zones.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return _db;
}

export function initDb(): Database.Database {
  if (_db) return _db;

  mkdirSync(path.dirname(DB_PATH), { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS zones (
      id INTEGER PRIMARY KEY,
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      direction INTEGER NOT NULL,
      type INTEGER NOT NULL,
      proximal REAL NOT NULL,
      distal REAL NOT NULL,
      confidence REAL NOT NULL,
      entry_price REAL,
      stop_price REAL,
      target_price REAL,
      start_ts INTEGER NOT NULL,
      end_ts INTEGER NOT NULL,
      detected_at INTEGER NOT NULL,
      is_fresh INTEGER DEFAULT 1,
      UNIQUE (symbol, timeframe, direction, start_ts)
    );

    CREATE INDEX IF NOT EXISTS idx_zones_symbol ON zones(symbol, timeframe, is_fresh);

    CREATE TABLE IF NOT EXISTS confluent_zones (
      id INTEGER PRIMARY KEY,
      symbol TEXT NOT NULL,
      timeframes TEXT NOT NULL,
      direction INTEGER NOT NULL,
      proximal REAL NOT NULL,
      distal REAL NOT NULL,
      combined_confidence REAL NOT NULL,
      entry_price REAL,
      stop_price REAL,
      target_price REAL,
      price_inside INTEGER DEFAULT 0,
      computed_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_confluent_symbol
      ON confluent_zones(symbol, combined_confidence DESC);

    CREATE INDEX IF NOT EXISTS idx_confluent_active
      ON confluent_zones(price_inside, combined_confidence DESC);

    CREATE TABLE IF NOT EXISTS zone_touches (
      id INTEGER PRIMARY KEY,
      zone_id INTEGER REFERENCES confluent_zones(id),
      symbol TEXT NOT NULL,
      price REAL NOT NULL,
      event TEXT NOT NULL,
      outcome TEXT,
      touched_at INTEGER NOT NULL
    );
  `);

  logger.info({ path: DB_PATH }, "SQLite database initialized");
  return _db;
}
