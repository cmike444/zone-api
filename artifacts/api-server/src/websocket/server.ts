import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import { requireWsToken } from "../middlewares/internalAuth.js";
import type { ZoneEvent } from "../types.js";
import { logger } from "../lib/logger.js";

let wss: WebSocketServer | null = null;

const globalClients = new Set<WebSocket>();
const symbolRooms = new Map<string, Set<WebSocket>>();

export function createWsServer(httpServer: Server): WebSocketServer {
  wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    if (!req.url) {
      socket.destroy();
      return;
    }

    if (!req.url.startsWith("/stream")) {
      socket.destroy();
      return;
    }

    if (!requireWsToken(req, socket as import("node:net").Socket)) {
      return;
    }

    wss!.handleUpgrade(req, socket, head, (ws) => {
      wss!.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws, req) => {
    const url = req.url ?? "/stream";
    const symbolMatch = url.match(/^\/stream\/([^?/]+)/);
    const symbol = symbolMatch ? decodeURIComponent(symbolMatch[1]!) : null;

    if (symbol) {
      if (!symbolRooms.has(symbol)) symbolRooms.set(symbol, new Set());
      symbolRooms.get(symbol)!.add(ws);
      logger.debug({ symbol }, "ws: client subscribed to symbol room");
    } else {
      globalClients.add(ws);
      logger.debug("ws: client subscribed to global room");
    }

    ws.on("close", () => {
      globalClients.delete(ws);
      if (symbol) symbolRooms.get(symbol)?.delete(ws);
    });

    ws.on("error", (err) => {
      logger.error({ err }, "ws: client error");
    });
  });

  logger.info("WebSocket server initialized");
  return wss;
}

export function broadcastEvent(symbol: string, event: ZoneEvent): void {
  const payload = JSON.stringify(event);

  const room = symbolRooms.get(symbol);
  if (room) {
    for (const client of room) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  for (const client of globalClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

export function getWss(): WebSocketServer | null {
  return wss;
}
