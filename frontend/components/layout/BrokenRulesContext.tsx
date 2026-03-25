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
import { fetchCompanyBrokenRuleSummary } from "@/lib/api/client"

type BrokenRulesContextValue = {
  brokenRuleCount: number
  refreshBrokenRuleCount: () => Promise<void>
}

const BrokenRulesContext = createContext<BrokenRulesContextValue | null>(null)

export function BrokenRulesProvider({ children }: { children: ReactNode }) {
  const [brokenRuleCount, setBrokenRuleCount] = useState(0)

  const refreshBrokenRuleCount = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      setBrokenRuleCount(0)
      return
    }

    try {
      const { broken_rule_count } = await fetchCompanyBrokenRuleSummary(session.access_token)
      setBrokenRuleCount(Math.max(0, broken_rule_count))
    } catch {
      setBrokenRuleCount(0)
    }
  }, [])

  useEffect(() => {
    const initialLoad = setTimeout(() => {
      void refreshBrokenRuleCount()
    }, 0)
    const interval = setInterval(() => {
      void refreshBrokenRuleCount()
    }, 60_000)
    return () => {
      clearTimeout(initialLoad)
      clearInterval(interval)
    }
  }, [refreshBrokenRuleCount])

  const value = useMemo(
    () => ({ brokenRuleCount, refreshBrokenRuleCount }),
    [brokenRuleCount, refreshBrokenRuleCount],
  )

  return <BrokenRulesContext.Provider value={value}>{children}</BrokenRulesContext.Provider>
}

export function useBrokenRules() {
  const context = useContext(BrokenRulesContext)
  if (!context) {
    throw new Error("useBrokenRules must be used within BrokenRulesProvider")
  }
  return context
}
