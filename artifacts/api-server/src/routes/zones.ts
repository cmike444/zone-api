import { Router } from "express";
import {
  getZonesBySymbol,
  getConfluentZones,
  getTopZones,
  getActiveZones,
} from "../db/zoneRepo.js";
import { ZoneDirection } from "../types.js";

const router = Router();

router.get("/top", (req, res) => {
  const limit = parseInt(String(req.query["limit"] ?? "10"), 10);
  const directionParam = req.query["direction"];
  let direction: ZoneDirection | undefined;

  if (directionParam === "supply") direction = ZoneDirection.Supply;
  else if (directionParam === "demand") direction = ZoneDirection.Demand;

  const zones = getTopZones(isNaN(limit) ? 10 : limit, direction);
  res.json(zones);
});

router.get("/active", (_req, res) => {
  const zones = getActiveZones();
  res.json(zones);
});

router.get("/:symbol/confluent", (req, res) => {
  const symbol = req.params["symbol"]?.toUpperCase();
  if (!symbol) {
    res.status(400).json({ error: "symbol is required" });
    return;
  }
  const zones = getConfluentZones(symbol);
  res.json(zones);
});

router.get("/:symbol", (req, res) => {
  const symbol = req.params["symbol"]?.toUpperCase();
  if (!symbol) {
    res.status(400).json({ error: "symbol is required" });
    return;
  }
  const timeframe = req.query["timeframe"] as string | undefined;
  const zones = getZonesBySymbol(symbol, timeframe);
  res.json(zones);
});

export default router;
