"use client"

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import type { Session } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase/client"
import { fetchUser, type UserResponse } from "@/lib/api/client"

type AuthContextType = {
  loading: boolean
  session: Session | null
  user: UserResponse | null
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  loading: true,
  session: null,
  user: null,
  refreshUser: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<UserResponse | null>(null)

  useEffect(() => {
    let cancelled = false

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (event, nextSession) => {
        if (cancelled) return

        setSession(nextSession)

        // Tab focus / background refresh — update JWT only; keep dashboard mounted.
        if (event === "TOKEN_REFRESHED") {
          return
        }

        if (!nextSession) {
          setUser(null)
          setLoading(false)
          return
        }

        // Profile sync without blanking the whole app (e.g. metadata updates).
        if (event === "USER_UPDATED" || event === "MFA_CHALLENGE_VERIFIED") {
          try {
            const me = await fetchUser(nextSession.access_token)
            if (!cancelled) setUser(me)
          } catch {
            if (!cancelled) setUser(null)
          }
          return
        }

        setLoading(true)
        try {
          const me = await fetchUser(nextSession.access_token)
          if (!cancelled) setUser(me)
        } catch {
          if (!cancelled) setUser(null)
        } finally {
          if (!cancelled) setLoading(false)
        }
      },
    )

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const refreshUser = async () => {
    const {
      data: { session: s },
    } = await supabase.auth.getSession()
    if (!s) {
      setUser(null)
      return
    }
    try {
      const me = await fetchUser(s.access_token)
      setUser(me)
    } catch {
      setUser(null)
    }
  }

  return (
    <AuthContext.Provider value={{ loading, session, user, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
