"use client"

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase/client"
import { fetchNewResponses } from "@/lib/api/client"
import { useAuth } from "@/contexts/AuthContext"

// Maximum individual toasts shown per poll before grouping into a batch toast
const INDIVIDUAL_TOAST_LIMIT = 3
const POLL_INTERVAL_MS = 30_000

// Context is intentionally empty — this provider is side-effect only (toasts)
const NewResponseNotificationsContext = createContext<null>(null)

export function NewResponseNotificationsProvider({ children }: { children: ReactNode }) {
  const { activeCompanyId } = useAuth()
  const router = useRouter()

  // Tracks the ISO timestamp of the last successful poll; initialized to "now"
  // so responses that predate the current session are never shown.
  const lastCheckedAtRef = useRef<string>(new Date().toISOString())

  // Deduplicates response IDs across overlapping poll windows within a session.
  const seenIdsRef = useRef<Set<string>>(new Set())

  // Reset notification state whenever the user switches companies so stale
  // notifications from the previous company do not bleed into the new context.
  useEffect(() => {
    lastCheckedAtRef.current = new Date().toISOString()
    seenIdsRef.current = new Set()
  }, [activeCompanyId])

  useEffect(() => {
    async function poll() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) return

      const since = lastCheckedAtRef.current
      const requestTime = new Date().toISOString()

      try {
        const { responses } = await fetchNewResponses(session.access_token, since)

        // Advance the cursor only on success — keeps the window intact on failure
        // so the next poll retries from the same point (dedup Set prevents double-shows).
        lastCheckedAtRef.current = requestTime

        const novel = responses.filter((r) => !seenIdsRef.current.has(r.response_id))
        if (novel.length === 0) return

        // Register all new IDs before showing toasts (guard against rapid re-renders)
        for (const r of novel) {
          seenIdsRef.current.add(r.response_id)

          // Prune the Set if it grows very large (long-lived sessions with many responses)
          if (seenIdsRef.current.size > 1000) {
            const oldest = seenIdsRef.current.values().next().value
            if (oldest !== undefined) {
              seenIdsRef.current.delete(oldest)
            }
          }
        }

        const individual = novel.slice(0, INDIVIDUAL_TOAST_LIMIT)
        const overflow = novel.length - individual.length

        for (const r of individual) {
          toast("New response received", {
            description: `${r.survey_name} · ${r.location_name}`,
            duration: 6_000,
            action: {
              label: "View",
              onClick: () => router.push("/dashboard/analytics/view_responses"),
            },
          })
        }

        if (overflow > 0) {
          toast("New responses received", {
            description: `+${overflow} more response${overflow === 1 ? "" : "s"} at your locations`,
            duration: 6_000,
            action: {
              label: "View all",
              onClick: () => router.push("/dashboard/analytics/view_responses"),
            },
          })
        }
      } catch {
        // Silently ignore errors — the cursor is not advanced so the next poll retries
      }
    }

    const initialLoad = setTimeout(() => {
      void poll()
    }, 0)

    const interval = setInterval(() => {
      void poll()
    }, POLL_INTERVAL_MS)

    return () => {
      clearTimeout(initialLoad)
      clearInterval(interval)
    }
  }, [activeCompanyId, router])

  return (
    <NewResponseNotificationsContext.Provider value={null}>
      {children}
    </NewResponseNotificationsContext.Provider>
  )
}

// Exported for completeness; nothing consumes it currently
export function useNewResponseNotifications() {
  return useContext(NewResponseNotificationsContext)
}
