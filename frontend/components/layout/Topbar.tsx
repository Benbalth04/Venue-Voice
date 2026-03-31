"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Bell, X } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { useUnreadResponses } from "@/components/layout/UnreadResponsesContext"
import { useBrokenRules } from "@/components/layout/BrokenRulesContext"
import { useBrokenFlows } from "@/components/layout/BrokenFlowsContext"
import { useQRSubmissionBlocked } from "@/components/layout/QRSubmissionBlockedContext"
import { ProfileSettingsMenu } from "@/components/layout/ProfileSettingsMenu"

export function Topbar() {
  const { user } = useAuth()
  const { unreadCount } = useUnreadResponses()
  const { brokenRuleCount } = useBrokenRules()
  const { brokenFlowCount } = useBrokenFlows()
  const { submissionBlockedActiveQrCount } = useQRSubmissionBlocked()

  const [flowDismissedAtCount, setFlowDismissedAtCount] = useState<number | null>(null)
  const [ruleDismissedAtCount, setRuleDismissedAtCount] = useState<number | null>(null)
  const [qrDismissedAtCount, setQrDismissedAtCount] = useState<number | null>(null)

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- reset dismiss when issue count clears */
    if (brokenFlowCount === 0) setFlowDismissedAtCount(null)
    if (brokenRuleCount === 0) setRuleDismissedAtCount(null)
    if (submissionBlockedActiveQrCount === 0) setQrDismissedAtCount(null)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [brokenFlowCount, brokenRuleCount, submissionBlockedActiveQrCount])

  const showFlowBanner =
    brokenFlowCount > 0 && flowDismissedAtCount !== brokenFlowCount
  const showRuleBanner =
    brokenRuleCount > 0 && ruleDismissedAtCount !== brokenRuleCount
  const showQrBanner =
    submissionBlockedActiveQrCount > 0 &&
    qrDismissedAtCount !== submissionBlockedActiveQrCount

  function dismissFlowBanner() {
    setFlowDismissedAtCount(brokenFlowCount)
  }
  function dismissRuleBanner() {
    setRuleDismissedAtCount(brokenRuleCount)
  }
  function dismissQrBanner() {
    setQrDismissedAtCount(submissionBlockedActiveQrCount)
  }

  const companyName = user?.company_name ?? ""
  const qrBannerMessage =
    submissionBlockedActiveQrCount === 1
      ? "There is 1 active QR code that cannot accept submissions. Ensure the survey assignment is active."
      : `There are ${submissionBlockedActiveQrCount} active QR codes that cannot accept submissions. Ensure the survey assignment is active.`

  return (
    <>
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
        <div>
          <div className="text-lg font-semibold text-zinc-900">
            {companyName || "—"}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/analytics/view_responses"
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-zinc-50 text-zinc-500 hover:bg-zinc-100"
            aria-label={unreadCount > 0 ? "Notifications (unread reviews)" : "Notifications"}
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 inline-flex h-2 w-2 rounded-full bg-violet-500" aria-hidden />
            )}
          </Link>
          <ProfileSettingsMenu />
        </div>
      </header>

      {showFlowBanner && (
        <div className="flex items-center gap-3 border-b border-red-200 bg-red-50 px-6 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              {brokenFlowCount} flow{brokenFlowCount !== 1 ? "s are" : " is"} broken — {brokenFlowCount !== 1 ? "they" : "it"} cannot run until fixed
            </span>
          </div>
          <Link
            href="/dashboard/automations/flows"
            className="shrink-0 text-xs font-medium text-red-700 underline underline-offset-2 hover:text-red-900"
          >
            Go to Flows
          </Link>
          <button
            type="button"
            onClick={dismissFlowBanner}
            className="shrink-0 rounded-lg p-1 text-red-600 hover:bg-red-100"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {showRuleBanner && (
        <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-6 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-amber-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              {brokenRuleCount} rule{brokenRuleCount !== 1 ? "s are" : " is"} broken — {brokenRuleCount === 1 ? "it" : "they"} cannot run until fixed
            </span>
          </div>
          <Link
            href="/dashboard/automations/rules"
            className="shrink-0 text-xs font-medium text-amber-700 underline underline-offset-2 hover:text-amber-900"
          >
            Go to Rules
          </Link>
          <button
            type="button"
            onClick={dismissRuleBanner}
            className="shrink-0 rounded-lg p-1 text-amber-600 hover:bg-amber-100"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {showQrBanner && (
        <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-6 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-amber-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{qrBannerMessage}</span>
          </div>
          <Link
            href="/dashboard/distribution/qr_codes"
            className="shrink-0 text-xs font-medium text-amber-700 underline underline-offset-2 hover:text-amber-900"
          >
            Go to QR Codes
          </Link>
          <button
            type="button"
            onClick={dismissQrBanner}
            className="shrink-0 rounded-lg p-1 text-amber-600 hover:bg-amber-100"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  )
}
