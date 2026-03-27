"use client"

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { supabase } from "@/lib/supabase/client"
import { fetchUser } from "@/lib/api/client"

type AuthContextType = {
  loading: boolean
  session: any | null
  user: any | null
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
  const [session, setSession] = useState<any | null>(null)
  const [user, setUser] = useState<any | null>(null)

  useEffect(() => {
    async function init() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      setSession(session)

      if (session) {
        try {
          const me = await fetchUser(session.access_token)
          setUser(me)
        } catch {
          setUser(null)
        }
      }

      setLoading(false)
    }

    init()

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session)
        setLoading(true)

        if (!session) {
          setUser(null)
          setLoading(false)
          return
        }

        try {
          const me = await fetchUser(session.access_token)
          setUser(me)
        } catch {
          setUser(null)
        } finally {
          setLoading(false)
        }
      },
    )

    return () => sub.subscription.unsubscribe()
  }, [])

  const refreshUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setUser(null)
      return
    }
    try {
      const me = await fetchUser(session.access_token)
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