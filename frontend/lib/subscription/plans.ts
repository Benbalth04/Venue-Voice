export type BillingInterval = "monthly" | "yearly"

export const LOCATION_PRICE_MONTHLY = 10
export const LOCATION_PRICE_YEARLY_MONTHLY_EQUIV = 8
export const LOCATION_PRICE_YEARLY_TOTAL = 96
export const LOCATION_COUNT_MIN = 1
export const LOCATION_COUNT_MAX = 200

export const LOCATION_FEATURES = [
  "Capture real-time feedback from every customer",
  "Quickly identify underperforming locations",
  "Turn happy customers into 5-star Google reviews",
  "Spot recurring issues before they impact revenue",
  "Compare performance across all your venues",
  "Get instant alerts when something goes wrong",
  "Understand customer sentiment automatically with AI",
  "Unlimited users across your company",
]

export function calcLocationTotal(
  count: number,
  billing: BillingInterval,
): { perLocation: number; total: number; annualNote?: string } {
  if (billing === "yearly") {
    return {
      perLocation: LOCATION_PRICE_YEARLY_MONTHLY_EQUIV,
      total: count * LOCATION_PRICE_YEARLY_TOTAL,
      annualNote: `$${count * LOCATION_PRICE_YEARLY_TOTAL} billed annually`,
    }
  }
  return {
    perLocation: LOCATION_PRICE_MONTHLY,
    total: count * LOCATION_PRICE_MONTHLY,
  }
}
