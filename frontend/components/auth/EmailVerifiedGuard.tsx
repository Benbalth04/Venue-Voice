"use client"

import { useRouter } from "next/navigation"
import { useEffect, type ReactNode } from "react"
import { useAuth } from "@/contexts/AuthContext"

export function EmailVerifiedGuard({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user && !user.email_verified) {
      router.replace("/verify-email")
    }
  }, [loading, user, router])

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        Loading...
      </div>
    )
  }

  if (!user.email_verified) {
    return null
  }

  return children
}
