import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth0-auth";
import { consumeGooglePendingAction } from "@/lib/postgres";
import { executePendingGoogleAction, getGoogleAccessToken } from "@/lib/google-workspace";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const body: unknown = await request.json();
    const actionId = body && typeof body === "object" && "actionId" in body ? body.actionId : null;
    if (typeof actionId !== "string" || !/^[0-9a-f-]{36}$/i.test(actionId)) {
      return NextResponse.json({ error: "A valid confirmation is required." }, { status: 400 });
    }
    const action = await consumeGooglePendingAction(userId, actionId);
    if (!action) {
      return NextResponse.json({ error: "This confirmation expired or has already been used. Please ask CyberMail again." }, { status: 410 });
    }
    const accessToken = await getGoogleAccessToken(userId);
    return NextResponse.json(await executePendingGoogleAction(accessToken, action));
  } catch (error) {
    console.error("CyberMail action confirmation error:", error);
    const message = error instanceof Error ? error.message : "Could not complete the confirmed Google action.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
