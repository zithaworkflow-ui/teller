import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth0-auth";
import { executeComposioChatTool } from "@/lib/composio";
import { consumeComposioPendingAction } from "@/lib/postgres";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Sign in to confirm connected-app actions." }, { status: 401 });
    }

    const body = await req.json();
    if (typeof body.actionId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.actionId)) {
      return NextResponse.json({ error: "A valid action ID is required." }, { status: 400 });
    }

    const pendingAction = await consumeComposioPendingAction(userId, body.actionId);
    if (!pendingAction) {
      return NextResponse.json(
        { error: "This action has expired or has already been handled. Ask again to create a new confirmation." },
        { status: 404 },
      );
    }
    if (
      pendingAction.toolSlug !== "COMPOSIO_MULTI_EXECUTE_TOOL" ||
      typeof pendingAction.sessionId !== "string" ||
      !pendingAction.arguments ||
      !Array.isArray(pendingAction.actions) ||
      pendingAction.actions.length === 0 ||
      pendingAction.actions.length > 10
    ) {
      return NextResponse.json({ error: "The pending action is invalid." }, { status: 400 });
    }

    const result = await executeComposioChatTool(
      pendingAction.sessionId,
      pendingAction.toolSlug,
      pendingAction.arguments,
    );
    const serializedResult = JSON.stringify(result);
    const resultText = serializedResult.length > 16_000
      ? `${serializedResult.slice(0, 16_000)}\n[Result truncated]`
      : serializedResult;
    const partialFailure = result.successful === false ||
      (typeof result.error_count === "number" && result.error_count > 0);

    return NextResponse.json({
      message: partialFailure
        ? "The connected-app batch finished with one or more errors."
        : "The connected-app actions were executed.",
      result: resultText,
    });
  } catch (error) {
    console.error("Composio confirmation error:", error);
    return NextResponse.json(
      { error: "The connected-app action could not be completed. Ask again to create a new confirmation." },
      { status: 502 },
    );
  }
}
