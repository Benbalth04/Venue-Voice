"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { recordCheckoutFailed, syncSubscription } from "@/lib/api/client"
import { extractErrorMessage } from "@/lib/api/errors"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { AuthShell } from "@/components/auth/AuthShell"
import { CrispChat } from "@/components/crisp/CrispChat"

function BillingFailedContent() {
  const router = useRouter()
  const params = useSearchParams()
  const { session } = useAuth()
  const sessionId = params.get("session_id")

  const [syncLoading, setSyncLoading] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [syncIsError, setSyncIsError] = useState(false)

  useEffect(() => {
    if (sessionId && session?.access_token) {
      recordCheckoutFailed(session.access_token).catch(() => {
        /* ignore */
      })
    }
  }, [sessionId, session?.access_token])

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
        setSyncMessage("No active subscription found. Please try again or contact support.")
        setSyncIsError(false)
      }
    } catch (err) {
      setSyncMessage(extractErrorMessage(err, "Unable to check subscription status. Please try again."))
      setSyncIsError(true)
    } finally {
      setSyncLoading(false)
    }
  }

  return (
    <AuthShell>
      <CrispChat />
      <Card className="w-full max-w-md p-10 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-zinc-900">Checkout incomplete</h1>
        <p className="mt-3 text-sm text-zinc-500">
          Something went wrong during the checkout process, or you cancelled before completing payment.
          Your account has not been charged.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Button className="w-full" onClick={() => router.replace("/subscribe")}>
            Try again
          </Button>
          <a
            href="mailto:support@venuevoice.com"
            className="text-sm font-medium text-violet-700 hover:underline"
          >
            Contact support
          </a>
          <Button
            variant="outline"
            className="w-full"
            disabled={syncLoading}
            onClick={handleSyncCheck}
          >
            {syncLoading ? "Checking…" : "Already paid? Check subscription status"}
          </Button>
        </div>

        {syncMessage && (
          <p className={`mt-4 text-sm ${syncIsError ? "text-red-600" : "text-zinc-500"}`}>
            {syncMessage}
          </p>
        )}
      </Card>
    </AuthShell>
  )
}

export default function BillingFailedPage() {
  return (
    <Suspense
      fallback={
        <AuthShell>
          <CrispChat />
          <p className="text-sm text-zinc-500">Loading…</p>
        </AuthShell>
      }
    >
      <BillingFailedContent />
    </Suspense>
  )
}
