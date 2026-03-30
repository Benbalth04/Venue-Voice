"use client"

import { Button } from "@/components/ui/button"

export interface PlanCardProps {
  name: string
  price: string
  billingCycle?: string
  trialLabel?: string
  features: string[]
  onSelect: () => void
  loading?: boolean
}

export function PlanCard({
  name,
  price,
  billingCycle = "per month",
  trialLabel,
  features,
  onSelect,
  loading,
}: PlanCardProps) {
  return (
    <div className="relative rounded-2xl border-2 border-violet-600 bg-white p-6 shadow-sm">
      {trialLabel && (
        <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-violet-600 px-4 py-1 text-xs font-semibold text-white">
          {trialLabel}
        </span>
      )}

      <h3 className="text-lg font-semibold text-zinc-900">{name}</h3>

      <div className="mt-3 flex items-end gap-1">
        <span className="text-4xl font-bold text-zinc-900">{price}</span>
        <span className="mb-1 text-sm text-zinc-500">{billingCycle}</span>
      </div>

      <ul className="mt-5 space-y-2.5">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-sm text-zinc-600">
            <svg
              className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            {feature}
          </li>
        ))}
      </ul>

      <Button className="mt-6 w-full py-3 text-base" onClick={onSelect} disabled={loading}>
        {loading ? "Redirecting to checkout…" : "Start Free Trial"}
      </Button>

      {trialLabel && (
        <p className="mt-3 text-center text-xs text-zinc-400">No charge until your trial ends. Cancel anytime.</p>
      )}
    </div>
  )
}
