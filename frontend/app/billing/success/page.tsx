"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"

const COUNTDOWN_SECONDS = 5

export default function BillingSuccessPage() {
  const router = useRouter()
  const { refreshUser } = useAuth()
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)

  useEffect(() => {
    // Refresh user in the background so subscription state is up to date
    refreshUser().catch(() => {/* ignore errors */})

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
  }, [])

  useEffect(() => {
    if (countdown === 0) {
      router.replace("/dashboard")
    }
  }, [countdown, router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-10 shadow-sm text-center">

        {/* Success icon */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-zinc-900">You&apos;re all set!</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Thank you for signing up for Venue Voice. Your account is being activated.
        </p>

        {/* Countdown */}
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
