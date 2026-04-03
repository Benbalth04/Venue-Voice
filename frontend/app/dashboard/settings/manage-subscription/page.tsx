"use client"

import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { BillingToggle } from "@/components/subscription/BillingToggle"
import { Button } from "@/components/ui/button"
import {
  createPortalSession,
  extractErrorMessage,
  fetchSubscription,
  type SubscriptionResponse,
} from "@/lib/api/client"
import {
  SUBSCRIBE_PLANS,
  tierIndexFromPlanDisplayName,
  tierAllowsPrimaryAction,
  type BillingInterval,
} from "@/lib/subscription/plans"
import { DEFAULT_USER_TIMEZONE } from "@/lib/timezone/australia"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSubscriptionEndDateTime(iso: string | null, timeZone: string): string {
  if (!iso) return "the end of your billing period"
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString(undefined, {
      timeZone,
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    })
  } catch {
    return iso
  }
}

// ---------------------------------------------------------------------------
// Plan card
// ---------------------------------------------------------------------------

interface ManagePlanCardProps {
  name: string
  price: string
  billingCycle: string
  yearlyPriceDetails?: {
    regularMonthly: string
    effectiveMonthly: string
    annualTotalNote: string
  }
  bestFor: string
  popular: boolean
  features: string[]
  isCurrent: boolean
  isBelowCurrentTier: boolean
  /** Primary CTA when not current tier card and not below current tier (upgrade or same-tier billing switch). */
  upgradeOrSwitchLabel: string
  portalLoading: boolean
  onOpenPortal: () => void
}

function ManagePlanCard({
  name,
  price,
  billingCycle,
  yearlyPriceDetails,
  bestFor,
  popular,
  features,
  isCurrent,
  isBelowCurrentTier,
  upgradeOrSwitchLabel,
  portalLoading,
  onOpenPortal,
}: ManagePlanCardProps) {
  const borderClass = popular
    ? "border-2 border-violet-600 shadow-md ring-4 ring-violet-100"
    : "border-2 border-zinc-200 shadow-sm"

  return (
    <div className={`relative flex h-full flex-col rounded-2xl bg-white p-6 ${borderClass}`}>
      {popular && !isCurrent && (
        <span className="absolute -top-3.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-violet-600 px-4 py-1 text-xs font-semibold text-white">
          Most popular
        </span>
      )}
      {isCurrent && (
        <span className="absolute -top-3.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-emerald-500 px-4 py-1 text-xs font-semibold text-white">
          Current plan
        </span>
      )}

      <h3 className="text-lg font-semibold text-zinc-900">{name}</h3>
      <p className="mt-1.5 text-sm leading-snug text-zinc-500">{bestFor}</p>

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
        <div className="mt-3 flex flex-wrap items-end gap-x-1 gap-y-1">
          <span className="text-4xl font-bold text-zinc-900">{price}</span>
          <span className="mb-1 text-sm text-zinc-500">{billingCycle}</span>
        </div>
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

      <div className="mt-6 space-y-2">
        {isBelowCurrentTier ? (
          <>
            <Button variant="outline" className="w-full" onClick={onOpenPortal} disabled={portalLoading}>
              {portalLoading ? "Redirecting…" : "Open portal"}
            </Button>
          </>
        ) : isCurrent ? (
          <Button variant="outline" className="w-full" onClick={onOpenPortal} disabled={portalLoading}>
            {portalLoading ? "Redirecting…" : "Manage subscription"}
          </Button>
        ) : (
          <Button className="w-full" onClick={onOpenPortal} disabled={portalLoading}>
            {portalLoading ? "Redirecting…" : upgradeOrSwitchLabel}
          </Button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ManageSubscriptionPage() {
  const { session, user } = useAuth()
  const userTimeZone = user?.timezone ?? DEFAULT_USER_TIMEZONE
  const [sub, setSub] = useState<SubscriptionResponse | null>(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [billing, setBilling] = useState<BillingInterval>("monthly")
  const [portalLoading, setPortalLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSubscription = useCallback(async () => {
    if (!session?.access_token) return
    try {
      const data = await fetchSubscription(session.access_token)
      setSub(data)
      if (data.billing_interval === "monthly" || data.billing_interval === "yearly") {
        setBilling(data.billing_interval)
      }
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load subscription details."))
    } finally {
      setPageLoading(false)
    }
  }, [session?.access_token])

  useEffect(() => {
    loadSubscription()
  }, [loadSubscription])

  async function handleOpenPortal() {
    if (!session?.access_token) return
    setPortalLoading(true)
    setError(null)
    try {
      const { portal_url } = await createPortalSession(session.access_token)
      window.location.href = portal_url
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to open billing portal. Please try again."))
      setPortalLoading(false)
    }
  }

  const currentTierIndex = tierIndexFromPlanDisplayName(sub?.plan_display_name ?? null)
  const subscribedBilling: BillingInterval =
    sub?.billing_interval === "yearly" ? "yearly" : "monthly"

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Manage Subscription</h1>
          <p className="mt-1 text-sm text-zinc-500">
            View your current plan and make changes via the billing portal.
          </p>
        </div>
        <Button variant="outline" onClick={handleOpenPortal} disabled={portalLoading} className="shrink-0">
          {portalLoading ? "Redirecting…" : "Manage payment methods & invoices"}
        </Button>
      </div>

      {sub?.cancel_at_period_end && (
        <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-800">
            Your subscription is set to cancel on{" "}
            <span className="font-medium">
              {formatSubscriptionEndDateTime(sub.current_period_end ?? null, userTimeZone)}
            </span>
            . Open the portal to reactivate.
          </p>
          <Button
            variant="outline"
            onClick={handleOpenPortal}
            disabled={portalLoading}
            className="shrink-0 px-3 py-1.5 text-xs"
          >
            Open portal
          </Button>
        </div>
      )}

      {error && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {pageLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
        </div>
      ) : (
        <>
          <BillingToggle value={billing} onChange={setBilling} />

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:items-stretch">
            {SUBSCRIBE_PLANS.map((plan) => {
              const planNameMatch =
                plan.name.toLowerCase() === (sub?.plan_display_name ?? "").toLowerCase()
              const isCurrent = planNameMatch && billing === subscribedBilling
              const isBelowCurrentTier = !tierAllowsPrimaryAction(currentTierIndex, plan.id)
              const upgradeOrSwitchLabel =
                planNameMatch && billing !== subscribedBilling
                  ? billing === "yearly"
                    ? "Change to yearly billing"
                    : "Change to monthly billing"
                  : `Upgrade to ${plan.name}`
              const isMonthly = billing === "monthly"
              const yearlyPriceDetails = !isMonthly
                ? {
                    regularMonthly: `$${plan.monthlyPrice}/mo`,
                    effectiveMonthly: `$${plan.yearlyMonthlyEquiv}`,
                    annualTotalNote: `$${plan.yearlyPrice}/year billed annually`,
                  }
                : undefined

              return (
                <ManagePlanCard
                  key={plan.id}
                  name={plan.name}
                  price={isMonthly ? `$${plan.monthlyPrice}` : `$${plan.yearlyPrice}`}
                  billingCycle={isMonthly ? "/month" : "/year"}
                  yearlyPriceDetails={yearlyPriceDetails}
                  bestFor={plan.bestFor}
                  popular={plan.popular}
                  features={plan.features}
                  isCurrent={isCurrent}
                  isBelowCurrentTier={isBelowCurrentTier}
                  upgradeOrSwitchLabel={upgradeOrSwitchLabel}
                  portalLoading={portalLoading}
                  onOpenPortal={handleOpenPortal}
                />
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
