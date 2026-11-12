const PARALLEL_MCP_URL = "https://mcp.parallel.ai/mcp";
const MCP_PROTOCOL_VERSION = "2025-03-26";
const ENABLED_PARALLEL_TOOLS = new Set([
  "web_search",
  "web_fetch",
  "web_research",
  "web_decisions",
]);

type ParallelTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

type McpEnvelope = {
  result?: Record<string, unknown>;
  error?: { message?: string };
};

type ParallelMcpSession = {
  sessionId?: string;
  nextRequestId: number;
};

export class ParallelMcpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParallelMcpError";
  }
}

function extractMcpResponse(text: string): McpEnvelope {
  const trimmed = text.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed) as McpEnvelope;
    } catch {
      throw new ParallelMcpError("Parallel MCP returned invalid JSON.");
    }
  }

  const data = trimmed
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  for (const entry of data) {
    try {
      return JSON.parse(entry) as McpEnvelope;
    } catch {
      continue;
    }
  }
  throw new ParallelMcpError("Parallel MCP returned an unsupported response.");
}

async function postMcpMessage(
  session: ParallelMcpSession,
  body: Record<string, unknown>,
) {
  const apiKey = process.env.PARALLEL_API_KEY;
  try {
    const response = await fetch(PARALLEL_MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        ...(session.sessionId ? { "MCP-Session-Id": session.sessionId } : {}),
        ...(session.sessionId ? { "MCP-Protocol-Version": MCP_PROTOCOL_VERSION } : {}),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!response.ok && response.status !== 202) {
      const details = (await response.text()).slice(0, 500);
      throw new ParallelMcpError(
        `Parallel MCP request failed (${response.status})${details ? `: ${details}` : "."}`,
      );
    }
    session.sessionId = response.headers.get("MCP-Session-Id") || session.sessionId;
    if (response.status === 202) return null;

    const payload = extractMcpResponse(await response.text());
    if (payload.error) {
      throw new ParallelMcpError(payload.error.message || "Parallel MCP returned an error.");
    }
    return payload.result || null;
  } catch (error) {
    if (error instanceof ParallelMcpError) throw error;
    throw new ParallelMcpError(
      error instanceof Error ? error.message : "Parallel MCP request failed.",
    );
  }
}

export async function initializeParallelMcp(): Promise<ParallelMcpSession> {
  const session: ParallelMcpSession = { nextRequestId: 1 };
  const result = await postMcpMessage(session, {
    jsonrpc: "2.0",
    id: session.nextRequestId++,
    method: "initialize",
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "Teller AI", version: "1.0.0" },
    },
  });
  if (!result) throw new ParallelMcpError("Parallel MCP did not complete initialization.");

  await postMcpMessage(session, {
    jsonrpc: "2.0",
    method: "notifications/initialized",
  });
  return session;
}

export async function listParallelTools(session: ParallelMcpSession) {
  const result = await postMcpMessage(session, {
    jsonrpc: "2.0",
    id: session.nextRequestId++,
    method: "tools/list",
  });
  const tools = result?.tools;
  if (!Array.isArray(tools)) throw new ParallelMcpError("Parallel MCP did not return a tools list.");

  return tools.flatMap((tool): ParallelTool[] => {
    if (
      !tool ||
      typeof tool !== "object" ||
      !("name" in tool) ||
      typeof tool.name !== "string" ||
      !ENABLED_PARALLEL_TOOLS.has(tool.name) ||
      !("inputSchema" in tool) ||
      !tool.inputSchema ||
      typeof tool.inputSchema !== "object" ||
      Array.isArray(tool.inputSchema)
    ) return [];

    return [{
      name: tool.name,
      description: "description" in tool && typeof tool.description === "string"
        ? tool.description
        : "",
      inputSchema: tool.inputSchema as Record<string, unknown>,
    }];
  });
}

export function buildParallelOpenAITools(tools: ParallelTool[]) {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: `parallel_${tool.name}`,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

export function mapOpenAIToolNameToParallelTool(name: string) {
  const candidate = name.startsWith("parallel_") ? name.slice("parallel_".length) : "";
  return ENABLED_PARALLEL_TOOLS.has(candidate) ? candidate : null;
}

export async function callParallelTool(
  session: ParallelMcpSession,
  toolName: string,
  args: Record<string, unknown>,
) {
  if (!ENABLED_PARALLEL_TOOLS.has(toolName)) {
    throw new ParallelMcpError("That Parallel MCP tool is not enabled in Teller AI.");
  }
  const result = await postMcpMessage(session, {
    jsonrpc: "2.0",
    id: session.nextRequestId++,
    method: "tools/call",
    params: { name: toolName, arguments: args },
  });
  if (!result) throw new ParallelMcpError("Parallel MCP returned an empty tool result.");
  if (result.isError === true) {
    const content = result.content;
    const message = Array.isArray(content)
      ? content.flatMap((part) => (
          part && typeof part === "object" && "text" in part && typeof part.text === "string"
            ? [part.text]
            : []
        )).join("\n")
      : "";
    throw new ParallelMcpError(message || "Parallel MCP tool call failed.");
  }
  return result;
}
