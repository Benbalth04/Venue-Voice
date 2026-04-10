"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/contexts/AuthContext"
import {
  fetchSubscriptionStatus,
  type SubscriptionStatusResponse,
} from "@/lib/api/client"

/**
 * SubscriptionWarningBanner
 *
 * Shown at the top of the dashboard when the account is over its plan limits
 * or has lost access to a feature due to a subscription downgrade.
 *
 * Fetches /me/subscription/status once on mount. Fails silently so a network
 * hiccup never breaks the dashboard. Dismissal is in-memory (banner reappears
 * on hard reload so the user is reminded to act).
 */
export function SubscriptionWarningBanner() {
  const { session, activeMembership } = useAuth()
  const isViewer = activeMembership?.role === "viewer"
  const [status, setStatus] = useState<SubscriptionStatusResponse | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const token = session?.access_token
    if (!token) return
    fetchSubscriptionStatus(token)
      .then(setStatus)
      .catch(() => {
        // Fail silently — banner is a UX courtesy, not mission-critical
      })
  }, [session?.access_token])

  if (!status || dismissed || status.warnings.length === 0) return null

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3">
      <div className="mx-auto flex max-w-screen-xl items-start justify-between gap-4">
        <div className="flex flex-1 flex-col gap-1">
          {status.warnings.map((warning, i) => (
            <p key={i} className="text-sm text-amber-800">
              <span className="font-semibold">⚠ </span>
              {warning.message}
            </p>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {!isViewer && (
            <Link
              href="/dashboard/settings/manage-subscription"
              className="whitespace-nowrap rounded-md bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800"
            >
              Upgrade plan
            </Link>
          )}
          <button
            onClick={() => setDismissed(true)}
            className="text-sm text-amber-700 underline hover:text-amber-900"
            aria-label="Dismiss subscription warning"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}
