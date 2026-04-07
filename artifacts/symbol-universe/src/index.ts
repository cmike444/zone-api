import http from "node:http";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";

const PORT = parseInt(process.env["PORT"] ?? "3005", 10);
const TOKEN = process.env["INTERNAL_API_TOKEN"] ?? "";

function checkAuth(req: express.Request, res: express.Response): boolean {
  const auth = req.headers["authorization"] ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (TOKEN && token !== TOKEN) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

function checkWsAuth(authHeader: string | undefined, query: URLSearchParams): boolean {
  if (!TOKEN) return true;
  const bearer = (authHeader ?? "").replace(/^Bearer\s+/i, "").trim();
  if (bearer === TOKEN) return true;
  if (query.get("token") === TOKEN) return true;
  return false;
}

function seedRng(seed: number) {
  let s = seed | 0;
  return function () {
    s = (Math.imul(1664525, s) + 1013904223) | 0;
    return (s >>> 0) / 0xffffffff;
  };
}

function symbolSeed(symbol: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < symbol.length; i++) {
    h ^= symbol.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const BASE_PRICES: Record<string, number> = {
  SPY: 510, QQQ: 440, AAPL: 195, TSLA: 250, NVDA: 870,
  MSFT: 415, AMZN: 185, GOOGL: 170, META: 520, AMD: 170,
  IWM: 200, DIA: 425, GLD: 235, SLV: 29, USO: 78,
  ES: 5500, MES: 5500, NQ: 19200, MNQ: 19200,
  YM: 42500, MYM: 42500, RTY: 2100, M2K: 2100,
  GC: 2350, MGC: 2350, SI: 28, SIL: 28,
  CL: 75, MCL: 75, NG: 3.5, RB: 2.4,
  ZB: 118, ZN: 111, ZF: 107, ZT: 102,
  "6E": 1.08, "6J": 0.0066, "6B": 1.26, "6C": 0.73,
  VX: 17, HG: 4.2, PL: 980, PA: 1050,
};

function getBasePrice(symbol: string): number {
  if (BASE_PRICES[symbol]) return BASE_PRICES[symbol];
  const rng = seedRng(symbolSeed(symbol));
  return 80 + rng() * 400;
}

const TF_MS: Record<string, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "60m": 3_600_000,
  "1d": 86_400_000,
  "1w": 604_800_000,
  "1M": 2_592_000_000,
  "3M": 7_776_000_000,
  "6M": 15_552_000_000,
};

const TF_COUNT: Record<string, number> = {
  "1m": 390,
  "5m": 280,
  "15m": 200,
  "60m": 160,
  "1d": 252,
  "1w": 104,
  "1M": 36,
  "3M": 24,
  "6M": 16,
};

const TF_VOL: Record<string, number> = {
  "1m": 0.0012,
  "5m": 0.0025,
  "15m": 0.004,
  "60m": 0.007,
  "1d": 0.015,
  "1w": 0.03,
  "1M": 0.06,
  "3M": 0.1,
  "6M": 0.15,
};

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function generateCandles(symbol: string, timeframe: string): Candle[] {
  const tfMs = TF_MS[timeframe] ?? 60_000;
  const count = TF_COUNT[timeframe] ?? 200;
  const vol = TF_VOL[timeframe] ?? 0.005;
  const rng = seedRng(symbolSeed(symbol + timeframe));

  const basePrice = getBasePrice(symbol);
  const candles: Candle[] = [];

  let price = basePrice * (0.88 + rng() * 0.04);
  const now = Date.now();
  const startTs = now - (count - 1) * tfMs;

  let candleIdx = 0;

  function makeDecisiveBullish(open: number, size: number): Candle {
    const body = size * (0.65 + rng() * 0.25);
    const close = open + body;
    const topWick = body * (0.03 + rng() * 0.1);
    const botWick = body * (0.03 + rng() * 0.08);
    const high = close + topWick;
    const low = open - botWick;
    const volume = Math.floor(700_000 + rng() * 1_300_000);
    const ts = startTs + candleIdx++ * tfMs;
    return { timestamp: ts, open: round2(open), high: round2(high), low: round2(low), close: round2(close), volume };
  }

  function makeDecisiveBearish(open: number, size: number): Candle {
    const body = size * (0.65 + rng() * 0.25);
    const close = open - body;
    const topWick = body * (0.03 + rng() * 0.08);
    const botWick = body * (0.03 + rng() * 0.1);
    const high = open + topWick;
    const low = close - botWick;
    const volume = Math.floor(700_000 + rng() * 1_300_000);
    const ts = startTs + candleIdx++ * tfMs;
    return { timestamp: ts, open: round2(open), high: round2(high), low: round2(low), close: round2(close), volume };
  }

  function makeExplosive(open: number, size: number, bullish: boolean): Candle {
    const body = size * (0.75 + rng() * 0.2);
    const close = bullish ? open + body : open - body;
    const wick = body * (0.02 + rng() * 0.05);
    const high = bullish ? close + wick : open + wick;
    const low = bullish ? open - wick : close - wick;
    const volume = Math.floor(1_500_000 + rng() * 2_500_000);
    const ts = startTs + candleIdx++ * tfMs;
    return { timestamp: ts, open: round2(open), high: round2(high), low: round2(low), close: round2(close), volume };
  }

  function makeBase(open: number, size: number): Candle {
    const body = size * (0.1 + rng() * 0.3);
    const bullish = rng() > 0.5;
    const close = bullish ? open + body : open - body;
    const wick = size * (0.3 + rng() * 0.4);
    const high = Math.max(open, close) + wick * (0.4 + rng() * 0.3);
    const low = Math.min(open, close) - wick * (0.4 + rng() * 0.3);
    const volume = Math.floor(200_000 + rng() * 400_000);
    const ts = startTs + candleIdx++ * tfMs;
    return { timestamp: ts, open: round2(open), high: round2(high), low: round2(low), close: round2(close), volume };
  }

  while (candles.length < count) {
    const segType = rng();
    const segVol = price * vol;
    const legSize = segVol * (2.5 + rng() * 2.5);

    if (segType < 0.35) {
      const numRally = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < numRally && candles.length < count; i++) {
        const c = makeDecisiveBullish(price, legSize);
        candles.push(c);
        price = c.close;
      }
      const numBase = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < numBase && candles.length < count; i++) {
        const c = makeBase(price, segVol * 0.6);
        candles.push(c);
        price = c.close;
      }
      const expDown = makeExplosive(price, legSize * (1.2 + rng() * 0.8), false);
      candles.push(expDown);
      price = expDown.close;

    } else if (segType < 0.70) {
      const numDrop = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < numDrop && candles.length < count; i++) {
        const c = makeDecisiveBearish(price, legSize);
        candles.push(c);
        price = c.close;
      }
      const numBase = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < numBase && candles.length < count; i++) {
        const c = makeBase(price, segVol * 0.6);
        candles.push(c);
        price = c.close;
      }
      const expUp = makeExplosive(price, legSize * (1.2 + rng() * 0.8), true);
      candles.push(expUp);
      price = expUp.close;

    } else {
      const numMixed = 2 + Math.floor(rng() * 4);
      for (let i = 0; i < numMixed && candles.length < count; i++) {
        const c = makeBase(price, segVol * (0.8 + rng() * 0.8));
        candles.push(c);
        price = c.close;
      }
    }

    price = Math.max(basePrice * 0.6, Math.min(basePrice * 1.4, price));
  }

  const trimmed = candles.slice(0, count);
  const nowTs = Date.now();
  trimmed.forEach((c, i) => {
    c.timestamp = nowTs - (count - 1 - i) * tfMs;
  });

  return trimmed;
}

const app = express();
app.use(express.json());

app.get("/candles/:symbol/:timeframe", (req, res) => {
  if (!checkAuth(req, res)) return;
  const symbol = (req.params["symbol"] ?? "").toUpperCase();
  const timeframe = req.params["timeframe"] ?? "";
  if (!TF_MS[timeframe]) {
    res.status(400).json({ error: `Unknown timeframe: ${timeframe}` });
    return;
  }
  res.json(generateCandles(symbol, timeframe));
});

app.get("/metrics/:symbol", (req, res) => {
  if (!checkAuth(req, res)) return;
  const symbol = (req.params["symbol"] ?? "").toUpperCase();
  const rng = seedRng(symbolSeed(symbol + "metrics"));
  const price = getBasePrice(symbol);
  res.json({
    symbol,
    price: round2(price),
    volume: Math.floor(1_000_000 + rng() * 50_000_000),
    avgVolume: Math.floor(5_000_000 + rng() * 30_000_000),
    high52w: round2(price * (1 + rng() * 0.4)),
    low52w: round2(price * (1 - rng() * 0.3)),
  });
});

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "", `http://localhost:${PORT}`);
  const query = url.searchParams;

  if (!checkWsAuth(req.headers["authorization"], query)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  const pathMatch = url.pathname.match(/^\/stream\/(.+)$/);
  if (!pathMatch) {
    socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    const symbol = decodeURIComponent(pathMatch[1]!).toUpperCase();
    wss.emit("connection", ws, req, symbol);
  });
});

wss.on("connection", (ws: WebSocket, _req: http.IncomingMessage, symbol: string) => {
  let price = getBasePrice(symbol);
  const spread = price * 0.0002;
  const vol = price * TF_VOL["1m"]!;

  const interval = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) {
      clearInterval(interval);
      return;
    }
    const delta = (Math.random() - 0.5) * vol * 0.8;
    price = Math.max(price * 0.9, Math.min(price * 1.1, price + delta));
    const bid = round2(price - spread);
    const ask = round2(price + spread);
    ws.send(
      JSON.stringify({
        type: "price",
        symbol,
        price: round2(price),
        bid,
        ask,
        timestamp: Date.now(),
      }),
    );
  }, 500);

  ws.on("close", () => clearInterval(interval));
  ws.on("error", () => clearInterval(interval));
});

server.listen(PORT, () => {
  console.log(`symbol-universe mock listening on port ${PORT}`);
});
