"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { AuthGuard } from "@/components/auth/AuthGuard"
import { Button } from "@/components/ui/button"
import { extractErrorMessage, verifyCheckoutSession } from "@/lib/api/client"

const COUNTDOWN_SECONDS = 5

function BillingSuccessContent() {
  const router = useRouter()
  const params = useSearchParams()
  const checkoutSessionId = params.get("session_id")
  const { session, refreshUser } = useAuth()
  const [phase, setPhase] = useState<"verifying" | "error" | "success">("verifying")
  const [errorMessage, setErrorMessage] = useState("")
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)

  useEffect(() => {
    let cancelled = false

    async function verify() {
      const sid = checkoutSessionId?.trim()
      if (!sid) {
        setPhase("error")
        setErrorMessage(
          "Missing checkout session. Open billing from your account to complete payment."
        )
        return
      }

      const token = session?.access_token
      if (!token) {
        setPhase("error")
        setErrorMessage("You need to be signed in to confirm this payment.")
        return
      }

      try {
        await verifyCheckoutSession(token, sid)
        if (!cancelled) {
          refreshUser().catch(() => {
            /* ignore */
          })
          setPhase("success")
        }
      } catch (err) {
        if (!cancelled) {
          setPhase("error")
          setErrorMessage(
            extractErrorMessage(err) ?? "We couldn't confirm your payment. Please try again."
          )
        }
      }
    }

    void verify()
    return () => {
      cancelled = true
    }
  }, [checkoutSessionId, session?.access_token, refreshUser])

  useEffect(() => {
    if (phase !== "success") return

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [phase])

  useEffect(() => {
    if (phase === "success" && countdown === 0) {
      router.replace("/dashboard?tour=1")
    }
  }, [phase, countdown, router])

  if (phase === "verifying") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-10 shadow-sm text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-violet-100">
            <svg className="h-8 w-8 animate-spin text-violet-700" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-zinc-900">Confirming your payment…</h1>
          <p className="mt-2 text-sm text-zinc-500">This only takes a moment.</p>
        </div>
      </div>
    )
  }

  if (phase === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-10 shadow-sm text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
            <svg className="h-8 w-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-zinc-900">Couldn&apos;t confirm payment</h1>
          <p className="mt-3 text-sm text-zinc-500">{errorMessage}</p>
          <div className="mt-8 flex flex-col gap-3">
            <Button className="w-full" onClick={() => router.replace("/subscribe")}>
              Back to billing
            </Button>
            <Link className="text-sm font-medium text-violet-700 hover:underline" href="/dashboard">
              Go to dashboard
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-10 shadow-sm text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-zinc-900">You&apos;re all set!</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Thank you for signing up for Venue Voice. Your account is being activated.
        </p>

        <div className="mt-8">
          <div className="relative mx-auto h-16 w-16">
            <svg className="h-16 w-16 -rotate-90 text-violet-200" viewBox="0 0 64 64" fill="none">
              <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" />
              <circle
                cx="32"
                cy="32"
                r="28"
                stroke="currentColor"
                strokeWidth="4"
                strokeDasharray={`${2 * Math.PI * 28}`}
                strokeDashoffset={`${2 * Math.PI * 28 * (1 - countdown / COUNTDOWN_SECONDS)}`}
                className="text-violet-600 transition-all duration-1000"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xl font-bold text-violet-700">
              {countdown}
            </span>
          </div>
          <p className="mt-3 text-sm text-zinc-500">Getting your account ready…</p>
        </div>

        <p className="mt-6 text-xs text-zinc-400">
          You will be redirected to your dashboard automatically.
        </p>
      </div>
    </div>
  )
}

export default function BillingSuccessPage() {
  return (
    <AuthGuard>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-zinc-50">
            Loading...
          </div>
        }
      >
        <BillingSuccessContent />
      </Suspense>
    </AuthGuard>
  )
}
