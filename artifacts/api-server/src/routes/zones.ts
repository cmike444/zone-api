import { Router } from "express";
import {
  getZonesBySymbol,
  getConfluentZones,
  getTopZones,
  getActiveZones,
} from "../db/zoneRepo.js";
import { getCurrentPrice } from "../services/priceService.js";
import { detectZones } from "../services/zoneService.js";
import type { ZoneDirection } from "../types.js";
import { registerRoutes } from "./register.js";
import { ROUTES } from "./zones.meta.js";

const router = Router();

registerRoutes(router, ROUTES, {
  getTop: (req, res) => {
    const limit = parseInt(String(req.query["limit"] ?? "10"), 10);
    const directionParam = req.query["direction"];
    let direction: ZoneDirection | undefined;

    if (directionParam === "supply") direction = "supply";
    else if (directionParam === "demand") direction = "demand";

    const zones = getTopZones(isNaN(limit) ? 10 : limit, direction);
    res.json(zones);
  },

  getActive: (_req, res) => {
    const zones = getActiveZones();
    res.json(zones);
  },

  getConfluentBySymbol: (req, res) => {
    const symbol = req.params["symbol"]?.toUpperCase();
    if (!symbol) {
      res.status(400).json({ error: "symbol is required" });
      return;
    }
    const livePrice = getCurrentPrice(symbol);
    const zones = getConfluentZones(symbol).filter((z) => {
      if (livePrice === undefined) return true;
      return z.direction === "supply"
        ? livePrice < z.proximalLine
        : livePrice > z.proximalLine;
    });
    res.json(zones);
  },

  refreshBySymbol: async (req, res) => {
    const symbol = req.params["symbol"]?.toUpperCase();
    if (!symbol) {
      res.status(400).json({ error: "symbol is required" });
      return;
    }
    try {
      await detectZones(symbol);
      const zones = getZonesBySymbol(symbol);
      res.json({ ok: true, count: zones.length });
    } catch (err) {
      req.log.error({ err, symbol }, "zones: refresh failed");
      res.status(500).json({ error: "Failed to refresh zones" });
    }
  },

  getBySymbol: (req, res) => {
    const symbol = req.params["symbol"]?.toUpperCase();
    if (!symbol) {
      res.status(400).json({ error: "symbol is required" });
      return;
    }
    const timeframe = req.query["timeframe"] as string | undefined;
    const zones = getZonesBySymbol(symbol, timeframe);
    res.json(zones);
  },
});

export default router;
