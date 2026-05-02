import { Router } from "express";
import { detectZones, scheduleRefresh, cancelRefresh } from "../services/zoneService.js";
import {
  subscribePriceForSymbol,
  unsubscribePriceForSymbol,
  getMonitoredSymbols,
  getCurrentPrice,
} from "../services/priceService.js";
import {
  deleteConfluentZonesBySymbol,
  deleteZonesBySymbol,
  getZoneCount,
} from "../db/zoneRepo.js";
import { persistSymbol, removePersistedSymbol } from "../db/symbolRepo.js";
import { logger } from "../lib/logger.js";
import { registerRoutes } from "./register.js";
import { ROUTES } from "./symbols.meta.js";

const router = Router();

registerRoutes(router, ROUTES, {
  listSymbols: (_req, res) => {
    const monitored = getMonitoredSymbols();
    const result = monitored.map((symbol) => ({
      symbol,
      currentPrice: getCurrentPrice(symbol),
      zoneCount: getZoneCount(symbol),
    }));
    res.json(result);
  },

  startMonitoring: async (req, res) => {
    const { symbol } = req.params;
    if (!symbol) {
      res.status(400).json({ error: "symbol is required" });
      return;
    }
    const sym = symbol.toUpperCase();

    try {
      persistSymbol(sym);
      await detectZones(sym);
      scheduleRefresh(sym);
      subscribePriceForSymbol(sym);
      res.status(201).json({ symbol: sym, status: "monitoring" });
    } catch (err) {
      req.log.error({ err, symbol: sym }, "Failed to start monitoring symbol");
      res.status(500).json({ error: "Failed to start monitoring" });
    }
  },

  stopMonitoring: (req, res) => {
    const { symbol } = req.params;
    if (!symbol) {
      res.status(400).json({ error: "symbol is required" });
      return;
    }
    const sym = symbol.toUpperCase();

    cancelRefresh(sym);
    unsubscribePriceForSymbol(sym);
    deleteConfluentZonesBySymbol(sym);
    deleteZonesBySymbol(sym);
    removePersistedSymbol(sym);

    logger.info({ symbol: sym }, "Stopped monitoring symbol");
    res.json({ symbol: sym, status: "stopped" });
  },
});

export default router;
