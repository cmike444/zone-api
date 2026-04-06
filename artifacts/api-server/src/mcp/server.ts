import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";
import { logger } from "../lib/logger.js";

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: "zone-api",
    version: "1.0.0",
  });

  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info("MCP stdio server started");
}
