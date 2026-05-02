import { Router } from "express";
import { fetchCandles } from "../services/universeClient.js";
import { registerRoutes } from "./register.js";
import { ROUTES } from "./candles.meta.js";

const router = Router();

registerRoutes(router, ROUTES, {
  getCandles: async (req, res) => {
    const symbol = req.params["symbol"]?.toUpperCase();
    const timeframe = req.params["timeframe"];

    if (!symbol || !timeframe) {
      res.status(400).json({ error: "symbol and timeframe are required" });
      return;
    }

    const ALLOWED_TFS = new Set(["1d", "1w", "1M", "3M", "6M", "60m", "15m", "5m", "1m"]);
    if (!ALLOWED_TFS.has(timeframe)) {
      res.status(400).json({
        error: `Unsupported timeframe: ${timeframe}. Allowed: ${[...ALLOWED_TFS].join(", ")}`,
      });
      return;
    }

    try {
      const candles = await fetchCandles(symbol, timeframe);
      res.json(candles);
    } catch (err) {
      req.log.warn({ err, symbol, timeframe }, "candles: upstream fetch failed");
      res.status(502).json({ error: "Failed to fetch candles from symbol-universe" });
    }
  },
});

export default router;
