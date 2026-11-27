export type PlanKey =
  | "free"
  | "pro-monthly"
  | "business-monthly"
  | "pro-yearly"
  | "business-yearly";

export const THINK_MODE_USAGE_COST = 2;

export const plans: Record<PlanKey, {
  name: string;
  interval: string;
  usageLimit: number;
  imageGenerationLimit: number;
  thinkOutputTokenLimit: number;
}> = {
  free: {
    name: "Free",
    interval: "monthly",
    usageLimit: 100,
    imageGenerationLimit: 5,
    thinkOutputTokenLimit: 2048,
  },
  "pro-monthly": {
    name: "Pro",
    interval: "monthly",
    usageLimit: 1000,
    imageGenerationLimit: 25,
    thinkOutputTokenLimit: 4096,
  },
  "business-monthly": {
    name: "Business",
    interval: "monthly",
    usageLimit: 5000,
    imageGenerationLimit: 30,
    thinkOutputTokenLimit: 8192,
  },
  "pro-yearly": {
    name: "Pro",
    interval: "yearly",
    usageLimit: 1000,
    imageGenerationLimit: 25,
    thinkOutputTokenLimit: 4096,
  },
  "business-yearly": {
    name: "Business",
    interval: "yearly",
    usageLimit: 5000,
    imageGenerationLimit: 30,
    thinkOutputTokenLimit: 8192,
  },
};

export function getPlanKey(value: unknown): PlanKey | null {
  return typeof value === "string" && value in plans ? (value as PlanKey) : null;
}

export function getThinkOutputTokenLimit(value: unknown) {
  const planKey = getPlanKey(value) || "free";
  return plans[planKey].thinkOutputTokenLimit;
}