"use client"

import { useRouter } from "next/navigation"
import { useEffect, type ReactNode } from "react"
import { useAuth } from "@/contexts/AuthContext"

export function OnboardingGuard({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user?.onboarding_complete === false) {
      router.replace("/onboarding")
    }
  }, [loading, user, router])

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        Loading...
      </div>
    )
  }

  return children
}