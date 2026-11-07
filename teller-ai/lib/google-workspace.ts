import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import {
  deleteGoogleConnection,
  getGoogleConnection,
  saveGoogleConnection,
  type GooglePendingAction,
} from "@/lib/postgres";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_MCP_URL = process.env.GMAIL_MCP_SERVER_URL || "https://gmailmcp.googleapis.com/mcp/v1";
const MCP_PROTOCOL_VERSION = "2025-03-26";
const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar.events",
];

type GoogleTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type McpTool = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
};

type McpEnvelope = {
  result?: Record<string, unknown>;
  error?: { message?: string };
};

function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth is not configured. Set the Google OAuth client ID, secret, and redirect URI.");
  }
  return { clientId, clientSecret, redirectUri };
}

function getEncryptionKey() {
  const configuredKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!configuredKey) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY is not configured.");
  }
  const key = Buffer.from(configuredKey, "base64");
  if (key.length !== 32) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  return key;
}

function encryptTokens(tokens: GoogleTokens) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(tokens), "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64")).join(".");
}

function decryptTokens(encrypted: string): GoogleTokens {
  const [iv, authTag, ciphertext] = encrypted.split(".").map((part) => Buffer.from(part, "base64"));
  if (!iv || !authTag || !ciphertext) throw new Error("Stored Google credentials are invalid.");
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  const parsed: unknown = JSON.parse(plaintext);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("accessToken" in parsed) ||
    typeof parsed.accessToken !== "string" ||
    !("refreshToken" in parsed) ||
    typeof parsed.refreshToken !== "string" ||
    !("expiresAt" in parsed) ||
    typeof parsed.expiresAt !== "number"
  ) {
    throw new Error("Stored Google credentials are invalid.");
  }
  return parsed as GoogleTokens;
}

export function isGoogleOAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_OAUTH_REDIRECT_URI &&
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY,
  );
}

export function createGoogleAuthorizationUrl(state: string) {
  const { clientId, redirectUri } = getGoogleOAuthConfig();
  const url = new URL(GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  }).toString();
  return url.toString();
}

async function requestGoogleTokens(parameters: URLSearchParams): Promise<GoogleTokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: parameters,
    cache: "no-store",
  });
  const data = await response.json() as GoogleTokenResponse;
  if (!response.ok || data.error) {
    throw new Error(data.error_description || data.error || "Google OAuth token exchange failed.");
  }
  return data;
}

export async function completeGoogleAuthorization(code: string, userId: string) {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();
  const tokenResponse = await requestGoogleTokens(new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  }));
  if (!tokenResponse.access_token || !tokenResponse.refresh_token) {
    throw new Error("Google did not return the access and refresh tokens required for this connection.");
  }

  const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
    cache: "no-store",
  });
  if (!profileResponse.ok) throw new Error("Could not read the connected Google account.");
  const profile: unknown = await profileResponse.json();
  const email = profile && typeof profile === "object" && "email" in profile && typeof profile.email === "string"
    ? profile.email
    : null;
  if (!email) throw new Error("Google did not return an email address for this account.");

  const expiresAt = Date.now() + (tokenResponse.expires_in || 3600) * 1000;
  const encryptedTokens = encryptTokens({
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    expiresAt,
  });
  await saveGoogleConnection(userId, email, encryptedTokens);
}

export async function getGoogleConnectionStatus(userId: string) {
  const connection = await getGoogleConnection(userId);
  return {
    configured: isGoogleOAuthConfigured(),
    connected: Boolean(connection),
    email: connection?.email ?? null,
  };
}

export async function disconnectGoogleAccount(userId: string) {
  const connection = await getGoogleConnection(userId);
  if (connection) {
    const tokens = decryptTokens(connection.encryptedTokens);
    const response = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: tokens.refreshToken }),
      cache: "no-store",
    });
    if (!response.ok && response.status !== 400) {
      throw new Error(`Google could not revoke access (${response.status}).`);
    }
  }
  await deleteGoogleConnection(userId);
}

export async function getGoogleAccessToken(userId: string) {
  const connection = await getGoogleConnection(userId);
  if (!connection) throw new Error("Connect a Google account to use CyberMail.");
  const tokens = decryptTokens(connection.encryptedTokens);
  if (tokens.expiresAt > Date.now() + 60_000) return tokens.accessToken;

  const { clientId, clientSecret } = getGoogleOAuthConfig();
  const refreshed = await requestGoogleTokens(new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: tokens.refreshToken,
    grant_type: "refresh_token",
  }));
  if (!refreshed.access_token) throw new Error("Google did not return a refreshed access token.");

  const nextTokens: GoogleTokens = {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || tokens.refreshToken,
    expiresAt: Date.now() + (refreshed.expires_in || 3600) * 1000,
  };
  await saveGoogleConnection(userId, connection.email, encryptTokens(nextTokens));
  return nextTokens.accessToken;
}

function extractMcpResponse(text: string): McpEnvelope {
  const trimmed = text.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith("{")) return JSON.parse(trimmed) as McpEnvelope;
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
  throw new Error("Google Gmail MCP returned an unsupported response.");
}

async function postMcpMessage(
  accessToken: string,
  body: Record<string, unknown>,
  sessionId?: string,
) {
  const response = await fetch(GMAIL_MCP_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(sessionId ? { "MCP-Session-Id": sessionId } : {}),
      ...(sessionId ? { "MCP-Protocol-Version": MCP_PROTOCOL_VERSION } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok && response.status !== 202) {
    const details = await response.text();
    throw new Error(`Gmail MCP request failed (${response.status})${details ? `: ${details.slice(0, 500)}` : "."}`);
  }
  if (response.status === 202) {
    return { response: null, sessionId: response.headers.get("MCP-Session-Id") || sessionId };
  }
  const payload = extractMcpResponse(await response.text());
  if (payload.error) throw new Error(payload.error.message || "Gmail MCP returned an error.");
  return {
    response: payload.result || null,
    sessionId: response.headers.get("MCP-Session-Id") || sessionId,
  };
}

async function initializeGmailMcp(accessToken: string) {
  const initialized = await postMcpMessage(accessToken, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "Teller CyberMail", version: "1.0.0" },
    },
  });
  if (!initialized.response) throw new Error("Gmail MCP did not complete initialization.");
  await postMcpMessage(accessToken, {
    jsonrpc: "2.0",
    method: "notifications/initialized",
  }, initialized.sessionId || undefined);
  return initialized.sessionId || undefined;
}

export async function listGmailTools(accessToken: string) {
  const sessionId = await initializeGmailMcp(accessToken);
  const response = await postMcpMessage(accessToken, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
  }, sessionId);
  const tools = response.response?.tools;
  if (!Array.isArray(tools)) throw new Error("Gmail MCP did not return a tools list.");
  return tools.flatMap((tool): McpTool[] => {
    if (
      !tool ||
      typeof tool !== "object" ||
      !("name" in tool) ||
      typeof tool.name !== "string" ||
      !["gmail.search_threads", "gmail.get_thread", "gmail.create_draft"].includes(tool.name) ||
      !("inputSchema" in tool) ||
      !tool.inputSchema ||
      typeof tool.inputSchema !== "object"
    ) return [];
    return [{
      name: tool.name,
      description: "description" in tool && typeof tool.description === "string" ? tool.description : "",
      inputSchema: tool.inputSchema as Record<string, unknown>,
    }];
  });
}

export async function callGmailTool(
  accessToken: string,
  toolName: string,
  args: Record<string, unknown>,
) {
  if (!["gmail.search_threads", "gmail.get_thread", "gmail.create_draft"].includes(toolName)) {
    throw new Error("That Gmail action is not enabled in CyberMail.");
  }
  const sessionId = await initializeGmailMcp(accessToken);
  const response = await postMcpMessage(accessToken, {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: toolName, arguments: args },
  }, sessionId);
  const result = response.response;
  if (!result) throw new Error("Gmail MCP returned an empty tool result.");
  if (result.isError === true) {
    const content = result.content;
    const message = Array.isArray(content)
      ? content.flatMap((part) => part && typeof part === "object" && "text" in part && typeof part.text === "string" ? [part.text] : []).join("\n")
      : "";
    throw new Error(message || "Gmail MCP action failed.");
  }
  return result;
}

export const CYBER_CALENDAR_TOOLS = [
  {
    type: "function",
    function: {
      name: "calendar_list_events",
      description: "Read calendar events in the requested time range.",
      parameters: {
        type: "object",
        properties: {
          timeMin: { type: "string", description: "Start time as an ISO 8601 date-time." },
          timeMax: { type: "string", description: "End time as an ISO 8601 date-time." },
        },
        required: ["timeMin", "timeMax"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calendar_create_event",
      description: "Propose creating a calendar event. CyberMail always asks the user to confirm before creating it.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Event title." },
          description: { type: "string", description: "Optional event description." },
          start: { type: "string", description: "Event start as an ISO 8601 date-time including timezone." },
          end: { type: "string", description: "Event end as an ISO 8601 date-time including timezone." },
          timeZone: { type: "string", description: "IANA time zone, for example Africa/Johannesburg." },
        },
        required: ["summary", "start", "end", "timeZone"],
        additionalProperties: false,
      },
    },
  },
] as const;

export function buildOpenAITools(gmailTools: McpTool[]) {
  const gmail = gmailTools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name.replaceAll(".", "_"),
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
  return [...gmail, ...CYBER_CALENDAR_TOOLS];
}

export function mapOpenAIToolNameToGmailTool(name: string) {
  const candidate = name.replaceAll("_", ".");
  return ["gmail.search_threads", "gmail.get_thread", "gmail.create_draft"].includes(candidate)
    ? candidate
    : null;
}

function requireString(args: Record<string, unknown>, key: string, maxLength: number) {
  const value = args[key];
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new Error(`Enter a valid ${key}.`);
  }
  return value.trim();
}

export function validatePendingGoogleAction(action: GooglePendingAction): GooglePendingAction {
  if (action.type === "gmail.create_draft") {
    const to = requireString(action.arguments, "to", 500);
    const subject = requireString(action.arguments, "subject", 500);
    const body = requireString(action.arguments, "body", 20_000);
    return { type: action.type, arguments: { to, subject, body } };
  }
  if (action.type === "calendar.create_event") {
    const summary = requireString(action.arguments, "summary", 500);
    const start = requireString(action.arguments, "start", 100);
    const end = requireString(action.arguments, "end", 100);
    const timeZone = requireString(action.arguments, "timeZone", 100);
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate) {
      throw new Error("The calendar event needs a valid start and end time.");
    }
    const description = typeof action.arguments.description === "string"
      ? action.arguments.description.slice(0, 5000)
      : "";
    return {
      type: action.type,
      arguments: { summary, description, start, end, timeZone },
    };
  }
  throw new Error("That Google action is not allowed.");
}

export async function listCalendarEvents(
  accessToken: string,
  args: Record<string, unknown>,
) {
  const timeMin = requireString(args, "timeMin", 100);
  const timeMax = requireString(args, "timeMax", 100);
  const start = new Date(timeMin);
  const end = new Date(timeMax);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    throw new Error("Provide a valid calendar time range.");
  }
  const query = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Google Calendar could not list events (${response.status}).`);
  const data: unknown = await response.json();
  return data && typeof data === "object" ? data : {};
}

export async function executePendingGoogleAction(
  accessToken: string,
  action: GooglePendingAction,
) {
  const validated = validatePendingGoogleAction(action);
  if (validated.type === "gmail.create_draft") {
    const result = await callGmailTool(accessToken, validated.type, validated.arguments);
    return { message: "Draft created in Gmail. Review it in your Drafts folder before sending.", result };
  }

  const args = validated.arguments;
  const body = {
    summary: args.summary,
    description: args.description,
    start: { dateTime: args.start, timeZone: args.timeZone },
    end: { dateTime: args.end, timeZone: args.timeZone },
  };
  const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Google Calendar could not create the event (${response.status}).`);
  const created: unknown = await response.json();
  const link = created && typeof created === "object" && "htmlLink" in created && typeof created.htmlLink === "string"
    ? created.htmlLink
    : null;
  return {
    message: `Calendar event created: ${String(args.summary)}.`,
    ...(link ? { link } : {}),
  };
}

export function hashGoogleOAuthState(state: string) {
  return createHash("sha256").update(state).digest("hex");
}

export function createGoogleOAuthState() {
  return randomBytes(32).toString("base64url");
}
