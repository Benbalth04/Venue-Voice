"use client"

import { Fragment, useEffect, useState } from "react"
import { CrispChat } from "@/components/crisp/CrispChat"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { AuthGuard } from "@/components/auth/AuthGuard"
import { EmailVerifiedGuard } from "@/components/auth/EmailVerifiedGuard"
import { OnboardingGuard } from "@/components/auth/OnboardingGuard"
import { PlanCard } from "@/components/onboarding/PlanCard"
import { Button } from "@/components/ui/button"
import {
  createCheckoutSession,
  createPortalSession,
  fetchSubscription,
  extractErrorMessage,
} from "@/lib/api/client"

const PLAN_FEATURES = [
  "Unlimited survey responses",
  "QR code generation for all locations",
  "Automated email alerts & flows",
  "Real-time analytics dashboard",
  "AI-powered sentiment analysis",
  "Priority support",
]

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
  const { session } = useAuth()
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session?.access_token) return
    fetchSubscription(session.access_token)
      .then((sub) => {
        if (sub.is_active) {
          router.replace("/dashboard")
          return
        }
        setStatus(sub.status)
      })
      .catch(() => setStatus(null))
  }, [session, router])

  async function handleSubscribe() {
    if (!session?.access_token) return
    setLoading(true)
    setError(null)
    try {
      const { checkout_url } = await createCheckoutSession(session.access_token)
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
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12">
      <div className="w-full max-w-lg">

        {/* Brand header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-zinc-900">Venue Voice</h1>
          <p className="mt-1 text-sm text-zinc-500">Let&apos;s get your account set up</p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <StepIndicator current={2} labels={STEP_LABELS} />

          {isLapsed ? (
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
                <Button className="w-full" onClick={handleSubscribe} disabled={loading}>
                  {loading ? "Redirecting…" : "Resubscribe"}
                </Button>
                <Button variant="outline" className="w-full" onClick={handleManageBilling} disabled={loading}>
                  Manage billing
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-6 text-center">
                <h2 className="text-xl font-semibold text-zinc-900">Choose your plan</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Start with a 7-day free trial. No charge until the trial ends.
                </p>
              </div>

              <PlanCard
                name="Venue Voice Pro"
                price="$49"
                billingCycle="per month"
                trialLabel="7-day free trial"
                features={PLAN_FEATURES}
                onSelect={handleSubscribe}
                loading={loading}
              />

              {error && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SubscribePage() {
  return (
    <>
      <CrispChat />
      <AuthGuard>
        <EmailVerifiedGuard>
          <OnboardingGuard>
            <SubscribePageContent />
          </OnboardingGuard>
        </EmailVerifiedGuard>
      </AuthGuard>
    </>
  )
}
