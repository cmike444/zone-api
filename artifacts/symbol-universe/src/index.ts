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
};

function getBasePrice(symbol: string): number {
  if (BASE_PRICES[symbol]) return BASE_PRICES[symbol];
  const rng = seedRng(symbolSeed(symbol));
  return 50 + rng() * 450;
}

const TF_MS: Record<string, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "60m": 3_600_000,
  "1d": 86_400_000,
};

const TF_COUNT: Record<string, number> = {
  "1m": 390,
  "5m": 200,
  "15m": 150,
  "60m": 120,
  "1d": 252,
};

function generateCandles(symbol: string, timeframe: string) {
  const tfMs = TF_MS[timeframe] ?? 60_000;
  const count = TF_COUNT[timeframe] ?? 200;
  const rng = seedRng(symbolSeed(symbol + timeframe));

  let price = getBasePrice(symbol);
  const volatility = price * 0.0035;

  const now = Date.now();
  const candles = [];

  for (let i = count - 1; i >= 0; i--) {
    const ts = now - i * tfMs;
    const open = price;
    const change = (rng() - 0.5) * volatility * 2;
    const close = Math.max(0.01, open + change);
    const highExtra = rng() * volatility;
    const lowExtra = rng() * volatility;
    const high = Math.max(open, close) + highExtra;
    const low = Math.min(open, close) - lowExtra;
    const volume = Math.floor(50_000 + rng() * 950_000);

    candles.push({
      timestamp: ts,
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      close: +close.toFixed(2),
      volume,
    });

    price = close;
  }

  return candles;
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
    price: +price.toFixed(2),
    volume: Math.floor(1_000_000 + rng() * 50_000_000),
    avgVolume: Math.floor(5_000_000 + rng() * 30_000_000),
    high52w: +(price * (1 + rng() * 0.4)).toFixed(2),
    low52w: +(price * (1 - rng() * 0.3)).toFixed(2),
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

  const interval = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) {
      clearInterval(interval);
      return;
    }
    const delta = (Math.random() - 0.5) * price * 0.001;
    price = Math.max(0.01, price + delta);
    const bid = +(price - spread).toFixed(2);
    const ask = +(price + spread).toFixed(2);
    ws.send(
      JSON.stringify({
        type: "price",
        symbol,
        price: +price.toFixed(2),
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
