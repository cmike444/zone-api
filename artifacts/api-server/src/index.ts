import "dotenv/config";
import { createServer } from "node:http";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { initDb } from "./db/schema.js";
import { createWsServer } from "./websocket/server.js";

const rawToken = process.env["INTERNAL_API_TOKEN"];
if (!rawToken || rawToken.trim() === "") {
  throw new Error(
    "INTERNAL_API_TOKEN environment variable is required but was not provided.",
  );
}

initDb();

const isMcpMode = process.argv.includes("--mcp");

if (isMcpMode) {
  import("./mcp/server.js")
    .then(({ startMcpServer }) => startMcpServer())
    .catch((err: unknown) => {
      logger.error({ err }, "Failed to start MCP server");
      process.exit(1);
    });
} else {
  const rawPort = process.env["PORT"];
  if (!rawPort) {
    throw new Error(
      "PORT environment variable is required but was not provided.",
    );
  }

  const port = Number(rawPort);
  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  const httpServer = createServer(app);
  createWsServer(httpServer);

  httpServer.listen(port, (err?: Error) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
}
