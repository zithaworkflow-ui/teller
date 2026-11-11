import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth0-auth";
import { getPlanKey, plans } from "@/lib/plans";
import { LOCAL_TEST_USER_ID } from "@/lib/local-test-auth";
import { paypalBaseUrl } from "@/lib/paypal";

const planAmounts: Record<string, string> = {
  "pro-monthly": "90.00",
  "business-monthly": "260.00",
  "pro-yearly": "600.00",
  "business-yearly": "2900.00",
};

const zarToUsdRate = Number(process.env.PAYPAL_ZAR_TO_USD_RATE || "0.0549");

function convertZarToUsd(amount: string) {
  return (Number(amount) * zarToUsdRate).toFixed(2);
}

async function getPayPalAccessToken() {
  const credentials = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString("base64");

  const response = await fetch(`${paypalBaseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`PayPal authentication failed (${response.status}): ${details}`);
  }

  const result = await response.json();
  return result.access_token as string;
}

export async function POST(request: Request) {
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "PayPal is not configured." },
      { status: 500 }
    );
  }

  try {
    const { plan: requestedPlan, userId } = await request.json();
    const authenticatedUserId = await getAuthenticatedUserId(request);
    const plan = getPlanKey(requestedPlan);
    const zarAmount = plan ? planAmounts[plan] : undefined;

    if (authenticatedUserId === LOCAL_TEST_USER_ID) {
      return NextResponse.json({ error: "Payments are disabled for the local test account." }, { status: 403 });
    }

    if (authenticatedUserId !== userId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    if (!plan || !userId || !zarAmount || !plans[plan] || !Number.isFinite(zarToUsdRate) || zarToUsdRate <= 0) {
      return NextResponse.json({ error: "Invalid payment amount." }, { status: 400 });
    }

    const usdAmount = convertZarToUsd(zarAmount);

    const accessToken = await getPayPalAccessToken();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_APP_URL is not configured." },
        { status: 500 }
      );
    }
    const response = await fetch(`${paypalBaseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          custom_id: JSON.stringify({ plan, userId }),
          amount: { currency_code: "USD", value: usdAmount },
        }],
        application_context: {
          user_action: "PAY_NOW",
          return_url: `${appUrl}/api/paypal/capture-order`,
          cancel_url: `${appUrl}/pricing?paypal=canceled`,
        },
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`PayPal order creation failed (${response.status}): ${details}`);
    }

    const order = await response.json();
    const approvalUrl = order.links?.find(
      (link: { rel: string; href: string }) => link.rel === "approve"
    )?.href;

    if (!approvalUrl) {
      throw new Error("PayPal approval link was not returned.");
    }

    return NextResponse.json({ approvalUrl });
  } catch (error) {
    console.error("PayPal checkout error:", error);
    return NextResponse.json(
      {
        error: "Could not create PayPal checkout.",
        detail: error instanceof Error ? error.message : "Unknown PayPal error.",
      },
      { status: 500 }
    );
  }
}