"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Bell, User } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { fetchUser } from "@/lib/api/client"
import { useUnreadResponses } from "@/components/layout/UnreadResponsesContext"
import { useBrokenRules } from "@/components/layout/BrokenRulesContext"

export function Topbar() {
  const [companyName, setCompanyName] = useState<string>("")
  const [displayName, setDisplayName] = useState<string>("")
  const { unreadCount } = useUnreadResponses()
  const { brokenRuleCount } = useBrokenRules()

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token) return

      try {
        const me = await fetchUser(session.access_token)
        setCompanyName(me.company_name ?? "")
        setDisplayName(
          me.user_display_name ?? (`${me.first_name} ${me.last_name}`.trim() || "User")
        )
      } catch {
        setDisplayName("User")
      }
    }

    load()
  }, [])

  return (
    <>
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
        <div>
          <div className="text-lg font-semibold text-zinc-900">
            {companyName || "—"}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/analytics/view_responses"
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-zinc-50 text-zinc-500 hover:bg-zinc-100"
            aria-label={unreadCount > 0 ? "Notifications (unread reviews)" : "Notifications"}
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 inline-flex h-2 w-2 rounded-full bg-violet-500" aria-hidden />
            )}
          </Link>
          <div className="flex items-center gap-2 rounded-full bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700">
            <User className="h-4 w-4" />
            <span>{displayName || "—"}</span>
          </div>
        </div>
      </header>

      {brokenRuleCount > 0 && (
        <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-6 py-2">
          <div className="flex items-center gap-2 text-sm text-amber-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              {brokenRuleCount} rule{brokenRuleCount !== 1 ? "s are" : " is"} broken — {brokenRuleCount == 1 ? "it" : "they"} cannot run until fixed
            </span>
          </div>
          <Link
            href="/dashboard/automations/rules"
            className="text-xs font-medium text-amber-700 underline underline-offset-2 hover:text-amber-900"
          >
            Go to Rules
          </Link>
        </div>
      )}
    </>
  )
}

