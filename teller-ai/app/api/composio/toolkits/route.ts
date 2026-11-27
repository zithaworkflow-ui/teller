import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth0-auth";
import { ComposioError, listComposioToolkits } from "@/lib/composio";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const toolkits = await listComposioToolkits(userId);
    return NextResponse.json(
      { toolkits },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Composio toolkit list error:", error);
    return NextResponse.json(
      {
        error: error instanceof ComposioError
          ? error.message
          : "Could not load Composio app connectors.",
      },
      { status: error instanceof ComposioError ? error.status : 502 },
    );
  }
}
