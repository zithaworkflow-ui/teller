import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { LOCAL_TEST_ACCESS_TOKEN, LOCAL_TEST_USER_ID } from "@/lib/local-test-auth";

const auth0Domain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN;
let auth0Jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export type AuthenticatedUser = {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  email_verified?: boolean;
  picture?: string;
};

function toIdentity(value: unknown): AuthenticatedUser | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.sub !== "string") return null;
  return {
    sub: record.sub,
    ...(typeof record.name === "string" ? { name: record.name } : {}),
    ...(typeof record.given_name === "string" ? { given_name: record.given_name } : {}),
    ...(typeof record.family_name === "string" ? { family_name: record.family_name } : {}),
    ...(typeof record.email === "string" ? { email: record.email } : {}),
    ...(typeof record.email_verified === "boolean" ? { email_verified: record.email_verified } : {}),
    ...(typeof record.picture === "string" ? { picture: record.picture } : {}),
  };
}

function payloadToIdentity(payload: JWTPayload) {
  return toIdentity(payload);
}

export async function getAuthenticatedUser(request: Request): Promise<AuthenticatedUser | null> {
  const authorization = request.headers.get("authorization");
  if (
    process.env.NODE_ENV === "development" &&
    authorization === `Bearer ${LOCAL_TEST_ACCESS_TOKEN}`
  ) {
    return {
      sub: LOCAL_TEST_USER_ID,
      name: "Local Test Account",
      given_name: "Local",
      family_name: "Test Account",
      email: "local-test@example.test",
    };
  }

  if (!authorization?.startsWith("Bearer ") || !auth0Domain) return null;

  const userInfoResponse = await fetch(`https://${auth0Domain}/userinfo`, {
    headers: { Authorization: authorization },
    cache: "no-store",
  });
  if (userInfoResponse.ok) {
    const identity = toIdentity(await userInfoResponse.json());
    if (identity) return identity;
  }

  const audience = process.env.NEXT_PUBLIC_AUTH0_AUDIENCE;
  if (!audience) return null;

  try {
    auth0Jwks ??= createRemoteJWKSet(new URL(`https://${auth0Domain}/.well-known/jwks.json`));
    const { payload } = await jwtVerify(authorization.slice("Bearer ".length), auth0Jwks, {
      issuer: `https://${auth0Domain}/`,
      audience,
    });
    return payloadToIdentity(payload);
  } catch {
    return null;
  }
}

export async function getAuthenticatedUserId(request: Request) {
  const identity = await getAuthenticatedUser(request);
  return identity?.sub ?? null;
}
