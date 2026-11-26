import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth0-auth";
import {
  Auth0ManagementError,
  getAuth0ManagementAccessToken,
  getAuth0ManagementBaseUrl,
} from "@/lib/auth0-management";
import { getAllUserAccountData } from "@/lib/postgres";
import { getPlanKey, plans } from "@/lib/plans";
import { isVoicePromptManager } from "@/lib/voice-prompt-access";

type Auth0DirectoryUser = {
  user_id: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
};

function isAuth0DirectoryUser(value: unknown): value is Auth0DirectoryUser {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).user_id === "string"
  );
}

export async function GET(request: Request) {
  const identity = await getAuthenticatedUser(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!isVoicePromptManager(identity.email, identity.email_verified)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let baseUrl: string;
  let accessToken: string;
  try {
    baseUrl = getAuth0ManagementBaseUrl();
    accessToken = await getAuth0ManagementAccessToken("read:users");
  } catch (error) {
    console.error("Could not authorize the Auth0 account export:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not authorize the account export." },
      { status: error instanceof Auth0ManagementError ? error.status : 502 },
    );
  }

  const users: Auth0DirectoryUser[] = [];
  for (let page = 0; ; page += 1) {
    let response: Response;
    try {
      const url = new URL(`${baseUrl}/api/v2/users`);
      url.searchParams.set("per_page", "100");
      url.searchParams.set("page", String(page));
      url.searchParams.set("include_totals", "false");
      url.searchParams.set("fields", "user_id,email,name,given_name,family_name");
      url.searchParams.set("include_fields", "true");
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
    } catch (error) {
      console.error("Could not fetch Auth0 users for account export:", error);
      return NextResponse.json({ error: "Could not fetch the registered account list." }, { status: 502 });
    }

    if (!response.ok) {
      console.error("Auth0 user list request failed:", response.status);
      return NextResponse.json({ error: "Auth0 could not provide the registered account list." }, { status: 502 });
    }
    let pageResult: unknown;
    try {
      pageResult = await response.json();
    } catch (error) {
      console.error("Could not parse Auth0 users response for account export:", error);
      return NextResponse.json({ error: "Auth0 returned an invalid registered account list." }, { status: 502 });
    }
    if (!Array.isArray(pageResult) || !pageResult.every(isAuth0DirectoryUser)) {
      console.error("Auth0 returned an invalid user list response.");
      return NextResponse.json({ error: "Auth0 returned an invalid registered account list." }, { status: 502 });
    }
    users.push(...pageResult);
    if (pageResult.length < 100) break;
  }

  try {
    const accountRows = await getAllUserAccountData();
    const accountsByUserId = new Map(accountRows.map((account) => [account.userId, account]));
    const accounts = users.map((user) => {
      const account = accountsByUserId.get(user.user_id);
      const planKey = getPlanKey(account?.planKey) || "free";
      const name =
        [account?.firstName, account?.surname].filter(Boolean).join(" ") ||
        user.name ||
        [user.given_name, user.family_name].filter(Boolean).join(" ");

      return {
        email: user.email || "",
        name,
        plan: plans[planKey].name,
        country: account?.country || "",
        phone: account?.phoneNumber || "",
        accountUpdatedAt: account?.updatedAt.toISOString() || null,
      };
    });

    return NextResponse.json(
      { exportedAt: new Date().toISOString(), accountCount: accounts.length, accounts },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Could not load account data for export:", error);
    return NextResponse.json({ error: "Could not load account details for export." }, { status: 500 });
  }
}
