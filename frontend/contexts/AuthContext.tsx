"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
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
  /** Supabase auth user id we last completed fetchUser for; avoids stale closures in onAuthStateChange. */
  const loadedAuthUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (cancelled) return

      setSession(nextSession)

      if (!nextSession) {
        loadedAuthUserIdRef.current = null
        setUser(null)
        setLoading(false)
        return
      }

      const authUserId = nextSession.user.id
      const sameUserAlreadyLoaded =
        loadedAuthUserIdRef.current !== null && loadedAuthUserIdRef.current === authUserId

      if (sameUserAlreadyLoaded) {
        try {
          const me = await fetchUser(nextSession.access_token)
          if (!cancelled) {
            setUser(me)
            loadedAuthUserIdRef.current = me.id
          }
        } catch {
          if (!cancelled) {
            setUser(null)
            loadedAuthUserIdRef.current = null
          }
        }
        return
      }

      setLoading(true)
      try {
        const me = await fetchUser(nextSession.access_token)
        if (!cancelled) {
          setUser(me)
          loadedAuthUserIdRef.current = me.id
        }
      } catch {
        if (!cancelled) {
          setUser(null)
          loadedAuthUserIdRef.current = null
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const refreshUser = useCallback(async () => {
    const {
      data: { session: s },
    } = await supabase.auth.getSession()
    if (!s) {
      loadedAuthUserIdRef.current = null
      setUser(null)
      return
    }
    try {
      const me = await fetchUser(s.access_token)
      setUser(me)
      loadedAuthUserIdRef.current = me.id
    } catch {
      loadedAuthUserIdRef.current = null
      setUser(null)
    }
  }, [])

  return (
    <AuthContext.Provider value={{ loading, session, user, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
