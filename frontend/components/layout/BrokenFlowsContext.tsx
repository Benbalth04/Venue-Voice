"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { supabase } from "@/lib/supabase/client"
import { fetchCompanyBrokenFlowSummary } from "@/lib/api/client"

type BrokenFlowsContextValue = {
  brokenFlowCount: number
  refreshBrokenFlowCount: () => Promise<void>
}

const BrokenFlowsContext = createContext<BrokenFlowsContextValue | null>(null)

export function BrokenFlowsProvider({ children }: { children: ReactNode }) {
  const [brokenFlowCount, setBrokenFlowCount] = useState(0)

  const refreshBrokenFlowCount = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      setBrokenFlowCount(0)
      return
    }

    try {
      const { broken_flow_count } = await fetchCompanyBrokenFlowSummary(session.access_token)
      setBrokenFlowCount(Math.max(0, broken_flow_count))
    } catch {
      setBrokenFlowCount(0)
    }
  }, [])

  useEffect(() => {
    const initialLoad = setTimeout(() => {
      void refreshBrokenFlowCount()
    }, 0)
    const interval = setInterval(() => {
      void refreshBrokenFlowCount()
    }, 60_000)
    return () => {
      clearTimeout(initialLoad)
      clearInterval(interval)
    }
  }, [refreshBrokenFlowCount])

  const value = useMemo(
    () => ({ brokenFlowCount, refreshBrokenFlowCount }),
    [brokenFlowCount, refreshBrokenFlowCount],
  )

  return <BrokenFlowsContext.Provider value={value}>{children}</BrokenFlowsContext.Provider>
}

export function useBrokenFlows() {
  const context = useContext(BrokenFlowsContext)
  if (!context) {
    throw new Error("useBrokenFlows must be used within BrokenFlowsProvider")
  }
  return context
}
