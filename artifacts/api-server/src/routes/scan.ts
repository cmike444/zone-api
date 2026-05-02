import { Router } from "express";
import { fetchMetrics } from "../services/universeClient.js";
import { registerRoutes } from "./register.js";
import { ROUTES } from "./scan.meta.js";

const router = Router();

registerRoutes(router, ROUTES, {
  scanSymbol: async (req, res) => {
    const symbol = req.params["symbol"]?.toUpperCase();
    if (!symbol) {
      res.status(400).json({ error: "symbol is required" });
      return;
    }

    try {
      const metrics = await fetchMetrics(symbol);
      res.json(metrics);
    } catch (err) {
      req.log.error({ err, symbol }, "scan: failed to fetch metrics");
      res.status(502).json({ error: "Failed to fetch metrics from symbol-universe" });
    }
  },
});

export default router;
