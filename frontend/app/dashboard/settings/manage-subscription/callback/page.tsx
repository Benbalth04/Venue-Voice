"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { AuthGuard } from "@/components/auth/AuthGuard"

const REDIRECT_DELAY_MS = 5000

function PortalCallbackContent() {
  const router = useRouter()
  const { session, refreshUser } = useAuth()
  const [countdown, setCountdown] = useState(5)

  useEffect(() => {
    let cancelled = false

    async function run() {
      const token = session?.access_token
      if (token) {
        try {
          await refreshUser()
        } catch {
          /* webhooks sync subscription state — ignore refresh errors */
        }
      }

      if (!cancelled) {
        const timer = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) {
              clearInterval(timer)
              return 0
            }
            return prev - 1
          })
        }, 1000)

        setTimeout(() => {
          if (!cancelled) {
            router.replace("/dashboard/settings/manage-subscription")
          }
        }, REDIRECT_DELAY_MS)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [session?.access_token, refreshUser, router])

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
        <h1 className="text-xl font-semibold text-zinc-900">Updating your subscription…</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Hang tight — we&apos;re syncing your changes. You&apos;ll be redirected in {countdown} second{countdown !== 1 ? "s" : ""}.
        </p>
      </div>
    </div>
  )
}

export default function PortalCallbackPage() {
  return (
    <AuthGuard>
      <PortalCallbackContent />
    </AuthGuard>
  )
}
