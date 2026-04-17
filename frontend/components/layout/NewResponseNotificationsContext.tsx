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
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"
import { fetchNewResponses, type NewResponseNotification } from "@/lib/api/client"
import { useAuth } from "@/contexts/AuthContext"
import { ResponseNotificationStack } from "@/components/layout/ResponseNotificationToasts"

const MAX_VISIBLE_TOASTS = 3
const POLL_INTERVAL_MS = 30_000

const NewResponseNotificationsContext = createContext<null>(null)

function NewResponseNotificationsInner({
  children,
  activeCompanyId,
}: {
  children: ReactNode
  activeCompanyId: string | null
}) {
  const router = useRouter()
  const [queue, setQueue] = useState<NewResponseNotification[]>([])

  const lastCheckedAtRef = useRef<string>(new Date().toISOString())
  const seenIdsRef = useRef<Set<string>>(new Set())

  const dismiss = useCallback((responseId: string) => {
    setQueue((q) => q.filter((n) => n.response_id !== responseId))
  }, [])

  const goToResponses = useCallback(() => {
    router.push("/dashboard/analytics/view_responses")
  }, [router])

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

        lastCheckedAtRef.current = requestTime

        const novel = responses.filter((r) => !seenIdsRef.current.has(r.response_id))
        if (novel.length === 0) return

        for (const r of novel) {
          seenIdsRef.current.add(r.response_id)
          if (seenIdsRef.current.size > 1000) {
            const oldest = seenIdsRef.current.values().next().value
            if (oldest !== undefined) {
              seenIdsRef.current.delete(oldest)
            }
          }
        }

        const sorted = [...novel].sort(
          (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime(),
        )

        setQueue((q) => {
          const incoming = new Set(sorted.map((r) => r.response_id))
          return [...sorted, ...q.filter((n) => !incoming.has(n.response_id))]
        })
      } catch {
        // Cursor not advanced; next poll retries
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
  }, [activeCompanyId])

  const visible = queue.slice(0, MAX_VISIBLE_TOASTS)
  const overflowCount = Math.max(0, queue.length - MAX_VISIBLE_TOASTS)

  return (
    <>
      {children}
      <ResponseNotificationStack
        items={visible}
        overflowCount={overflowCount}
        onDismiss={dismiss}
        onView={goToResponses}
        onViewOverflow={goToResponses}
      />
    </>
  )
}

export function NewResponseNotificationsProvider({ children }: { children: ReactNode }) {
  const { activeCompanyId } = useAuth()
  return (
    <NewResponseNotificationsContext.Provider value={null}>
      <NewResponseNotificationsInner
        key={activeCompanyId ?? "no-company"}
        activeCompanyId={activeCompanyId}
      >
        {children}
      </NewResponseNotificationsInner>
    </NewResponseNotificationsContext.Provider>
  )
}

export function useNewResponseNotifications() {
  return useContext(NewResponseNotificationsContext)
}
