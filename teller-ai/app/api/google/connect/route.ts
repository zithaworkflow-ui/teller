import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth0-auth";
import { saveGoogleOAuthState } from "@/lib/postgres";
import {
  createGoogleAuthorizationUrl,
  createGoogleOAuthState,
  getGoogleConnectionStatus,
  hashGoogleOAuthState,
  isGoogleOAuthConfigured,
  disconnectGoogleAccount,
} from "@/lib/google-workspace";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    return NextResponse.json(await getGoogleConnectionStatus(userId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Google connection status error:", error);
    return NextResponse.json({ error: "Could not load Google connection status." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!isGoogleOAuthConfigured()) {
    return NextResponse.json(
      { error: "Google OAuth is not configured on the server yet." },
      { status: 503 },
    );
  }

  try {
    const state = createGoogleOAuthState();
    const returnTo = new URL(request.url).searchParams.get("returnTo") === "settings"
      ? "/settings"
      : "/chat";
    await saveGoogleOAuthState(hashGoogleOAuthState(state), userId, returnTo);
    return NextResponse.json({ authorizationUrl: createGoogleAuthorizationUrl(state) });
  } catch (error) {
    console.error("Google connect setup error:", error);
    return NextResponse.json({ error: "Could not start Google account connection." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    await disconnectGoogleAccount(userId);
    return NextResponse.json({ connected: false });
  } catch (error) {
    console.error("Google disconnect error:", error);
    return NextResponse.json({ error: "Could not disconnect the Google account." }, { status: 500 });
  }
}
