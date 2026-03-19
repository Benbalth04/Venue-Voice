"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Bell, User } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { fetchUser, fetchHasUnreadReviews } from "@/lib/api/client"

export function Topbar() {
  const [companyName, setCompanyName] = useState<string>("")
  const [displayName, setDisplayName] = useState<string>("")
  const [hasUnread, setHasUnread] = useState(false)

  const loadUnread = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return
    try {
      const { has_unread } = await fetchHasUnreadReviews(session.access_token)
      setHasUnread(has_unread)
    } catch {
      setHasUnread(false)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token || !mounted) return

      try {
        const me = await fetchUser(session.access_token)
        if (!mounted) return
        setCompanyName(me.company_name ?? "")
        setDisplayName(
          me.user_display_name ?? (`${me.first_name} ${me.last_name}`.trim() || "User")
        )
      } catch {
        if (mounted) setDisplayName("User")
      }
    }

    load()
  }, [])

  useEffect(() => {
    loadUnread()
    const interval = setInterval(loadUnread, 60_000)
    return () => clearInterval(interval)
  }, [loadUnread])

  return (
    <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
      <div>
        <div className="text-lg font-semibold text-zinc-900">
          {companyName || "—"}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/analytics"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-zinc-50 text-zinc-500 hover:bg-zinc-100"
          aria-label={hasUnread ? "Notifications (unread reviews)" : "Notifications"}
        >
          <Bell className="h-4 w-4" />
          {hasUnread && (
            <span className="absolute right-1 top-1 inline-flex h-2 w-2 rounded-full bg-violet-500" aria-hidden />
          )}
        </Link>
        <div className="flex items-center gap-2 rounded-full bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700">
          <User className="h-4 w-4" />
          <span>{displayName || "—"}</span>
        </div>
      </div>
    </header>
  )
}

