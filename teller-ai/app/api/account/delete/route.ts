import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth0-auth";
import { Auth0ManagementError, deleteAuth0User, getAuth0ManagementAccessToken } from "@/lib/auth0-management";
import { LOCAL_TEST_USER_ID } from "@/lib/local-test-auth";
import { deleteUserAccountData, getUserAccountData } from "@/lib/postgres";

export async function POST(request: Request) {
  const identity = await getAuthenticatedUser(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (identity.sub === LOCAL_TEST_USER_ID) {
    return NextResponse.json({ error: "Account deletion is unavailable for local test accounts." }, { status: 403 });
  }
  const auth0AccountName =
    [identity.given_name, identity.family_name].filter(Boolean).join(" ") ||
    identity.name ||
    "Teller User";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Confirm the account name to continue." }, { status: 400 });
  }
  const confirmationName =
    typeof body === "object" && body !== null && "confirmationName" in body &&
    typeof body.confirmationName === "string"
      ? body.confirmationName.trim()
      : "";

  try {
    const account = await getUserAccountData(identity.sub);
    const accountName =
      [account.firstName, account.surname].filter(Boolean).join(" ") ||
      auth0AccountName;
    if (!confirmationName || ![accountName, auth0AccountName].includes(confirmationName)) {
      return NextResponse.json({ error: "The confirmation name does not match your account name." }, { status: 400 });
    }

    const managementToken = await getAuth0ManagementAccessToken("delete:users");
    await deleteUserAccountData(identity.sub);

    try {
      await deleteAuth0User(identity.sub, managementToken);
    } catch (error) {
      console.error("Teller data was removed, but Auth0 account deletion failed:", error);
      return NextResponse.json(
        {
          error: "Your Teller data was removed, but Auth0 could not delete the login. Verify the Management API delete:users permission, then retry.",
          dataDeleted: true,
          retryConfirmationName: auth0AccountName,
        },
        { status: error instanceof Auth0ManagementError ? error.status : 502 },
      );
    }

    return NextResponse.json(
      { deleted: true, message: "Your Teller account data and Auth0 login have been deleted." },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Account deletion failed:", error);
    return NextResponse.json(
      {
        error: error instanceof Auth0ManagementError
          ? error.message
          : "Could not delete the account. Your login has not been deleted; please try again.",
        retryConfirmationName: auth0AccountName,
      },
      { status: error instanceof Auth0ManagementError ? error.status : 500 },
    );
  }
}
