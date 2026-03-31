"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronDown, Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import {
  AUSTRALIA_TIMEZONE_OPTIONS,
  DEFAULT_USER_TIMEZONE,
} from "@/lib/timezone/australia"
import { SingleSelectDropdown } from "@/components/ui/DropdownSelect"
import { patchUserTimezone, extractErrorMessage } from "@/lib/api/client"
import { supabase } from "@/lib/supabase/client"

export function ProfileSettingsMenu() {
  const { user, refreshUser } = useAuth()
  const [open, setOpen] = useState(false)
  const [tzSaving, setTzSaving] = useState(false)
  const [tzError, setTzError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const displayName = user
    ? (user.user_display_name ??
        `${user.first_name} ${user.last_name}`.trim()) || "User"
    : "—"

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close()
    }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, close])

  async function onTimezoneChange(next: string) {
    setTzError(null)
    setTzSaving(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) {
        setTzError("Not signed in")
        return
      }
      await patchUserTimezone(token, next)
      await refreshUser()
      close()
    } catch (e: unknown) {
      setTzError(extractErrorMessage(e))
    } finally {
      setTzSaving(false)
    }
  }

  const tz = user?.timezone ?? DEFAULT_USER_TIMEZONE
  const plan = user?.subscription_plan_name ?? null

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="max-w-[140px] truncate">{displayName}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-zinc-200 bg-white py-2 shadow-lg"
        >
          <div className="border-b border-zinc-100 px-3 pb-2 pt-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              Subscription
            </p>
            <p className="mt-0.5 text-sm text-zinc-800">{plan ?? "None"}</p>
          </div>

          <div className="px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              Timezone
            </p>
            {tzSaving ? (
              <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving…
              </div>
            ) : (
              <SingleSelectDropdown
                className="mt-1.5"
                options={AUSTRALIA_TIMEZONE_OPTIONS}
                value={tz}
                onChange={onTimezoneChange}
                placeholder="Select timezone"
              />
            )}
            {tzError && (
              <p className="mt-1 text-xs text-red-600" role="alert">
                {tzError}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
