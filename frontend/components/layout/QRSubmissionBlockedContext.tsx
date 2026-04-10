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
import { fetchQRSubmissionBlockedSummary } from "@/lib/api/client"

type QRSubmissionBlockedContextValue = {
  submissionBlockedActiveQrCount: number
  refreshSubmissionBlockedQrCount: () => Promise<void>
}

const QRSubmissionBlockedContext = createContext<QRSubmissionBlockedContextValue | null>(null)

export function QRSubmissionBlockedProvider({ children }: { children: ReactNode }) {
  const [submissionBlockedActiveQrCount, setSubmissionBlockedActiveQrCount] = useState(0)

  const refreshSubmissionBlockedQrCount = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      setSubmissionBlockedActiveQrCount(0)
      return
    }

    try {
      const { submission_blocked_active_qr_count } = await fetchQRSubmissionBlockedSummary(
        session.access_token,
      )
      setSubmissionBlockedActiveQrCount(Math.max(0, submission_blocked_active_qr_count))
    } catch {
      setSubmissionBlockedActiveQrCount(0)
    }
  }, [])

  useEffect(() => {
    const initialLoad = setTimeout(() => {
      void refreshSubmissionBlockedQrCount()
    }, 0)
    const interval = setInterval(() => {
      void refreshSubmissionBlockedQrCount()
    }, 60_000)
    return () => {
      clearTimeout(initialLoad)
      clearInterval(interval)
    }
  }, [refreshSubmissionBlockedQrCount])

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void refreshSubmissionBlockedQrCount()
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => document.removeEventListener("visibilitychange", onVisibilityChange)
  }, [refreshSubmissionBlockedQrCount])

  const value = useMemo(
    () => ({ submissionBlockedActiveQrCount, refreshSubmissionBlockedQrCount }),
    [submissionBlockedActiveQrCount, refreshSubmissionBlockedQrCount],
  )

  return (
    <QRSubmissionBlockedContext.Provider value={value}>{children}</QRSubmissionBlockedContext.Provider>
  )
}

export function useQRSubmissionBlocked() {
  const context = useContext(QRSubmissionBlockedContext)
  if (!context) {
    throw new Error("useQRSubmissionBlocked must be used within QRSubmissionBlockedProvider")
  }
  return context
}
