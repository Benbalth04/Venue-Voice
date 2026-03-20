"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { supabase } from "@/lib/supabase/client"
import { fetchUnreadResponseCount } from "@/lib/api/client"

type UnreadResponsesContextValue = {
  unreadCount: number
  refreshUnreadCount: () => Promise<void>
  markResponseRead: (responseId: string) => void
}

const UnreadResponsesContext = createContext<UnreadResponsesContextValue | null>(null)

export function UnreadResponsesProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0)
  const readResponseIdsRef = useRef(new Set<string>())

  const refreshUnreadCount = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      setUnreadCount(0)
      return
    }

    try {
      const { count } = await fetchUnreadResponseCount(session.access_token)
      setUnreadCount(Math.max(0, count))
    } catch {
      setUnreadCount(0)
    }
  }, [])

  const markResponseRead = useCallback((responseId: string) => {
    if (readResponseIdsRef.current.has(responseId)) return
    readResponseIdsRef.current.add(responseId)
    setUnreadCount((count) => Math.max(0, count - 1))
  }, [])

  useEffect(() => {
    const initialLoad = setTimeout(() => {
      void refreshUnreadCount()
    }, 0)
    const interval = setInterval(() => {
      void refreshUnreadCount()
    }, 60_000)
    return () => {
      clearTimeout(initialLoad)
      clearInterval(interval)
    }
  }, [refreshUnreadCount])

  const value = useMemo(
    () => ({
      unreadCount,
      refreshUnreadCount,
      markResponseRead,
    }),
    [markResponseRead, refreshUnreadCount, unreadCount],
  )

  return <UnreadResponsesContext.Provider value={value}>{children}</UnreadResponsesContext.Provider>
}

export function useUnreadResponses() {
  const context = useContext(UnreadResponsesContext)
  if (!context) {
    throw new Error("useUnreadResponses must be used within UnreadResponsesProvider")
  }
  return context
}
