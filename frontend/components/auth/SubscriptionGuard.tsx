"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, type ReactNode } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { fetchSubscription, type SubscriptionResponse } from "@/lib/api/client"

export function SubscriptionGuard({ children }: { children: ReactNode }) {
  const { loading: authLoading, session } = useAuth()
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [isActive, setIsActive] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!session?.access_token) {
      // AuthGuard (which runs before this) handles the redirect to /login.
      // Just stop checking so we don't flash a redirect to /subscribe.
      setChecking(false)
      return
    }

    fetchSubscription(session.access_token)
      .then((sub: SubscriptionResponse) => {
        if (sub.is_active) {
          setIsActive(true)
        } else {
          router.replace("/subscribe")
        }
      })
      .catch(() => {
        // On error (e.g. network failure) redirect to subscribe to be safe
        router.replace("/subscribe")
      })
      .finally(() => setChecking(false))
  }, [authLoading, session, router])

  if (authLoading || checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        Loading...
      </div>
    )
  }

  if (!isActive) return null

  return children
}
