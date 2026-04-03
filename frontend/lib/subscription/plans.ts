export type { PlanLimits } from "@/lib/api/client"

export type BillingInterval = "monthly" | "yearly"

/**
 * Returns true if the current count is at or above the limit.
 * Handles -1 (unlimited) correctly — always returns false when limit is -1.
 */
export function isAtLimit(current: number, limit: number): boolean {
  return limit !== -1 && current >= limit
}

/**
 * Formats a limit value for display.
 * -1 is displayed as "Unlimited".
 */
export function formatLimit(limit: number): string {
  return limit === -1 ? "Unlimited" : String(limit)
}

export type SubscribePlanId = "starter" | "growth" | "pro"

/** Tier order for upgrade / checkout UI (low → high). */
const PLAN_DISPLAY_TO_TIER: Record<string, number> = {
  starter: 0,
  growth: 1,
  pro: 2,
}

const PLAN_ID_TO_TIER: Record<SubscribePlanId, number> = {
  starter: 0,
  growth: 1,
  pro: 2,
}

/**
 * Maps API `plan_display_name` (e.g. "Growth") to tier index 0..2, or -1 if unknown / none.
 */
export function tierIndexFromPlanDisplayName(planDisplayName: string | null | undefined): number {
  if (!planDisplayName) return -1
  return PLAN_DISPLAY_TO_TIER[planDisplayName.toLowerCase()] ?? -1
}

/** Tier index of a catalog plan (same order as SUBSCRIBE_PLANS). */
export function subscribePlanTierIndex(planId: SubscribePlanId): number {
  return PLAN_ID_TO_TIER[planId]
}

/**
 * Whether this catalog tier should offer primary actions (checkout / upgrade).
 * When the user's current tier is unknown (-1), all tiers are actionable.
 */
export function tierAllowsPrimaryAction(
  userTierIndex: number,
  catalogPlanId: SubscribePlanId,
): boolean {
  if (userTierIndex < 0) return true
  return subscribePlanTierIndex(catalogPlanId) >= userTierIndex
}

export const SUBSCRIBE_PLANS: {
  id: SubscribePlanId
  name: string
  bestFor: string
  monthlyPrice: number
  yearlyPrice: number
  yearlyMonthlyEquiv: number
  popular: boolean
  features: string[]
}[] = [
  {
    id: "starter",
    name: "Starter",
    bestFor: "Best for: Single-location venues",
    monthlyPrice: 10,
    yearlyPrice: 96,
    yearlyMonthlyEquiv: 8,
    popular: false,
    features: [
      "1 Location",
      "QR Code Feedback Collection",
      "1 Active Automation Flow",
      "Basic Feedback Routing (max 2 branches in each flow)",
      "Redirect happy customers to Google Reviews",
      "Real-time Email Alerts",
      "Basic Feedback Dashboard",
      "Unlimited Responses",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    bestFor: "Best for: Growing multi-location businesses",
    monthlyPrice: 30,
    yearlyPrice: 288,
    yearlyMonthlyEquiv: 24,
    popular: true,
    features: [
      "Up to 5 Locations",
      "Smart Feedback Routing & Review Control",
      "Instant alerts for negative feedback",
      "5 Active Automation Flows",
      "Full Analytics Dashboard",
      "Up to 5 Team Members",
      "Photo Feedback Collection",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    bestFor: "Best for: Operators managing multiple venues",
    monthlyPrice: 50,
    yearlyPrice: 480,
    yearlyMonthlyEquiv: 40,
    popular: false,
    features: [
      "Up to 20 Locations",
      "Identify underperforming locations instantly",
      "Compare performance across locations",
      "Priority Alerts & Notifications",
      "10 Active Automation Flows",
      "Up to 20 Team Members",
    ],
  },
]
