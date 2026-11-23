import { NextResponse } from "next/server";
import { completeGoogleAuthorization, hashGoogleOAuthState } from "@/lib/google-workspace";
import { consumeGoogleOAuthState } from "@/lib/postgres";

export const runtime = "nodejs";

export async function GET(request: Request) {
  let callbackUrl = new URL("/chat?agent=cyber", request.url);
  const params = new URL(request.url).searchParams;
  const state = params.get("state");
  const code = params.get("code");
  if (!state) {
    callbackUrl.searchParams.set("google", "error");
    callbackUrl.searchParams.set("reason", "invalid-state");
    return NextResponse.redirect(callbackUrl);
  }

  try {
    const oauthState = await consumeGoogleOAuthState(hashGoogleOAuthState(state));
    if (oauthState) callbackUrl = new URL(oauthState.returnTo, request.url);
    if (!oauthState || !code || params.has("error")) {
      callbackUrl.searchParams.set("google", "error");
      callbackUrl.searchParams.set("reason", params.has("error") ? "consent-denied" : "expired-state");
      return NextResponse.redirect(callbackUrl);
    }
    await completeGoogleAuthorization(code, oauthState.userId);
    callbackUrl.searchParams.set("google", "connected");
    return NextResponse.redirect(callbackUrl);
  } catch (error) {
    console.error("Google OAuth callback error:", error);
    callbackUrl.searchParams.set("google", "error");
    callbackUrl.searchParams.set("reason", "connection-failed");
    return NextResponse.redirect(callbackUrl);
  }
}
