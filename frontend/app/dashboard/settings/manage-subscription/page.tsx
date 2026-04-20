"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { BillingToggle } from "@/components/subscription/BillingToggle"
import { Button } from "@/components/ui/button"
import { Check } from "lucide-react"
import {
  createPortalSession,
  extractErrorMessage,
  fetchSubscription,
  syncSubscription,
  type SubscriptionResponse,
} from "@/lib/api/client"
import {
  LOCATION_FEATURES,
  LOCATION_PRICE_MONTHLY,
  LOCATION_PRICE_YEARLY_MONTHLY_EQUIV,
  LOCATION_PRICE_YEARLY_TOTAL,
  type BillingInterval,
} from "@/lib/subscription/plans"
import { DEFAULT_USER_TIMEZONE } from "@/lib/timezone/australia"

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

export default function ManageSubscriptionPage() {
  const router = useRouter()
  const { session, user, activeMembership } = useAuth()
  const isOwner = activeMembership?.role === "company_owner"
  const userTimeZone = user?.timezone ?? DEFAULT_USER_TIMEZONE
  const [sub, setSub] = useState<SubscriptionResponse | null>(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [billing, setBilling] = useState<BillingInterval>("monthly")
  const [portalLoading, setPortalLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [syncIsError, setSyncIsError] = useState(false)

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

  async function handleSyncCheck() {
    if (!session?.access_token) return
    setSyncLoading(true)
    setSyncMessage(null)
    setSyncIsError(false)
    try {
      const result = await syncSubscription(session.access_token)
      if (!result.sync_successful) {
        setSyncMessage("We couldn't reach Stripe right now. Please wait a moment and try again.")
        setSyncIsError(false)
      } else if (result.is_active) {
        router.replace("/dashboard")
      } else {
        setSyncMessage("Subscription still not active. If you believe this is an error, please contact support.")
        setSyncIsError(false)
      }
    } catch (err) {
      setSyncMessage(extractErrorMessage(err, "Unable to check subscription status. Please try again."))
      setSyncIsError(true)
    } finally {
      setSyncLoading(false)
    }
  }

  const isYearly = billing === "yearly"
  const displayPerLocation = isYearly ? LOCATION_PRICE_YEARLY_MONTHLY_EQUIV : LOCATION_PRICE_MONTHLY

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Manage Subscription</h1>
          <p className="mt-1 text-sm text-zinc-500">
            View your current plan and make changes via the billing portal.
          </p>
        </div>
        {isOwner && (
          <Button variant="outline" onClick={handleOpenPortal} disabled={portalLoading} className="shrink-0">
            {portalLoading ? "Redirecting…" : "Manage payment methods & invoices"}
          </Button>
        )}
      </div>

      {!isOwner && (
        <div className="mb-5 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          Only the company owner can manage billing.
        </div>
      )}

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

      {isOwner && (
        <div className="mb-5">
          <Button
            variant="outline"
            onClick={handleSyncCheck}
            disabled={syncLoading}
            className="text-sm"
          >
            {syncLoading ? "Checking…" : "Already paid? Check subscription status"}
          </Button>
          {syncMessage && (
            <p className={`mt-2 text-sm ${syncIsError ? "text-red-600" : "text-zinc-500"}`}>
              {syncMessage}
            </p>
          )}
        </div>
      )}

      {pageLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
        </div>
      ) : (
        <div className="relative bg-white rounded-2xl border border-zinc-200 shadow-xl overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-violet-500 to-violet-400" />
          <div className="p-8 flex flex-col items-center text-center">

            <div className="text-xl font-extrabold text-zinc-900 mb-1">Simple Per-location Pricing</div>
            <p className="text-sm text-zinc-500 mb-6">Scale up or down as your business grows</p>

            <BillingToggle value={billing} onChange={setBilling} />

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

            {isOwner && (
              <Button
                onClick={handleOpenPortal}
                disabled={portalLoading}
                variant="outline"
                className="w-full max-w-sm"
              >
                {portalLoading ? "Redirecting…" : "Manage subscription"}
              </Button>
            )}

            <p className="text-xs text-zinc-400 mt-3">
              To add or remove locations, open the billing portal.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
