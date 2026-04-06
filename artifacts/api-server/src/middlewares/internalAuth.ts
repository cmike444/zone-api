import { createHash, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { logger } from "../lib/logger.js";

function getToken(): Buffer {
  const token = process.env["INTERNAL_API_TOKEN"];
  if (!token) {
    throw new Error("INTERNAL_API_TOKEN is not set");
  }
  return Buffer.from(token, "utf8");
}

function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? (match[1] ?? null) : null;
}

function isValidToken(candidate: string): boolean {
  try {
    const expected = getToken();
    const actual = Buffer.from(candidate, "utf8");
    if (actual.length !== expected.length) {
      const padded = Buffer.alloc(expected.length);
      actual.copy(padded, 0, 0, Math.min(actual.length, expected.length));
      timingSafeEqual(padded, expected);
      return false;
    }
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function requireInternalToken(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const bearer = extractBearerToken(req.headers["authorization"]);
  if (!bearer || !isValidToken(bearer)) {
    logger.warn({ url: req.url, method: req.method }, "Unauthorized request");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export function requireWsToken(
  req: IncomingMessage,
  socket: Socket,
): boolean {
  const authHeader = req.headers["authorization"];
  const bearer = extractBearerToken(authHeader);

  if (bearer && isValidToken(bearer)) {
    return true;
  }

  const url = new URL(req.url ?? "", "http://localhost");
  const queryToken = url.searchParams.get("token");
  if (queryToken && isValidToken(queryToken)) {
    return true;
  }

  logger.warn({ url: req.url }, "WebSocket upgrade unauthorized");
  socket.write(
    "HTTP/1.1 401 Unauthorized\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nUnauthorized",
  );
  socket.destroy();
  return false;
}

// Hash of the token for safe comparison; exported so universeClient can use raw env directly
export function getInternalAuthHeaders(): Record<string, string> {
  const token = process.env["INTERNAL_API_TOKEN"];
  if (!token) throw new Error("INTERNAL_API_TOKEN is not set");
  return { Authorization: `Bearer ${token}` };
}
