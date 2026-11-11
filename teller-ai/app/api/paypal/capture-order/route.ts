import { NextResponse } from "next/server";
import { plans, type PlanKey } from "@/lib/plans";
import { LOCAL_TEST_USER_ID } from "@/lib/local-test-auth";
import { paypalBaseUrl } from "@/lib/paypal";
import { updateUserAccountPlan } from "@/lib/postgres";

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
    throw new Error("PayPal authentication failed.");
  }

  const result = await response.json();
  return result.access_token as string;
}

export async function GET(request: Request) {
  const orderId = new URL(request.url).searchParams.get("token");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!orderId || !appUrl) {
    return NextResponse.redirect(`${appUrl || ""}/pricing?paypal=canceled`);
  }

  try {
    const accessToken = await getPayPalAccessToken();
    const orderResponse = await fetch(
      `${paypalBaseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!orderResponse.ok) throw new Error("PayPal order lookup failed.");
    const order = await orderResponse.json();
    const customId = order.purchase_units?.[0]?.custom_id;
    const payment = customId ? JSON.parse(customId) as { plan: PlanKey; userId: string } : null;
    if (!payment || !(payment.plan in plans) || !payment.userId) {
      throw new Error("PayPal order is missing account details.");
    }
    if (payment.userId === LOCAL_TEST_USER_ID) {
      return NextResponse.redirect(`${appUrl}/pricing?paypal=local-test-disabled`);
    }

    const response = await fetch(
      `${paypalBaseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error("PayPal payment capture failed.");
    }

    await updateUserAccountPlan(payment.userId, payment.plan);

    return NextResponse.redirect(`${appUrl}/chat?paypal=success`);
  } catch (error) {
    console.error("PayPal capture error:", error);
    return NextResponse.redirect(`${appUrl}/pricing?paypal=error`);
  }
}