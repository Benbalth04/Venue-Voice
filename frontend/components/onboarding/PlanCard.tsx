"use client"

import { Button } from "@/components/ui/button"

export interface PlanCardProps {
  name: string
  price: string
  billingCycle?: string
  trialLabel?: string
  /** When false, card uses a neutral border (tier grid). Omit or true for highlighted / legacy single-card layout. */
  popular?: boolean
  bestFor?: string
  priceNote?: string
  /** When set, replaces the default price row (for yearly: strikethrough list monthly, effective monthly, annual total line). */
  yearlyPriceDetails?: {
    regularMonthly: string
    effectiveMonthly: string
    annualTotalNote: string
  }
  features: string[]
  onSelect: () => void
  loading?: boolean
}

export function PlanCard({
  name,
  price,
  billingCycle = "per month",
  trialLabel,
  popular,
  bestFor,
  priceNote,
  yearlyPriceDetails,
  features,
  onSelect,
  loading,
}: PlanCardProps) {
  const isSubdued = popular === false
  const showPopularBadge = popular === true

  const shellClass = isSubdued
    ? "border-2 border-zinc-200 bg-white shadow-sm"
    : showPopularBadge
      ? "border-2 border-violet-600 bg-white shadow-md ring-4 ring-violet-100"
      : "border-2 border-violet-600 bg-white shadow-sm"

  return (
    <div className={`relative flex h-full flex-col rounded-2xl p-6 ${shellClass}`}>
      {showPopularBadge && (
        <span className="absolute -top-3.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-violet-600 px-4 py-1 text-xs font-semibold text-white">
          Most popular
        </span>
      )}
      {trialLabel && (
        <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-violet-600 px-4 py-1 text-xs font-semibold text-white">
          {trialLabel}
        </span>
      )}

      <h3 className="text-lg font-semibold text-zinc-900">{name}</h3>
      {bestFor && <p className="mt-1.5 text-sm leading-snug text-zinc-500">{bestFor}</p>}

      {yearlyPriceDetails ? (
        <>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-lg font-medium text-red-500 line-through decoration-red-500">
              {yearlyPriceDetails.regularMonthly}
            </span>
            <span className="text-4xl font-bold text-zinc-900">{yearlyPriceDetails.effectiveMonthly}</span>
            <span className="text-sm font-medium text-zinc-500">/mo</span>
          </div>
          <p className="mt-2 text-sm text-zinc-500">{yearlyPriceDetails.annualTotalNote}</p>
        </>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-end gap-x-1 gap-y-1">
            <span className="text-4xl font-bold text-zinc-900">{price}</span>
            <span className="mb-1 text-sm text-zinc-500">{billingCycle}</span>
          </div>
          {priceNote && <p className="mt-2 text-sm text-zinc-500">{priceNote}</p>}
        </>
      )}

      <ul className="mt-5 flex-1 space-y-2.5">
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
