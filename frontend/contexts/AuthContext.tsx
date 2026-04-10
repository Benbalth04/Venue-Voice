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
import { fetchUser, setApiCompanyId, type MembershipSummary, type UserResponse } from "@/lib/api/client"

const ACTIVE_COMPANY_KEY = "vv_active_company_id"

function resolveActiveCompanyId(
  memberships: MembershipSummary[],
  stored: string | null
): string | null {
  if (memberships.length === 0) return null
  if (memberships.length === 1) return memberships[0].company_id
  // Prefer stored value if still valid
  if (stored && memberships.some((m) => m.company_id === stored)) return stored
  // Prefer owner > admin > first
  const owner = memberships.find((m) => m.role === "company_owner")
  if (owner) return owner.company_id
  const admin = memberships.find((m) => m.role === "company_admin")
  return admin ? admin.company_id : memberships[0].company_id
}

type AuthContextType = {
  loading: boolean
  session: Session | null
  user: UserResponse | null
  memberships: MembershipSummary[]
  activeCompanyId: string | null
  activeMembership: MembershipSummary | null
  setActiveCompanyId: (id: string) => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  loading: true,
  session: null,
  user: null,
  memberships: [],
  activeCompanyId: null,
  activeMembership: null,
  setActiveCompanyId: () => {},
  refreshUser: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<UserResponse | null>(null)
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null)
  /** Supabase auth user id we last completed fetchUser for; avoids stale closures in onAuthStateChange. */
  const loadedAuthUserIdRef = useRef<string | null>(null)

  function applyUser(me: UserResponse) {
    setUser(me)
    loadedAuthUserIdRef.current = me.id
    const memberships = me.memberships ?? []
    const stored =
      typeof window !== "undefined"
        ? localStorage.getItem(ACTIVE_COMPANY_KEY)
        : null
    const resolved = resolveActiveCompanyId(memberships, stored)
    setActiveCompanyIdState(resolved)
    setApiCompanyId(resolved)
    if (resolved && typeof window !== "undefined") {
      localStorage.setItem(ACTIVE_COMPANY_KEY, resolved)
    }
  }

  const setActiveCompanyId = useCallback((id: string) => {
    setActiveCompanyIdState(id)
    setApiCompanyId(id)
    if (typeof window !== "undefined") {
      localStorage.setItem(ACTIVE_COMPANY_KEY, id)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (cancelled) return

      setSession(nextSession)

      if (!nextSession) {
        loadedAuthUserIdRef.current = null
        setUser(null)
        setActiveCompanyIdState(null)
        setApiCompanyId(null)
        setLoading(false)
        return
      }

      const authUserId = nextSession.user.id
      const sameUserAlreadyLoaded =
        loadedAuthUserIdRef.current !== null && loadedAuthUserIdRef.current === authUserId

      if (sameUserAlreadyLoaded) {
        try {
          const me = await fetchUser(nextSession.access_token)
          if (!cancelled) applyUser(me)
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
        if (!cancelled) applyUser(me)
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
      setActiveCompanyIdState(null)
      setApiCompanyId(null)
      return
    }
    try {
      const me = await fetchUser(s.access_token)
      applyUser(me)
    } catch {
      loadedAuthUserIdRef.current = null
      setUser(null)
    }
  }, [])

  const memberships = user?.memberships ?? []
  const activeMembership = activeCompanyId
    ? (memberships.find((m) => m.company_id === activeCompanyId) ?? null)
    : null

  return (
    <AuthContext.Provider
      value={{
        loading,
        session,
        user,
        memberships,
        activeCompanyId,
        activeMembership,
        setActiveCompanyId,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
