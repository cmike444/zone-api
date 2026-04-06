import { Router } from "express";
import { fetchMetrics } from "../services/universeClient.js";

const router = Router();

router.get("/:symbol", async (req, res) => {
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
});

export default router;
