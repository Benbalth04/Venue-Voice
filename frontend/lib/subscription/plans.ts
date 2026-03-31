export type BillingInterval = "monthly" | "yearly"

export type SubscribePlanId = "starter" | "growth" | "pro"

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
