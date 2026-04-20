"use client"

import { Fragment, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { AuthGuard } from "@/components/auth/AuthGuard"
import { EmailVerifiedGuard } from "@/components/auth/EmailVerifiedGuard"
import { OnboardingGuard } from "@/components/auth/OnboardingGuard"
import { BillingToggle } from "@/components/subscription/BillingToggle"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { AuthShell } from "@/components/auth/AuthShell"
import { Check } from "lucide-react"
import {
  createCheckoutSession,
  createPortalSession,
  fetchSubscription,
  extractErrorMessage,
  type SubscriptionResponse,
} from "@/lib/api/client"
import {
  LOCATION_COUNT_MAX,
  LOCATION_COUNT_MIN,
  LOCATION_FEATURES,
  LOCATION_PRICE_MONTHLY,
  LOCATION_PRICE_YEARLY_MONTHLY_EQUIV,
  LOCATION_PRICE_YEARLY_TOTAL,
  calcLocationTotal,
  type BillingInterval,
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

interface LocationStepperProps {
  value: number
  onChange: (v: number) => void
}

function LocationStepper({ value, onChange }: LocationStepperProps) {
  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const parsed = parseInt(e.target.value, 10)
    if (Number.isNaN(parsed)) return
    onChange(Math.min(LOCATION_COUNT_MAX, Math.max(LOCATION_COUNT_MIN, parsed)))
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(LOCATION_COUNT_MIN, value - 1))}
        disabled={value <= LOCATION_COUNT_MIN}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 text-lg font-semibold transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Decrease location count"
      >
        −
      </button>
      <input
        type="number"
        value={value}
        onChange={handleInput}
        min={LOCATION_COUNT_MIN}
        max={LOCATION_COUNT_MAX}
        className="h-9 w-16 rounded-lg border border-zinc-200 bg-white text-center text-sm font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-violet-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        aria-label="Number of locations"
      />
      <button
        type="button"
        onClick={() => onChange(Math.min(LOCATION_COUNT_MAX, value + 1))}
        disabled={value >= LOCATION_COUNT_MAX}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 text-lg font-semibold transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Increase location count"
      >
        +
      </button>
    </div>
  )
}

function LocationPricingCard({
  billing,
  onBillingChange,
  locationCount,
  onLocationCountChange,
  onSubscribe,
  loading,
  error,
  trialNote,
}: {
  billing: BillingInterval
  onBillingChange: (b: BillingInterval) => void
  locationCount: number
  onLocationCountChange: (n: number) => void
  onSubscribe: () => void
  loading: boolean
  error: string | null
  trialNote?: string
}) {
  const isYearly = billing === "yearly"
  const { total, annualNote } = calcLocationTotal(locationCount, billing)
  const displayPerLocation = isYearly ? LOCATION_PRICE_YEARLY_MONTHLY_EQUIV : LOCATION_PRICE_MONTHLY
  const monthlyTotal = locationCount * LOCATION_PRICE_MONTHLY

  return (
    <div className="relative bg-white rounded-2xl border border-zinc-200 shadow-xl overflow-hidden">
      <div className="h-1 w-full bg-gradient-to-r from-violet-500 to-violet-400" />
      <div className="p-8 flex flex-col items-center text-center">

        <div className="text-xl font-extrabold text-zinc-900 mb-1">Simple Per-location Pricing</div>
        <p className="text-sm text-zinc-500 mb-6">Scale up or down as your business grows</p>

        <BillingToggle value={billing} onChange={onBillingChange} />

        <div className="mb-2 mt-2">
          <div className="flex items-end justify-center gap-1.5">
            <span className="text-7xl font-extrabold leading-none text-zinc-900">${displayPerLocation}</span>
            <div className="mb-2 text-zinc-400 text-sm leading-snug text-left">
              <div>per location</div>
              <div>/ month</div>
            </div>
          </div>
          {isYearly ? (
            <p className="text-sm text-zinc-500 mt-2">
              Billed annually (${LOCATION_PRICE_YEARLY_TOTAL} per location / year)
            </p>
          ) : (
            <p className="text-sm text-zinc-500 mt-2">Billed monthly — switch to yearly to save 20%</p>
          )}
        </div>

        <div className="mt-6 w-full">
          <p className="text-sm font-medium text-zinc-700 mb-3">How many locations?</p>
          <div className="flex flex-col items-center gap-3">
            <LocationStepper value={locationCount} onChange={onLocationCountChange} />
            <div className="inline-flex items-center gap-2 bg-violet-50 text-violet-700 text-sm font-medium px-4 py-2.5 rounded-xl">
              <span className="opacity-60 text-xs">Total:</span>
              {locationCount} {locationCount === 1 ? "location" : "locations"} ={" "}
              {isYearly
                ? `$${total}/year`
                : `$${monthlyTotal}/month`}
            </div>
            {isYearly && annualNote && (
              <p className="text-xs text-zinc-400">{annualNote}</p>
            )}
          </div>
        </div>

        <div className="my-8 h-px bg-zinc-100 w-full" />

        <p className="text-xs font-bold tracking-widest uppercase text-zinc-400 mb-5">Everything included</p>
        <ul className="grid sm:grid-cols-2 gap-x-10 gap-y-3.5 text-left w-full mb-8">
          {LOCATION_FEATURES.map((feature) => (
            <li key={feature} className="flex items-start gap-3 text-sm text-zinc-700">
              <span className="mt-0.5 shrink-0 flex items-center justify-center w-4 h-4 rounded-full bg-violet-100">
                <Check className="w-2.5 h-2.5 text-violet-600 stroke-[3]" />
              </span>
              {feature}
            </li>
          ))}
        </ul>

        <div className="mb-8 h-px bg-zinc-100 w-full" />

        <button
          onClick={onSubscribe}
          disabled={loading}
          className="flex items-center justify-center h-12 w-full max-w-sm rounded-xl text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? "Redirecting…" : "Start capturing feedback"}
        </button>

        {trialNote && (
          <p className="text-xs text-zinc-400 mt-3">{trialNote}</p>
        )}

        {error && (
          <div className="mt-4 w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 text-left">
            {error}
          </div>
        )}
      </div>
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
  const [error, setError] = useState<string | null>(null)
  const [billing, setBilling] = useState<BillingInterval>("monthly")
  const [locationCount, setLocationCount] = useState(1)

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

  async function handleSubscribe() {
    if (!session?.access_token) return
    setLoading(true)
    setError(null)
    try {
      const { checkout_url } = await createCheckoutSession(session.access_token, {
        locationCount,
        billingInterval: billing,
      })
      // eslint-disable-next-line react-hooks/immutability -- leave React tree for Stripe checkout
      window.location.href = checkout_url
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to start checkout. Please try again."))
      setLoading(false)
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

  return (
    <AuthShell>
      <div className="w-full max-w-2xl">
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

              <LocationPricingCard
                billing={billing}
                onBillingChange={setBilling}
                locationCount={locationCount}
                onLocationCountChange={setLocationCount}
                onSubscribe={handleSubscribe}
                loading={loading}
                error={error}
              />

              <div className="mt-4">
                <Button variant="outline" className="w-full" onClick={handleManageBilling} disabled={loading}>
                  Manage billing instead
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-6 text-center">
                <h2 className="text-xl font-semibold text-zinc-900">Choose your plan</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Every plan includes a 7-day free trial. No charge until the trial ends.
                </p>
              </div>

              <LocationPricingCard
                billing={billing}
                onBillingChange={setBilling}
                locationCount={locationCount}
                onLocationCountChange={setLocationCount}
                onSubscribe={handleSubscribe}
                loading={loading}
                error={error}
                trialNote="Set up in minutes. 7-day free trial. No contracts."
              />
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
