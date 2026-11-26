export class Auth0ManagementError extends Error {
  constructor(message: string, readonly status: 502 | 503) {
    super(message);
    this.name = "Auth0ManagementError";
  }
}

export function getAuth0ManagementBaseUrl() {
  const domain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN?.trim();
  if (!domain) {
    throw new Auth0ManagementError("Auth0 Management API is not configured.", 503);
  }
  const issuer = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `https://${issuer}`;
}

export async function getAuth0ManagementAccessToken(scope: "read:users" | "delete:users") {
  const baseUrl = getAuth0ManagementBaseUrl();
  const clientId =
    process.env.AUTH0_CLIENT_ID?.trim() ||
    process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID?.trim();
  const clientSecret = process.env.AUTH0_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Auth0ManagementError("Auth0 Management API credentials are not configured.", 503);
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        audience: `${baseUrl}/api/v2/`,
        scope,
      }),
      cache: "no-store",
    });
  } catch {
    throw new Auth0ManagementError("Could not connect to Auth0 Management API.", 502);
  }
  if (!response.ok) {
    throw new Auth0ManagementError("Auth0 rejected the Management API credentials.", 502);
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Auth0ManagementError("Auth0 returned an invalid Management API token.", 502);
  }
  if (
    typeof result !== "object" ||
    result === null ||
    typeof (result as Record<string, unknown>).access_token !== "string"
  ) {
    throw new Auth0ManagementError("Auth0 returned an invalid Management API token.", 502);
  }
  return (result as { access_token: string }).access_token;
}

export async function deleteAuth0User(userId: string, accessToken: string) {
  let response: Response;
  try {
    response = await fetch(
      `${getAuth0ManagementBaseUrl()}/api/v2/users/${encodeURIComponent(userId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      },
    );
  } catch {
    throw new Auth0ManagementError("Could not connect to Auth0 to delete the login.", 502);
  }
  if (!response.ok) {
    throw new Auth0ManagementError("Auth0 could not delete the login. Verify the Management API delete:users scope.", 502);
  }
}
