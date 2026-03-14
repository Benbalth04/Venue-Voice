"use client"

import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"
import { fetchMe } from "@/lib/api/client"

export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let mounted = true

    async function check() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!mounted) return

      if (!session) {
        router.replace("/login")
        return
      }

      try {
        const me = await fetchMe(session.access_token)
        if (!mounted) return
        if (!me.onboarding_complete) {
          router.replace("/onboarding")
          return
        }
      } catch {
        if (mounted) router.replace("/login")
        return
      }

      setReady(true)
    }

    check()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/login")
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [router])

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        Loading...
      </div>
    )
  }

  return children
}

