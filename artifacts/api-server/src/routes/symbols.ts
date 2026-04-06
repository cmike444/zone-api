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
import { logger } from "../lib/logger.js";

const router = Router();

router.post("/:symbol", async (req, res) => {
  const { symbol } = req.params;
  if (!symbol) {
    res.status(400).json({ error: "symbol is required" });
    return;
  }
  const sym = symbol.toUpperCase();

  try {
    await detectZones(sym);
    scheduleRefresh(sym);
    subscribePriceForSymbol(sym);
    res.status(201).json({ symbol: sym, status: "monitoring" });
  } catch (err) {
    req.log.error({ err, symbol: sym }, "Failed to start monitoring symbol");
    res.status(500).json({ error: "Failed to start monitoring" });
  }
});

router.delete("/:symbol", (req, res) => {
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

  logger.info({ symbol: sym }, "Stopped monitoring symbol");
  res.json({ symbol: sym, status: "stopped" });
});

router.get("/", (_req, res) => {
  const monitored = getMonitoredSymbols();
  const result = monitored.map((symbol) => ({
    symbol,
    currentPrice: getCurrentPrice(symbol),
    zoneCount: getZoneCount(symbol),
  }));
  res.json(result);
});

export default router;
