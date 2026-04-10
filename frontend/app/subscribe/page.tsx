"use client"

import { Fragment, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { AuthGuard } from "@/components/auth/AuthGuard"
import { EmailVerifiedGuard } from "@/components/auth/EmailVerifiedGuard"
import { OnboardingGuard } from "@/components/auth/OnboardingGuard"
import { PlanCard } from "@/components/onboarding/PlanCard"
import { BillingToggle } from "@/components/subscription/BillingToggle"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { AuthShell } from "@/components/auth/AuthShell"
import {
  createCheckoutSession,
  createPortalSession,
  fetchSubscription,
  extractErrorMessage,
  type SubscriptionResponse,
} from "@/lib/api/client"
import {
  SUBSCRIBE_PLANS,
  tierAllowsPrimaryAction,
  tierIndexFromPlanDisplayName,
  type BillingInterval,
  type SubscribePlanId,
} from "@/lib/subscription/plans"

const STEP_LABELS = ["Your Business", "About You", "Choose Plan"]

function StepIndicator({ current, labels }: { current: number; labels: string[] }) {
  return (
    <div className="mb-8 flex items-center justify-center">
      {labels.map((label, i) => (
        <Fragment key={i}>
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all duration-200 ${
                i < current
                  ? "bg-violet-600 text-white"
                  : i === current
                    ? "bg-violet-600 text-white ring-4 ring-violet-100"
                    : "bg-zinc-100 text-zinc-400"
              }`}
            >
              {i < current ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span className={`text-xs font-medium ${i <= current ? "text-violet-700" : "text-zinc-400"}`}>
              {label}
            </span>
          </div>
          {i < labels.length - 1 && (
            <div
              className={`mb-5 h-px w-10 flex-shrink-0 transition-colors duration-200 ${
                i < current ? "bg-violet-600" : "bg-zinc-200"
              }`}
            />
          )}
        </Fragment>
      ))}
    </div>
  )
}

function SubscribePageContent() {
  const router = useRouter()
  const { session, activeMembership } = useAuth()
  const isOwner = activeMembership?.role === "company_owner"
  const [status, setStatus] = useState<string | null>(null)
  const [subscription, setSubscription] = useState<SubscriptionResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingPlanId, setLoadingPlanId] = useState<SubscribePlanId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [billing, setBilling] = useState<BillingInterval>("monthly")

  useEffect(() => {
    if (!session?.access_token) return
    fetchSubscription(session.access_token)
      .then((sub) => {
        if (sub.is_active) {
          router.replace("/dashboard")
          return
        }
        setSubscription(sub)
        setStatus(sub.status)
      })
      .catch(() => {
        setStatus(null)
        setSubscription(null)
      })
  }, [session, router])

  async function handleSubscribe(_planId: SubscribePlanId) {
    if (!session?.access_token) return
    setLoading(true)
    setLoadingPlanId(_planId)
    setError(null)
    try {
      const { checkout_url } = await createCheckoutSession(session.access_token, {
        plan: _planId,
        billingInterval: billing,
      })
      // eslint-disable-next-line react-hooks/immutability -- leave React tree for Stripe checkout
      window.location.href = checkout_url
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to start checkout. Please try again."))
      setLoading(false)
      setLoadingPlanId(null)
    }
  }

  async function handleManageBilling() {
    if (!session?.access_token) return
    setLoading(true)
    setError(null)
    try {
      const { portal_url } = await createPortalSession(session.access_token)
      window.location.href = portal_url
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to open billing portal. Please try again."))
      setLoading(false)
    }
  }

  const isLapsed = status === "past_due" || status === "canceled"
  const currentTierIndex = tierIndexFromPlanDisplayName(subscription?.plan_display_name)

  return (
    <AuthShell>
      <div className={`w-full ${isLapsed ? "max-w-lg" : "max-w-6xl"}`}>
        <Card className="p-8">
          <StepIndicator current={2} labels={STEP_LABELS} />

          {!isOwner ? (
            <div className="py-6 text-center">
              <p className="text-sm font-medium text-zinc-700">
                Only the company owner can manage billing.
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                Contact your company owner to restore access.
              </p>
            </div>
          ) : isLapsed ? (
            <div>
              <div className="mb-6 text-center">
                <h2 className="text-xl font-semibold text-zinc-900">Reactivate your subscription</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Your subscription has lapsed. Reactivate to continue using Venue Voice —
                  your data and settings are still intact.
                </p>
              </div>

              {error && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-3">
                <Button className="w-full" onClick={() => handleSubscribe("growth")} disabled={loading}>
                  {loading ? "Redirecting…" : "Resubscribe"}
                </Button>
                <Button variant="outline" className="w-full" onClick={handleManageBilling} disabled={loading}>
                  Manage billing
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-2 text-center">
                <h2 className="text-xl font-semibold text-zinc-900">Choose your plan</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Every plan includes a 7-day free trial. No charge until the trial ends.
                </p>
              </div>

              <BillingToggle value={billing} onChange={setBilling} />

              <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:items-stretch">
                {SUBSCRIBE_PLANS.map((plan) => {
                  const isMonthly = billing === "monthly"
                  const showSelect = tierAllowsPrimaryAction(currentTierIndex, plan.id)
                  const yearlyPriceDetails = !isMonthly
                    ? {
                        regularMonthly: `$${plan.monthlyPrice}/mo`,
                        effectiveMonthly: `$${plan.yearlyMonthlyEquiv}`,
                        annualTotalNote: `$${plan.yearlyPrice}/year billed annually`,
                      }
                    : undefined

                  return (
                    <PlanCard
                      key={plan.id}
                      name={plan.name}
                      price={isMonthly ? `$${plan.monthlyPrice}` : `$${plan.yearlyPrice}`}
                      billingCycle={isMonthly ? "/month" : "/year"}
                      bestFor={plan.bestFor}
                      yearlyPriceDetails={yearlyPriceDetails}
                      popular={plan.popular}
                      features={plan.features}
                      onSelect={() => handleSubscribe(plan.id)}
                      loading={loading && loadingPlanId === plan.id}
                      showSelectButton={showSelect}
                    />
                  )
                })}
              </div>

              {error && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </AuthShell>
  )
}

export default function SubscribePage() {
  return (
    <AuthGuard>
      <EmailVerifiedGuard>
        <OnboardingGuard>
          <SubscribePageContent />
        </OnboardingGuard>
      </EmailVerifiedGuard>
    </AuthGuard>
  )
}
