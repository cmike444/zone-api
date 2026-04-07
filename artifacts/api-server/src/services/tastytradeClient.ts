import TastytradeClient, { CandleType } from "@tastytrade/api";
import WebSocket from "ws";
import { logger } from "../lib/logger.js";

(global as unknown as Record<string, unknown>)["WebSocket"] = WebSocket;
(global as unknown as Record<string, unknown>)["window"] = {
  WebSocket,
  setTimeout,
  clearTimeout,
};

export { CandleType };

let client: TastytradeClient | null = null;
let authPromise: Promise<TastytradeClient | null> | null = null;

function hasCredentials(): boolean {
  return !!(
    process.env["TASTYTRADE_CLIENT_SECRET"] &&
    process.env["TASTYTRADE_REFRESH_TOKEN"]
  );
}

export function isTastytradeEnabled(): boolean {
  return hasCredentials();
}

async function createClient(): Promise<TastytradeClient | null> {
  if (!hasCredentials()) {
    logger.warn(
      "tastytradeClient: TASTYTRADE_CLIENT_SECRET / TASTYTRADE_REFRESH_TOKEN not set — using fallback data source",
    );
    return null;
  }

  const sandbox = process.env["TASTYTRADE_SANDBOX"] === "true";
  const baseConfig = sandbox
    ? TastytradeClient.SandboxConfig
    : TastytradeClient.ProdConfig;

  const cfg = {
    ...baseConfig,
    clientSecret: process.env["TASTYTRADE_CLIENT_SECRET"]!,
    refreshToken: process.env["TASTYTRADE_REFRESH_TOKEN"]!,
    oauthScopes: ["read"],
  } as ConstructorParameters<typeof TastytradeClient>[0];

  try {
    const c = new TastytradeClient(cfg);
    await c.accountsAndCustomersService.getCustomerAccounts();
    logger.info({ sandbox }, "tastytradeClient: authenticated");
    return c;
  } catch (err) {
    logger.error({ err }, "tastytradeClient: authentication failed");
    return null;
  }
}

export async function getTastytradeClient(): Promise<TastytradeClient | null> {
  if (client) return client;
  if (!authPromise) {
    authPromise = createClient().then((c) => {
      client = c;
      return c;
    });
  }
  return authPromise;
}

export async function disconnectTastytrade(): Promise<void> {
  if (client) {
    try {
      client.quoteStreamer.disconnect();
    } catch {}
    try {
      client.accountStreamer.stop();
    } catch {}
    client = null;
    authPromise = null;
  }
}
