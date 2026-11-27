import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth0-auth";
import { ComposioError, deleteComposioConnectedAccount } from "@/lib/composio";

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
    !("accountId" in body) ||
    typeof body.accountId !== "string" ||
    !body.accountId.trim()
  ) {
    return NextResponse.json({ error: "Choose an installed app to uninstall." }, { status: 400 });
  }

  try {
    await deleteComposioConnectedAccount(body.accountId.trim());
    return NextResponse.json(
      { installed: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Composio disconnect error:", error);
    return NextResponse.json(
      {
        error: error instanceof ComposioError
          ? error.message
          : "Could not uninstall the app connector.",
      },
      { status: error instanceof ComposioError ? error.status : 502 },
    );
  }
}
