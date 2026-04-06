import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { registerTools } from "./tools.js";
import { requireInternalToken } from "../middlewares/internalAuth.js";
import { logger } from "../lib/logger.js";

interface Session {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
}

const sessions = new Map<string, Session>();

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "zone-api", version: "1.0.0" });
  registerTools(server);
  return server;
}

export function createHttpMcpRouter(): Router {
  const router = Router();

  router.use(requireInternalToken);

  router.post("/", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      await session.transport.handleRequest(req, res, req.body);
      return;
    }

    if (!isInitializeRequest(req.body)) {
      res.status(400).json({ error: "First request must be an initialize request" });
      return;
    }

    const newSessionId = randomUUID();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
    });
    const server = createMcpServer();

    sessions.set(newSessionId, { transport, server });

    transport.onclose = () => {
      sessions.delete(newSessionId);
      logger.debug({ sessionId: newSessionId }, "MCP HTTP session closed");
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  router.get("/", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId) {
      res.status(400).json({ error: "mcp-session-id header required" });
      return;
    }
    const session = sessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    await session.transport.handleRequest(req, res);
  });

  router.delete("/", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId) {
      const session = sessions.get(sessionId);
      if (session) {
        await session.transport.close();
        session.server.close();
        sessions.delete(sessionId);
        logger.debug({ sessionId }, "MCP HTTP session deleted");
      }
    }
    res.status(200).end();
  });

  return router;
}

export async function startMcpServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP stdio server started");
}
