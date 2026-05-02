import { Router } from "express";
import {
  getCurrentPrice,
  getMonitoredSymbols,
} from "../services/priceService.js";
import { registerRoutes } from "./register.js";
import { ROUTES } from "./price.meta.js";

const router = Router();

registerRoutes(router, ROUTES, {
  getCurrentPrice: (req, res) => {
    const symbol = req.params["symbol"]?.toUpperCase();
    if (!symbol) {
      res.status(400).json({ error: "symbol is required" });
      return;
    }

    const monitored = getMonitoredSymbols();
    if (!monitored.includes(symbol)) {
      res.status(404).json({ error: `Symbol ${symbol} is not being monitored` });
      return;
    }

    const price = getCurrentPrice(symbol);
    res.json({ symbol, price: price ?? null });
  },
});

export default router;
