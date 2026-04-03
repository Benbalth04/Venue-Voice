"use client"

import { useRouter } from "next/navigation"
import { useEffect, type ReactNode } from "react"
import { useAuth } from "@/contexts/AuthContext"

/** Only for users who are signed in but have not verified email yet. */
export function UnverifiedEmailGuard({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user?.email_verified) {
      router.replace(user.onboarding_complete ? "/dashboard" : "/onboarding")
    }
  }, [loading, user, router])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        Loading...
      </div>
    )
  }

  // No session yet (e.g. just signed up, pending email confirmation) — show the page.
  if (!user) {
    return children
  }

  if (user.email_verified) {
    return null
  }

  return children
}
