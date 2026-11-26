"use client";

import { useAppAuth } from "@/components/Auth0Provider";
import { useRouter } from "next/navigation";
import PayPalUpgradeButton from "@/components/PayPalUpgradeButton";

export default function PricingPage() {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAppAuth();
  const router = useRouter();

  async function startFreePlan() {
    if (isAuthenticated) {
      router.push("/chat");
      return;
    }

    await loginWithRedirect({ appState: { returnTo: "/chat" } });
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-20 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold md:text-5xl">Pricing</h1>
          <p className="mt-4 text-neutral-300">
            Choose the Teller plan that works for you.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <PricingCard
            name="Free"
            price="R0"
            features={["100 messages per month", "Basic AI chat", "Chat history"]}
            button="Start Free"
            onClick={startFreePlan}
            disabled={isLoading}
          />

          <PricingCard
            name="Pro"
            price="R90/mo"
            paypalPlan="pro-monthly"
            features={[
              "1,000 messages per month",
              "Faster responses",
              "Longer answers",
              "Priority access",
            ]}
            button="Upgrade to Pro"
            highlighted
            canUpgrade={isAuthenticated && !isLoading}
          />

          <PricingCard
            name="Business"
            price="R260/mo"
            paypalPlan="business-monthly"
            features={[
              "5,000 messages per month",
              "Team access",
              "Priority support",
              "Advanced tools",
            ]}
            button="Upgrade to Business"
            canUpgrade={isAuthenticated && !isLoading}
          />

          <PricingCard
            name="Pro (Yearly)"
            price="R600/yr"
            paypalPlan="pro-yearly"
            features={[
              "1,000 messages per month",
              "Faster responses",
              "Longer answers",
              "Priority access",
            ]}
            button="Upgrade to Pro"
            canUpgrade={isAuthenticated && !isLoading}
          />

          <PricingCard
            name="Business (Yearly)"
            price="R2900/yr"
            paypalPlan="business-yearly"
            features={[
              "5,000 messages per month",
              "Team access",
              "Priority support",
              "Advanced tools",
            ]}
            button="Upgrade to Business"
            canUpgrade={isAuthenticated && !isLoading}
          />
        </div>
      </div>
    </main>
  );
}

function PricingCard({
  name,
  price,
  paypalPlan,
  features,
  button,
  highlighted,
  canUpgrade = false,
  onClick,
  disabled = false,
}: {
  name: string;
  price: string;
  paypalPlan?: string;
  features: string[];
  button: string;
  highlighted?: boolean;
  canUpgrade?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-6 ${
        highlighted
          ? "border-white bg-white text-black"
          : "border-neutral-800 bg-neutral-900"
      }`}
    >
      <h2 className="text-2xl font-bold">{name}</h2>
      <p className="mt-4 text-4xl font-bold">{price}</p>

      <ul className="mt-6 space-y-3">
        {features.map((feature) => (
          <li key={feature}>✓ {feature}</li>
        ))}
      </ul>

      {paypalPlan && canUpgrade ? (
        <PayPalUpgradeButton
          plan={paypalPlan}
          className={`mt-8 w-full rounded-lg px-4 py-3 font-semibold ${
            highlighted ? "bg-black text-white" : "bg-white text-black"
          }`}
        >
          {button}
        </PayPalUpgradeButton>
      ) : !paypalPlan ? (
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className={`mt-8 w-full rounded-lg px-4 py-3 font-semibold ${
            highlighted ? "bg-black text-white" : "bg-white text-black"
          } disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {button}
        </button>
      ) : null}
    </div>
  );
}
