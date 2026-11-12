import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth0-auth";
import { getSharedFishReferenceId, saveSharedFishReferenceId } from "@/lib/postgres";
import { isVoicePromptManager } from "@/lib/voice-prompt-access";

export const runtime = "nodejs";

const REFERENCE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

async function authorizeManager(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return {
      error: NextResponse.json({ error: "Sign in to manage the Fish Audio voice model." }, { status: 401 }),
    };
  }
  if (!isVoicePromptManager(user.email, user.email_verified)) {
    return {
      error: NextResponse.json({ error: "Only the voice-sample manager can change the Fish Audio model." }, { status: 403 }),
    };
  }
  return { user };
}

export async function GET(request: Request) {
  const authorization = await authorizeManager(request);
  if ("error" in authorization) return authorization.error;

  try {
    return NextResponse.json({ referenceId: await getSharedFishReferenceId() });
  } catch (error) {
    console.error("Could not load Fish Audio voice model:", error);
    return NextResponse.json({ error: "Could not load the Fish Audio model ID." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const authorization = await authorizeManager(request);
  if ("error" in authorization) return authorization.error;

  let body: { referenceId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Provide a Fish Audio model ID." }, { status: 400 });
  }

  if (typeof body.referenceId !== "string" || !REFERENCE_ID_PATTERN.test(body.referenceId.trim())) {
    return NextResponse.json(
      { error: "The Fish Audio model ID must be 1–128 letters, numbers, underscores, or hyphens." },
      { status: 400 },
    );
  }

  try {
    const referenceId = body.referenceId.trim();
    await saveSharedFishReferenceId(referenceId);
    return NextResponse.json({ ok: true, referenceId });
  } catch (error) {
    console.error("Could not save Fish Audio voice model:", error);
    return NextResponse.json({ error: "Could not save the Fish Audio model ID." }, { status: 500 });
  }
}
