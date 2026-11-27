const COMPOSIO_API_URL = "https://backend.composio.dev/api/v3.1/tool_router";
const COMPOSIO_CATALOG_URL = "https://backend.composio.dev/api/v3.1";

type JsonRecord = Record<string, unknown>;

const CHAT_META_TOOLS = new Set([
  "COMPOSIO_SEARCH_TOOLS",
  "COMPOSIO_GET_TOOL_SCHEMAS",
  "COMPOSIO_MANAGE_CONNECTIONS",
  "COMPOSIO_MULTI_EXECUTE_TOOL",
]);

export type ComposioToolkit = {
  slug: string;
  name: string;
  description: string;
  logo: string | null;
  connected: boolean;
};

export type ComposioSessionTool = {
  slug: string;
  description: string;
  inputParameters: JsonRecord;
};

export type ComposioPendingAction = {
  sessionId: string;
  toolSlug: string;
  arguments: JsonRecord;
  actions: Array<{
    toolSlug: string;
    description: string;
    arguments: JsonRecord;
  }>;
};

export class ComposioError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "ComposioError";
    this.status = status;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getApiKey() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    throw new ComposioError("Composio is not configured. Set COMPOSIO_API_KEY on the server.", 503);
  }
  return apiKey;
}

export function isComposioConfigured() {
  return Boolean(process.env.COMPOSIO_API_KEY);
}

async function requestComposioJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "x-api-key": getApiKey(),
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });

  const body = await response.text();
  let payload: unknown;
  try {
    payload = body ? JSON.parse(body) : {};
  } catch {
    throw new ComposioError("Composio returned an invalid response.");
  }
  if (!response.ok) {
    throw new ComposioError(`Composio request failed (${response.status}).`);
  }
  if (!isRecord(payload)) {
    throw new ComposioError("Composio returned an invalid response.");
  }
  return payload;
}

async function composioRequest(path: string, init: RequestInit = {}) {
  return requestComposioJson(`${COMPOSIO_API_URL}${path}`, init);
}

async function createComposioSession(userId: string, mcp: boolean) {
  const payload = await composioRequest("/session", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, ...(mcp ? { mcp: true } : {}) }),
  });
  if (typeof payload.session_id !== "string" || !payload.session_id) {
    throw new ComposioError("Composio did not return a session ID.");
  }
  return payload.session_id;
}

async function createMcpSession(userId: string) {
  return createComposioSession(userId, true);
}

export async function createComposioChatSession(userId: string) {
  return createComposioSession(userId, false);
}

export async function listComposioChatTools(sessionId: string) {
  const tools: ComposioSessionTool[] = [];
  let cursor: string | null = null;
  let pageCount = 0;

  do {
    const query = new URLSearchParams({ limit: "100" });
    if (cursor) query.set("cursor", cursor);
    const payload = await composioRequest(
      `/session/${encodeURIComponent(sessionId)}/tools?${query.toString()}`,
    );
    if (!Array.isArray(payload.items)) {
      throw new ComposioError("Composio did not return the session tools.");
    }

    tools.push(...payload.items.flatMap((item): ComposioSessionTool[] => {
      if (
        !isRecord(item) ||
        typeof item.slug !== "string" ||
        !CHAT_META_TOOLS.has(item.slug) ||
        !isRecord(item.input_parameters)
      ) return [];
      return [{
        slug: item.slug,
        description: typeof item.description === "string" ? item.description : "",
        inputParameters: item.input_parameters,
      }];
    }));

    const nextCursor = typeof payload.next_cursor === "string" && payload.next_cursor
      ? payload.next_cursor
      : null;
    if (nextCursor === cursor) {
      throw new ComposioError("Composio returned an invalid session tool cursor.");
    }
    cursor = nextCursor;
    pageCount += 1;
    if (pageCount > 10) throw new ComposioError("Composio returned too many session tool pages.");
  } while (cursor);

  return tools;
}

export async function executeComposioChatTool(
  sessionId: string,
  toolSlug: string,
  arguments_: JsonRecord,
) {
  if (!CHAT_META_TOOLS.has(toolSlug)) {
    throw new ComposioError("That Composio tool is not enabled in chat.", 403);
  }
  const payload = await composioRequest(`/session/${encodeURIComponent(sessionId)}/execute`, {
    method: "POST",
    body: JSON.stringify({ tool_slug: toolSlug, arguments: arguments_ }),
  });
  if (payload.result_type === "failed" || payload.resultType === "failed") {
    throw new ComposioError(
      typeof payload.error === "string" ? payload.error : "The Composio tool call failed.",
    );
  }
  if (payload.result_type === "input_required" || payload.resultType === "input_required") {
    throw new ComposioError("This Composio tool needs additional input before it can continue.");
  }
  return isRecord(payload.data) ? payload.data : payload;
}

export async function isComposioToolReadOnly(toolSlug: string) {
  if (!/^[A-Z0-9_]+$/.test(toolSlug)) return false;
  const payload = await requestComposioJson(
    `${COMPOSIO_CATALOG_URL}/tools/${encodeURIComponent(toolSlug)}`,
  );
  const tool = isRecord(payload.data) ? payload.data : payload;
  const tags = isRecord(tool.tags) ? tool.tags : null;
  if (Array.isArray(tool.tags)) {
    return tool.tags.some((tag) => (
      tag === "readOnlyHint" ||
      (isRecord(tag) && (tag.name === "readOnlyHint" || tag.readOnlyHint === true))
    ));
  }
  const annotations = isRecord(tool.annotations) ? tool.annotations : null;
  return tags?.readOnlyHint === true ||
    annotations?.readOnlyHint === true ||
    tool.read_only === true ||
    tool.readOnly === true;
}

function normalizeToolkit(value: unknown): ComposioToolkit | null {
  if (!isRecord(value) || typeof value.slug !== "string" || typeof value.name !== "string") {
    return null;
  }

  const connection = isRecord(value.connection) ? value.connection : {};
  const connectedAccount = connection.connected_account ?? connection.connectedAccount;
  const logo = typeof value.logo === "string" ? value.logo : null;
  let safeLogo: string | null = null;
  if (logo) {
    try {
      const url = new URL(logo);
      if (url.protocol === "https:") safeLogo = url.toString();
    } catch {
      safeLogo = null;
    }
  }

  return {
    slug: value.slug,
    name: value.name,
    description: typeof value.description === "string" ? value.description : "",
    logo: safeLogo,
    connected: (connection.is_active === true || connection.isActive === true) && Boolean(connectedAccount),
  };
}

export async function listComposioToolkits(userId: string) {
  const sessionId = await createMcpSession(userId);
  const toolkits: ComposioToolkit[] = [];
  let cursor: string | null = null;
  let pageCount = 0;

  do {
    const query = new URLSearchParams({ limit: "50" });
    if (cursor) query.set("cursor", cursor);
    const payload = await composioRequest(
      `/session/${encodeURIComponent(sessionId)}/toolkits?${query.toString()}`,
    );
    if (!Array.isArray(payload.items)) {
      throw new ComposioError("Composio did not return an app connector list.");
    }
    toolkits.push(...payload.items.flatMap((item) => {
      const toolkit = normalizeToolkit(item);
      return toolkit ? [toolkit] : [];
    }));

    const nextCursor = typeof payload.next_cursor === "string" && payload.next_cursor
      ? payload.next_cursor
      : null;
    if (nextCursor === cursor) {
      throw new ComposioError("Composio returned an invalid connector page cursor.");
    }
    cursor = nextCursor;
    pageCount += 1;
    if (pageCount > 100) {
      throw new ComposioError("Composio returned too many connector pages.");
    }
  } while (cursor);

  return toolkits;
}

export async function createComposioConnectLink(
  userId: string,
  toolkit: string,
  callbackUrl: string,
) {
  const sessionId = await createMcpSession(userId);
  const payload = await composioRequest(`/session/${encodeURIComponent(sessionId)}/link`, {
    method: "POST",
    body: JSON.stringify({ toolkit, callback_url: callbackUrl }),
  });
  if (typeof payload.redirect_url !== "string") {
    throw new ComposioError("Composio did not return a connection URL.");
  }

  let redirectUrl: URL;
  try {
    redirectUrl = new URL(payload.redirect_url);
  } catch {
    throw new ComposioError("Composio returned an invalid connection URL.");
  }
  if (redirectUrl.protocol !== "https:" || !redirectUrl.hostname.endsWith(".composio.dev")) {
    throw new ComposioError("Composio returned an untrusted connection URL.");
  }
  return redirectUrl.toString();
}
