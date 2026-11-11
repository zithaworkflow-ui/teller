const paypalEnvironment = process.env.PAYPAL_ENVIRONMENT?.trim().toLowerCase();

export const paypalBaseUrl =
  paypalEnvironment === "sandbox"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";
