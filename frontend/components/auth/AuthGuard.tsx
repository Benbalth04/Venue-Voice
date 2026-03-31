"use client"

import { useRouter } from "next/navigation"
import { useEffect, type ReactNode } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { CrispChat } from "@/components/crisp/CrispChat"

export function AuthGuard({ children }: { children: ReactNode }) {
  const { loading, session } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !session) {
      router.replace("/login")
    }
  }, [loading, session, router])

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        Loading...
      </div>
    )
  }

  return (
    <>
      <CrispChat />
      {children}
    </>
  )
}