import { useState } from "react";
import { Download, ChevronDown, ChevronRight, Lock, Zap, Globe, Play, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type HttpMethod,
  type Endpoint,
  type Category,
  type WsStream,
  type McpTool,
  CATEGORIES,
  WS_STREAMS,
  MCP_TOOLS,
} from "@workspace/api-catalogue";

// ─── OpenAPI generator ───────────────────────────────────────────────────────

function buildOpenApiSpec(): object {
  const paths: Record<string, unknown> = {};

  for (const cat of CATEGORIES) {
    for (const ep of cat.endpoints) {
      const key = ep.path.replace(/:([a-zA-Z]+)/g, "{$1}");
      if (!paths[key]) paths[key] = {};
      const pathParams = ep.params
        .filter((p) => p.in === "path")
        .map((p) => ({
          name: p.name,
          in: "path",
          required: p.required,
          description: p.description,
          schema: { type: p.type === "integer" ? "integer" : "string" },
        }));
      const queryParams = ep.params
        .filter((p) => p.in === "query")
        .map((p) => ({
          name: p.name,
          in: "query",
          required: p.required,
          description: p.description,
          schema: { type: p.type === "integer" ? "integer" : "string" },
        }));

      const security = ep.auth ? [{ bearerAuth: [] }] : undefined;
      const statusCode = String(ep.successCode ?? 200);
      const contentType = ep.responseContentType ?? "application/json";

      (paths[key] as Record<string, unknown>)[ep.method.toLowerCase()] = {
        tags: [cat.title],
        summary: ep.summary,
        description: ep.description,
        parameters: [...pathParams, ...queryParams],
        ...(security ? { security } : {}),
        responses: {
          [statusCode]: {
            description: "Success",
            content: {
              [contentType]: contentType === "application/json"
                ? { example: ep.exampleResponse }
                : { schema: { type: "string" } },
            },
          },
          ...(ep.auth
            ? { "401": { description: "Unauthorized — missing or invalid INTERNAL_API_TOKEN" } }
            : {}),
        },
      };
    }
  }

  return {
    openapi: "3.0.3",
    info: {
      title: "Zones API",
      version: "1.0.0",
      description:
        "Supply/demand zone intelligence API. Provides zone detection, live price streaming, market metrics, and MCP tool access for AI agents.",
    },
    servers: [{ url: "/", description: "API server (base URL)" }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "Set INTERNAL_API_TOKEN on the API server. Pass the same value as a Bearer token in the Authorization header.",
        },
      },
    },
    paths,
  };
}

// ─── Markdown generator ──────────────────────────────────────────────────────

function buildMarkdown(): string {
  const lines: string[] = [];

  lines.push("# Zones API Reference\n");
  lines.push(
    "> All REST endpoints require an `Authorization: Bearer <INTERNAL_API_TOKEN>` header unless marked **No auth required**.\n",
  );

  lines.push("## REST Endpoints\n");

  for (const cat of CATEGORIES) {
    lines.push(`### ${cat.title}\n`);
    lines.push(`${cat.description}\n`);

    for (const ep of cat.endpoints) {
      lines.push(`#### \`${ep.method} ${ep.path}\`\n`);
      lines.push(`${ep.description}\n`);
      if (!ep.auth) lines.push("**Authentication:** No auth required.\n");

      if (ep.params.length > 0) {
        lines.push("**Parameters:**\n");
        lines.push("| Name | In | Required | Type | Description |");
        lines.push("|------|----|----------|------|-------------|");
        for (const p of ep.params) {
          lines.push(`| \`${p.name}\` | ${p.in} | ${p.required ? "Yes" : "No"} | \`${p.type}\` | ${p.description} |`);
        }
        lines.push("");
      }

      lines.push("**Example response:**\n");
      lines.push("```json");
      lines.push(JSON.stringify(ep.exampleResponse, null, 2));
      lines.push("```\n");
    }
  }

  lines.push("---\n");
  lines.push("## WebSocket Streams\n");
  lines.push(
    "All WebSocket connections require authentication. Pass the token either as `Authorization: Bearer <token>` in the upgrade request headers, or as a `token` query parameter.\n",
  );

  for (const ws of WS_STREAMS) {
    lines.push(`### \`${ws.path}\`\n`);
    lines.push(`${ws.description}\n`);
    lines.push("**Events:**\n");
    for (const ev of ws.events) {
      lines.push(`#### \`${ev.type}\`\n`);
      lines.push(`${ev.description}\n`);
      lines.push("```json");
      lines.push(JSON.stringify(ev.payload, null, 2));
      lines.push("```\n");
    }
  }

  lines.push("---\n");
  lines.push("## MCP Interface\n");
  lines.push(
    "The MCP server is accessible at `POST /api/mcp`. Requires `Authorization: Bearer <INTERNAL_API_TOKEN>`. Use an MCP-compatible client or AI agent to call the following tools.\n",
  );

  for (const tool of MCP_TOOLS) {
    lines.push(`### \`${tool.name}\`\n`);
    lines.push(`${tool.description}\n`);
    if (tool.params.length > 0) {
      lines.push("**Parameters:**\n");
      lines.push("| Name | Type | Required | Description |");
      lines.push("|------|------|----------|-------------|");
      for (const p of tool.params) {
        lines.push(`| \`${p.name}\` | \`${p.type}\` | ${p.required ? "Yes" : "No"} | ${p.description} |`);
      }
      lines.push("");
    }
    lines.push(`**Returns:** ${tool.returns}\n`);
    lines.push(
      `**Hints:** read-only=${tool.hints.readOnly}, destructive=${tool.hints.destructive}\n`,
    );
  }

  return lines.join("\n");
}

// ─── Download helpers ────────────────────────────────────────────────────────

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Try-it panel ────────────────────────────────────────────────────────────

type TryItStatus = "idle" | "loading" | "success" | "error";

const DESTRUCTIVE_METHODS = new Set<HttpMethod>(["POST", "PUT", "PATCH", "DELETE"]);

function TryItPanel({ ep }: { ep: Endpoint }) {
  const [token, setToken] = useState("");
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<TryItStatus>("idle");
  const [responseBody, setResponseBody] = useState("");
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const pathParams = ep.params.filter((p) => p.in === "path");
  const queryParams = ep.params.filter((p) => p.in === "query");
  const isDestructive = DESTRUCTIVE_METHODS.has(ep.method);

  async function handleSend() {
    const errors: string[] = [];
    for (const p of ep.params) {
      if (p.required && !paramValues[p.name]?.trim()) {
        errors.push(`"${p.name}" (${p.in}) is required`);
      }
    }
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors([]);
    setStatus("loading");
    setResponseBody("");
    setStatusCode(null);

    let url = ep.path;
    for (const p of pathParams) {
      const val = paramValues[p.name] ?? "";
      url = url.replace(`:${p.name}`, encodeURIComponent(val));
    }

    const qp = new URLSearchParams();
    for (const p of queryParams) {
      const val = paramValues[p.name];
      if (val) qp.set(p.name, val);
    }
    const qs = qp.toString();
    if (qs) url += `?${qs}`;

    try {
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(url, { method: ep.method, headers });
      setStatusCode(res.status);

      const text = await res.text();
      try {
        setResponseBody(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        setResponseBody(text);
      }
      setStatus(res.ok ? "success" : "error");
    } catch (err) {
      setStatus("error");
      setResponseBody(String(err));
    }
  }

  return (
    <div className="border-t border-border pt-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">Try it</h4>
        {ep.auth && (
          <span className="text-xs text-yellow-400/80 bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 rounded">
            Requires INTERNAL_API_TOKEN
          </span>
        )}
        {isDestructive && (
          <span className="text-xs text-orange-400/80 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded">
            {ep.method} — may modify or delete data
          </span>
        )}
      </div>

      {ep.auth && (
        <div>
          <label className="text-xs text-muted-foreground block mb-1">
            Token <span className="text-muted-foreground/50">(Bearer)</span>
          </label>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste your INTERNAL_API_TOKEN here"
            type="password"
            className="w-full text-xs font-mono bg-background border border-border rounded px-2 py-1.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}

      {ep.params.length > 0 && (
        <div className="space-y-2">
          {ep.params.map((p) => (
            <div key={p.name}>
              <label className="text-xs text-muted-foreground block mb-1">
                <span className="font-mono text-foreground/80">{p.name}</span>
                <span className="ml-1 text-muted-foreground/50">({p.in})</span>
                {p.required && <span className="ml-1 text-supply font-bold">*</span>}
              </label>
              <input
                value={paramValues[p.name] ?? ""}
                onChange={(e) => {
                  setParamValues((prev) => ({ ...prev, [p.name]: e.target.value }));
                  if (validationErrors.length > 0) setValidationErrors([]);
                }}
                placeholder={p.description}
                className={cn(
                  "w-full text-xs font-mono bg-background border rounded px-2 py-1.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring",
                  p.required && !paramValues[p.name]?.trim() && validationErrors.length > 0
                    ? "border-red-500/50"
                    : "border-border",
                )}
              />
            </div>
          ))}
        </div>
      )}

      {validationErrors.length > 0 && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5 space-y-0.5">
          {validationErrors.map((e) => (
            <div key={e}>• {e}</div>
          ))}
        </div>
      )}

      <button
        onClick={handleSend}
        disabled={status === "loading"}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        <Play className="h-3 w-3" />
        {status === "loading" ? "Sending…" : "Send Request"}
      </button>

      {status !== "idle" && status !== "loading" && (
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">Response</h4>
            {statusCode !== null && (
              <span
                className={cn(
                  "text-xs font-mono px-1.5 py-0.5 rounded border",
                  statusCode >= 200 && statusCode < 300
                    ? "bg-green-500/15 text-green-400 border-green-500/30"
                    : "bg-red-500/15 text-red-400 border-red-500/30",
                )}
              >
                {statusCode}
              </span>
            )}
          </div>
          <pre className="bg-background rounded-md p-3 text-xs font-mono text-muted-foreground overflow-x-auto border border-border max-h-64 overflow-y-auto">
            {responseBody || "(empty body)"}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

const METHOD_STYLES: Record<HttpMethod, string> = {
  GET: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
  POST: "bg-green-500/15 text-green-400 border border-green-500/30",
  PUT: "bg-orange-500/15 text-orange-400 border border-orange-500/30",
  PATCH: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30",
  DELETE: "bg-red-500/15 text-red-400 border border-red-500/30",
};

function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <span className={cn("px-2 py-0.5 rounded text-xs font-mono font-bold uppercase", METHOD_STYLES[method])}>
      {method}
    </span>
  );
}

function EndpointCard({ ep }: { ep: Endpoint }) {
  const [open, setOpen] = useState(false);
  const [tryItOpen, setTryItOpen] = useState(false);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-card hover:bg-accent/30 transition-colors text-left"
      >
        <MethodBadge method={ep.method} />
        <code className="text-sm font-mono text-foreground flex-1">{ep.path}</code>
        <span className="text-sm text-muted-foreground hidden sm:block">{ep.summary}</span>
        {ep.auth && (
          <Lock className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" aria-label="Requires authentication" />
        )}
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-3 bg-card/50 border-t border-border space-y-4">
          <p className="text-sm text-muted-foreground">{ep.description}</p>

          {ep.params.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Parameters</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-1 pr-4 font-medium">Name</th>
                      <th className="pb-1 pr-4 font-medium">In</th>
                      <th className="pb-1 pr-4 font-medium">Required</th>
                      <th className="pb-1 pr-4 font-medium">Type</th>
                      <th className="pb-1 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ep.params.map((p) => (
                      <tr key={p.name} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5 pr-4 font-mono text-foreground">{p.name}</td>
                        <td className="py-1.5 pr-4 text-muted-foreground">{p.in}</td>
                        <td className="py-1.5 pr-4">
                          {p.required ? (
                            <span className="text-supply text-xs font-medium">required</span>
                          ) : (
                            <span className="text-muted-foreground/60 text-xs">optional</span>
                          )}
                        </td>
                        <td className="py-1.5 pr-4 font-mono text-muted-foreground">{p.type}</td>
                        <td className="py-1.5 text-muted-foreground">{p.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Example Response</h4>
            <pre className="bg-background rounded-md p-3 text-xs font-mono text-muted-foreground overflow-x-auto border border-border">
              {JSON.stringify(ep.exampleResponse, null, 2)}
            </pre>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => setTryItOpen((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border transition-colors",
                tryItOpen
                  ? "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20"
                  : "bg-accent hover:bg-accent/80 text-foreground border-border",
              )}
            >
              <Play className="h-3 w-3" />
              {tryItOpen ? "Hide" : "Try it"}
            </button>
          </div>

          {tryItOpen && <TryItPanel ep={ep} />}
        </div>
      )}
    </div>
  );
}

function CategorySection({ cat }: { cat: Category }) {
  const [open, setOpen] = useState(true);

  return (
    <section>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full text-left mb-3"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <h2 className="text-base font-semibold text-foreground">{cat.title}</h2>
        <span className="text-xs text-muted-foreground bg-accent/50 px-2 py-0.5 rounded-full">
          {cat.endpoints.length} endpoint{cat.endpoints.length !== 1 ? "s" : ""}
        </span>
      </button>
      {open && (
        <>
          <p className="text-sm text-muted-foreground mb-3 ml-6">{cat.description}</p>
          <div className="ml-6 space-y-2">
            {cat.endpoints.map((ep) => (
              <EndpointCard key={`${ep.method}${ep.path}`} ep={ep} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function WsSection({ stream }: { stream: WsStream }) {
  const [open, setOpen] = useState(true);

  return (
    <section className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-card hover:bg-accent/30 transition-colors text-left"
      >
        <span className="bg-purple-500/15 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded text-xs font-bold uppercase font-mono">
          WS
        </span>
        <code className="text-sm font-mono text-foreground flex-1">{stream.path}</code>
        {stream.auth && (
          <Lock className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" aria-label="Requires token" />
        )}
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-3 bg-card/50 border-t border-border space-y-4">
          <p className="text-sm text-muted-foreground">{stream.description}</p>

          <div>
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Event Types</h4>
            <div className="space-y-3">
              {stream.events.map((ev) => (
                <div key={ev.type} className="border border-border/50 rounded-md p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Zap className="h-3.5 w-3.5 text-yellow-400" />
                    <code className="text-sm font-mono text-yellow-400">{ev.type}</code>
                  </div>
                  <p className="text-xs text-muted-foreground">{ev.description}</p>
                  <pre className="bg-background rounded-md p-3 text-xs font-mono text-muted-foreground overflow-x-auto border border-border">
                    {JSON.stringify(ev.payload, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-accent hover:bg-accent/80 text-foreground border border-border transition-colors shrink-0"
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function McpIntegrationSection() {
  const mcpUrl = `${window.location.origin}/api/mcp`;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        The MCP server uses the{" "}
        <span className="text-foreground font-medium">Streamable HTTP</span> transport. Connect with any MCP-compatible
        AI agent or client (Claude Desktop, Cursor, etc.) using the URL below. Requires{" "}
        <code className="font-mono bg-accent/50 px-1 py-0.5 rounded text-xs">Authorization: Bearer &lt;token&gt;</code>.
      </p>

      {/* URL row with copy button */}
      <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-2">
        <span className="text-xs text-muted-foreground shrink-0">Server URL</span>
        <code className="text-sm font-mono text-foreground flex-1 truncate">{mcpUrl}</code>
        <CopyButton text={mcpUrl} />
      </div>

      {/* Transport explanation */}
      <div className="rounded-lg border border-border overflow-hidden text-xs">
        <div className="px-3 py-2 bg-card/80 border-b border-border font-semibold text-foreground">
          How to connect
        </div>
        <div className="px-3 py-3 bg-card/30 space-y-2 text-muted-foreground">
          <div className="flex gap-2">
            <span className="bg-green-500/15 text-green-400 border border-green-500/30 px-1.5 py-0.5 rounded font-mono font-bold shrink-0">POST</span>
            <div>
              <code className="text-foreground/80">{mcpUrl}</code> — send an{" "}
              <code>initialize</code> request (no <code>mcp-session-id</code> header) to start a session.
              The response will include an <code>mcp-session-id</code> header to reuse for subsequent calls.
            </div>
          </div>
          <div className="flex gap-2">
            <span className="bg-blue-500/15 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded font-mono font-bold shrink-0">GET</span>
            <div>
              <code className="text-foreground/80">{mcpUrl}</code> — open an SSE stream for server-sent
              events. Pass the <code>mcp-session-id</code> header from the initialize response.
            </div>
          </div>
          <div className="flex gap-2">
            <span className="bg-red-500/15 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded font-mono font-bold shrink-0">DELETE</span>
            <div>
              <code className="text-foreground/80">{mcpUrl}</code> — close and clean up a session.
              Pass the <code>mcp-session-id</code> header.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function McpToolCard({ tool }: { tool: McpTool }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-card hover:bg-accent/30 transition-colors text-left"
      >
        <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <code className="text-sm font-mono text-foreground flex-1">{tool.name}</code>
        {tool.hints.readOnly ? (
          <span className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded hidden sm:block">
            read-only
          </span>
        ) : (
          <span className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded hidden sm:block">
            write
          </span>
        )}
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-3 bg-card/50 border-t border-border space-y-4">
          <p className="text-sm text-muted-foreground">{tool.description}</p>

          {tool.params.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Parameters</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-1 pr-4 font-medium">Name</th>
                      <th className="pb-1 pr-4 font-medium">Type</th>
                      <th className="pb-1 pr-4 font-medium">Required</th>
                      <th className="pb-1 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tool.params.map((p) => (
                      <tr key={p.name} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5 pr-4 font-mono text-foreground">{p.name}</td>
                        <td className="py-1.5 pr-4 font-mono text-muted-foreground">{p.type}</td>
                        <td className="py-1.5 pr-4">
                          {p.required ? (
                            <span className="text-supply text-xs font-medium">required</span>
                          ) : (
                            <span className="text-muted-foreground/60 text-xs">optional</span>
                          )}
                        </td>
                        <td className="py-1.5 text-muted-foreground">{p.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-1">Returns</h4>
            <p className="text-sm text-muted-foreground">{tool.returns}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function DocsPage() {
  function handleDownloadOpenApi() {
    const spec = buildOpenApiSpec();
    downloadFile("openapi.json", JSON.stringify(spec, null, 2), "application/json");
  }

  function handleDownloadMarkdown() {
    const md = buildMarkdown();
    downloadFile("zones-api.md", md, "text/markdown");
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-10">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">API Reference</h1>
            <p className="mt-1 text-sm text-muted-foreground max-w-xl">
              Complete reference for the Zones API — REST endpoints, WebSocket streams, and MCP tools.
              All endpoints require an{" "}
              <code className="text-xs font-mono bg-accent/50 px-1 py-0.5 rounded">Authorization: Bearer</code> token
              unless otherwise noted.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={handleDownloadOpenApi}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium bg-accent hover:bg-accent/80 text-foreground transition-colors border border-border"
            >
              <Download className="h-3.5 w-3.5" />
              OpenAPI JSON
            </button>
            <button
              onClick={handleDownloadMarkdown}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium bg-accent hover:bg-accent/80 text-foreground transition-colors border border-border"
            >
              <Download className="h-3.5 w-3.5" />
              Markdown
            </button>
          </div>
        </div>

        {/* Authentication callout */}
        <div className="flex items-start gap-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-4 py-3">
          <Lock className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
          <div className="text-sm">
            <span className="font-semibold text-yellow-400">Authentication</span>
            <span className="text-muted-foreground">
              {" "}— Set the{" "}
              <code className="font-mono bg-accent/50 px-1 py-0.5 rounded text-xs">INTERNAL_API_TOKEN</code> environment
              variable on the API server. For REST requests, pass the same value as{" "}
              <code className="font-mono bg-accent/50 px-1 py-0.5 rounded text-xs">Authorization: Bearer &lt;token&gt;</code>.
              For WebSocket connections, pass it as{" "}
              <code className="font-mono bg-accent/50 px-1 py-0.5 rounded text-xs">Authorization: Bearer &lt;token&gt;</code>{" "}
              in the upgrade request headers, or as the{" "}
              <code className="font-mono bg-accent/50 px-1 py-0.5 rounded text-xs">token</code> query parameter.
            </span>
          </div>
        </div>

        {/* REST endpoints */}
        <div className="space-y-8">
          <div className="flex items-center gap-3 border-b border-border pb-2">
            <h2 className="text-lg font-bold text-foreground">REST Endpoints</h2>
            <span className="text-xs text-muted-foreground">Base path: /api</span>
          </div>
          {CATEGORIES.map((cat) => (
            <CategorySection key={cat.id} cat={cat} />
          ))}
        </div>

        {/* WebSocket streams */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 border-b border-border pb-2">
            <h2 className="text-lg font-bold text-foreground">WebSocket Streams</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Connect using a standard WebSocket client. Authenticate by passing{" "}
            <code className="font-mono bg-accent/50 px-1 py-0.5 rounded text-xs">Authorization: Bearer &lt;token&gt;</code>{" "}
            in the upgrade request headers, or append{" "}
            <code className="font-mono bg-accent/50 px-1 py-0.5 rounded text-xs">?token=&lt;token&gt;</code> to the URL.
            Messages are JSON-encoded{" "}
            <code className="font-mono bg-accent/50 px-1 py-0.5 rounded text-xs">StreamEvent</code> objects.
          </p>
          <div className="space-y-3">
            {WS_STREAMS.map((ws) => (
              <WsSection key={ws.path} stream={ws} />
            ))}
          </div>
        </div>

        {/* MCP interface */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 border-b border-border pb-2">
            <h2 className="text-lg font-bold text-foreground">MCP Interface</h2>
          </div>

          <McpIntegrationSection />

          <div className="space-y-2">
            {MCP_TOOLS.map((tool) => (
              <McpToolCard key={tool.name} tool={tool} />
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-border text-xs text-muted-foreground text-center">
          Zones API — generated from source. Use the download buttons above to export the full spec.
        </div>
      </div>
    </div>
  );
}
