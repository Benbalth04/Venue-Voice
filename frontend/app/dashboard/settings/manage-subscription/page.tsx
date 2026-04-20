"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Check, MapPin, ArrowRight, Zap } from "lucide-react"
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
} from "@/lib/subscription/plans"
import { formatIsoInUserTimeZone } from "@/lib/datetime/formatInUserTz"
import { DEFAULT_USER_TIMEZONE } from "@/lib/timezone/australia"

const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  active:           { label: "Active",       classes: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  trialing:         { label: "Free Trial",   classes: "text-violet-700 bg-violet-50 border-violet-200" },
  pending_cancel:   { label: "Canceling",    classes: "text-amber-700 bg-amber-50 border-amber-200" },
  past_due:         { label: "Past Due",     classes: "text-red-700 bg-red-50 border-red-200" },
  canceled:         { label: "Canceled",     classes: "text-zinc-600 bg-zinc-50 border-zinc-200" },
  incomplete:       { label: "Incomplete",   classes: "text-zinc-600 bg-zinc-50 border-zinc-200" },
  incomplete_expired: { label: "Expired",   classes: "text-zinc-600 bg-zinc-50 border-zinc-200" },
  unpaid:           { label: "Unpaid",       classes: "text-red-700 bg-red-50 border-red-200" },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, classes: "text-zinc-600 bg-zinc-50 border-zinc-200" }
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.classes}`}>
      {cfg.label}
    </span>
  )
}

/** IANA zone from profile (never browser default). Empty API values fall back to app default. */
function resolveUserIanaZone(timezone: string | null | undefined): string {
  const t = timezone?.trim()
  return t ? t : DEFAULT_USER_TIMEZONE
}

const SUBSCRIPTION_DATE_TIME_OPTS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
}

/** Format an API instant in the signed-in user’s saved timezone. */
function formatInstantInUserZone(iso: string, timeZone: string): string {
  const out = formatIsoInUserTimeZone(iso, timeZone, SUBSCRIPTION_DATE_TIME_OPTS)
  return out === "—" ? iso : out
}

/** Same as above when the instant may be missing (e.g. Stripe did not send period end). */
function formatBillingPeriodEnd(iso: string | null | undefined, timeZone: string): string {
  if (iso == null || iso === "") return "the end of your billing period"
  return formatInstantInUserZone(iso, timeZone)
}

export default function ManageSubscriptionPage() {
  const router = useRouter()
  const { session, user, activeMembership } = useAuth()
  const isOwner = activeMembership?.role === "company_owner"
  const userTimeZone = resolveUserIanaZone(user?.timezone)

  const [sub, setSub] = useState<SubscriptionResponse | null>(null)
  const [pageLoading, setPageLoading] = useState(true)
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

  const locationCount = sub?.location_count ?? null
  const isMonthly = sub?.billing_interval === "monthly"
  const isYearly = sub?.billing_interval === "yearly"

  const monthlyTotal = locationCount != null ? locationCount * LOCATION_PRICE_MONTHLY : null
  const yearlyTotal = locationCount != null ? locationCount * LOCATION_PRICE_YEARLY_TOTAL : null
  const annualSavings = locationCount != null ? locationCount * (LOCATION_PRICE_MONTHLY * 12 - LOCATION_PRICE_YEARLY_TOTAL) : null

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Page header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Manage Subscription</h1>
          <p className="mt-1 text-sm text-zinc-500">
            View your current plan and make changes via the billing portal.
          </p>
        </div>
        {isOwner && (
          <Button variant="outline" onClick={handleOpenPortal} disabled={portalLoading} className="shrink-0 text-sm">
            {portalLoading ? "Redirecting…" : "Invoices & payment"}
          </Button>
        )}
      </div>

      {/* Non-owner notice */}
      {!isOwner && (
        <div className="mb-5 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          Only the company owner can manage billing.
        </div>
      )}

      {/* Cancellation warning */}
      {sub?.cancel_at_period_end && (
        <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-800">
            Your subscription cancels on{" "}
            <span className="font-medium">
              {formatBillingPeriodEnd(sub.current_period_end, userTimeZone)}
            </span>
            . Open the portal to reactivate.
          </p>
          <Button variant="outline" onClick={handleOpenPortal} disabled={portalLoading} className="shrink-0 px-3 py-1.5 text-xs">
            Reactivate
          </Button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Sync check */}
      {isOwner && (
        <div className="mb-6">
          <Button variant="outline" onClick={handleSyncCheck} disabled={syncLoading} className="text-sm">
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
        <div className="space-y-4">

          {/* Current plan card */}
          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-violet-500 to-violet-400" />
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Current plan</p>
                {sub?.status && <StatusBadge status={sub.status} />}
              </div>

              <div className="flex items-end gap-6">
                {/* Location count */}
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100">
                    <MapPin className="h-5 w-5 text-violet-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-extrabold text-zinc-900 leading-none">
                      {locationCount ?? "—"}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {locationCount === 1 ? "location" : "locations"}
                    </p>
                  </div>
                </div>

                {/* Billing details */}
                {(isMonthly || isYearly) && monthlyTotal != null && yearlyTotal != null && (
                  <div className="border-l border-zinc-100 pl-6">
                    {isMonthly ? (
                      <div>
                        <p className="text-2xl font-extrabold text-zinc-900 leading-none">
                          ${monthlyTotal}<span className="text-base font-medium text-zinc-400">/mo</span>
                        </p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          ${LOCATION_PRICE_MONTHLY} per location · billed monthly
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-2xl font-extrabold text-zinc-900 leading-none">
                          ${yearlyTotal}<span className="text-base font-medium text-zinc-400">/yr</span>
                        </p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          ${LOCATION_PRICE_YEARLY_TOTAL} per location · billed annually
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Trial end notice */}
              {sub?.status === "trialing" && sub.trial_end && (
                <p className="mt-4 text-sm text-violet-700 bg-violet-50 rounded-lg px-3 py-2">
                  Your free trial ends on{" "}
                  <span className="font-medium">{formatInstantInUserZone(sub.trial_end, userTimeZone)}</span>.
                </p>
              )}
            </div>
          </div>

          {/* CTA: Add more locations */}
          {isOwner && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-zinc-900">Need more locations?</p>
                <p className="text-sm text-zinc-500 mt-0.5">
                  Add locations to your plan and only pay for what you need.
                  {locationCount != null && isMonthly && (
                    <span className="text-zinc-400"> Each additional location is ${LOCATION_PRICE_MONTHLY}/month.</span>
                  )}
                  {locationCount != null && isYearly && (
                    <span className="text-zinc-400"> Each additional location is ${LOCATION_PRICE_YEARLY_MONTHLY_EQUIV}/month (billed annually).</span>
                  )}
                </p>
              </div>
              <Button onClick={handleOpenPortal} disabled={portalLoading} className="shrink-0 bg-violet-600 hover:bg-violet-700 text-white gap-1.5">
                {portalLoading ? "Redirecting…" : (
                  <>Add locations <ArrowRight className="h-3.5 w-3.5" /></>
                )}
              </Button>
            </div>
          )}

          {/* CTA: Switch to yearly (only when on monthly) */}
          {isOwner && isMonthly && annualSavings != null && annualSavings > 0 && (
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5 flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Zap className="h-3.5 w-3.5 text-violet-600" />
                  <p className="text-sm font-semibold text-violet-900">Save ${annualSavings}/year with annual billing</p>
                </div>
                <p className="text-sm text-violet-700">
                  Switch to yearly and pay ${LOCATION_PRICE_YEARLY_MONTHLY_EQUIV}/location/month — 20% less than monthly.
                </p>
              </div>
              <Button onClick={handleOpenPortal} disabled={portalLoading} variant="outline" className="shrink-0 border-violet-300 text-violet-700 hover:bg-violet-100 gap-1.5">
                {portalLoading ? "Redirecting…" : (
                  <>Switch to yearly <ArrowRight className="h-3.5 w-3.5" /></>
                )}
              </Button>
            </div>
          )}

          {/* CTA: Switch to monthly (only when on yearly, softer) */}
          {isOwner && isYearly && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-zinc-900">Want to switch to monthly?</p>
                <p className="text-sm text-zinc-500 mt-0.5">
                  Monthly billing gives you more flexibility at ${LOCATION_PRICE_MONTHLY}/location/month.
                </p>
              </div>
              <Button onClick={handleOpenPortal} disabled={portalLoading} variant="outline" className="shrink-0 gap-1.5">
                {portalLoading ? "Redirecting…" : (
                  <>Switch to monthly <ArrowRight className="h-3.5 w-3.5" /></>
                )}
              </Button>
            </div>
          )}

          {/* Features */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-4">Everything included</p>
            <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-3">
              {LOCATION_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-sm text-zinc-700">
                  <span className="mt-0.5 shrink-0 flex items-center justify-center w-4 h-4 rounded-full bg-violet-100">
                    <Check className="w-2.5 h-2.5 text-violet-600 stroke-[3]" />
                  </span>
                  {feature}
                </li>
              ))}
            </ul>
          </div>

        </div>
      )}
    </div>
  )
}
