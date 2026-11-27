import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth0-auth";
import { ComposioError, createComposioConnectLink } from "@/lib/composio";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (
    typeof body !== "object" ||
    body === null ||
    !("toolkit" in body) ||
    typeof body.toolkit !== "string" ||
    !/^[a-z0-9][a-z0-9_-]{0,80}$/i.test(body.toolkit)
  ) {
    return NextResponse.json({ error: "Choose a valid app connector." }, { status: 400 });
  }

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const callbackUrl = new URL("/chat", appUrl);
    const redirectUrl = await createComposioConnectLink(userId, body.toolkit, callbackUrl.toString());
    return NextResponse.json(
      { redirectUrl },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Composio connection setup error:", error);
    return NextResponse.json(
      {
        error: error instanceof ComposioError
          ? error.message
          : "Could not start the app connection.",
      },
      { status: error instanceof ComposioError ? error.status : 502 },
    );
  }
}
