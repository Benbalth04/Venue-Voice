"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { recordCheckoutFailed } from "@/lib/api/client"
import { Button } from "@/components/ui/button"

export default function BillingFailedPage() {
  const router = useRouter()
  const { session } = useAuth()

  useEffect(() => {
    // Record the abandoned/failed checkout if the user is authenticated
    if (session?.access_token) {
      recordCheckoutFailed(session.access_token).catch(() => {/* ignore */})
    }
  }, [session])

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-10 shadow-sm text-center">

        {/* Error icon */}
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
        </div>
      </div>
    </div>
  )
}
